import {SIGNAL_URL,queueID,decodePacket,MAX_PACKET} from './network-protocol.js';

// NetplayJS's public, game-agnostic queue bootstraps a WebRTC link. Its randomly
// selected initiator becomes the casual-match host; private rooms retain their
// explicitly selected game host independently of that signaling role.
export class RoomTransport{
 constructor({onWaiting=()=>{},onRole=()=>{},onOpen=()=>{},onPacket=()=>{},onClose=()=>{},WebSocketClass=globalThis.WebSocket,RTCClass=globalThis.RTCPeerConnection,signalURL=SIGNAL_URL}={}){
  Object.assign(this,{onWaiting,onRole,onOpen,onPacket,onClose,WebSocketClass,RTCClass,signalURL});this.closed=false;this.open=false;this.candidates=[];this.earlyPackets=[];this.signalChain=Promise.resolve();this.channels={};this.timers=new Set();
 }
 timer(fn,ms){const id=setTimeout(()=>{this.timers.delete(id);if(!this.closed)fn();},ms);this.timers.add(id);return id;}
 connect(code,role){
  this.code=code;this.begin(queueID(code),role);
 }
 connectQueue(queue){if(typeof queue!=='string'||!/^[a-zA-Z0-9._:-]{1,160}$/.test(queue))throw new Error('Invalid matchmaking queue.');this.begin(queue,'auto');}
 begin(queue,role){
  if(!this.WebSocketClass||!this.RTCClass)throw new Error('This browser does not support WebRTC multiplayer. Try a current desktop browser.');
  this.queue=queue;this.role=role;this.ws=new this.WebSocketClass(this.signalURL);this.timer(()=>{if(!this.registered)this.fail('The connection service did not respond. Try again.');},12000);
  this.ws.onmessage=event=>{this.signalChain=this.signalChain.then(()=>this.signal(event.data)).catch(()=>this.fail('The connection could not be negotiated. Please create a new room.'));};
  this.ws.onerror=()=>{if(!this.open)this.fail('The connection service is unavailable. Check your connection and try again.');};
  this.ws.onclose=()=>{if(!this.open&&!this.closed)this.fail('The connection service disconnected. Please try again.');};
  if(role==='guest')this.timer(()=>{if(!this.open)this.fail('Room not found, already full, or blocked by the network. Check the code and keep the host waiting in the lobby.');},25000);
  else this.timer(()=>{if(!this.open)this.fail('This unused room expired. Create a new room code.');},role==='auto'?65000:600000);
 }
 sendSignal(message){if(!this.closed&&this.ws?.readyState===1)this.ws.send(JSON.stringify(message));}
 async signal(raw){
  if(this.closed||typeof raw!=='string'||raw.length>65536)return;let message;try{message=JSON.parse(raw);}catch{return;}
  if(message.kind==='registration-success'){
   if(this.registered)return;if(typeof message.clientID!=='string'||!Array.isArray(message.iceServers))throw new Error('Invalid registration');this.registered=true;this.clientID=message.clientID;this.iceServers=message.iceServers;
   this.sendSignal({kind:'match-request',gameID:this.queue,minPlayers:2,maxPlayers:2});this.onWaiting();
  }else if(message.kind==='host-match'){
   if(!this.pc&&Array.isArray(message.clientIDs)&&message.clientIDs.length===1){this.makePeer(message.clientIDs[0],true);if(this.closed||!this.pc)return;const offer=await this.pc.createOffer();if(this.closed)return;await this.pc.setLocalDescription(offer);this.sendSignal({kind:'send-message',destinationID:this.peerID,type:'offer',payload:this.pc.localDescription});}
  }else if(message.kind==='join-match'){
   if(!this.pc&&typeof message.hostID==='string')this.makePeer(message.hostID,false);
  }else if(message.kind==='peer-message'){
   if(message.sourceID!==this.peerID||!this.pc)return;
   if(message.type==='offer'){await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);this.sendSignal({kind:'send-message',destinationID:this.peerID,type:'answer',payload:this.pc.localDescription});}
   else if(message.type==='answer'){await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();}
   else if(message.type==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(message.payload);else if(this.candidates.length<64)this.candidates.push(message.payload);}
  }else if(['server-error','match-request-failure','send-message-failure'].includes(message.kind))this.fail('The room connection failed. Ask the host for a fresh code.');
 }
 makePeer(peerID,initiator){
  if(this.closed)return;if(this.role==='auto'){this.role=initiator?'host':'guest';this.onRole(this.role);if(this.closed)return;}
  this.peerID=peerID;this.initiator=initiator;this.pc=new this.RTCClass({iceServers:this.iceServers});
  this.pc.onicecandidate=e=>{if(e.candidate)this.sendSignal({kind:'send-message',type:'candidate',destinationID:this.peerID,payload:e.candidate});};
  this.pc.onconnectionstatechange=()=>{const state=this.pc.connectionState;if(state==='failed'||state==='closed'){if(!this.closed)this.fail('The other player disconnected. Create or join a new room.');}else if(state==='disconnected')this.timer(()=>{if(this.pc?.connectionState==='disconnected')this.fail('The peer connection was lost. Create or join a new room.');},8000);};
  this.pc.ondatachannel=e=>this.attachChannel(e.channel);
  if(initiator){this.attachChannel(this.pc.createDataChannel('control',{ordered:true}));this.attachChannel(this.pc.createDataChannel('realtime',{ordered:false,maxRetransmits:0}));}
  this.timer(()=>{if(!this.open)this.fail('The browsers could not establish a peer connection. Try another network or a self-hosted signaling/TURN service.');},18000);
 }
 async flushCandidates(){for(const candidate of this.candidates.splice(0))await this.pc.addIceCandidate(candidate);}
 attachChannel(channel){
  if(this.closed||!['control','realtime'].includes(channel.label)||this.channels[channel.label]){channel.close();return;}this.channels[channel.label]=channel;
  channel.onmessage=e=>{const packet=decodePacket(e.data);if(!packet||this.closed)return;if(!this.open){if(this.earlyPackets.length<64)this.earlyPackets.push({packet,label:channel.label});}else this.onPacket(packet,channel.label);};
  channel.onopen=()=>{if(!this.closed&&!this.open&&Object.values(this.channels).filter(c=>c.readyState==='open').length===2){this.open=true;for(const id of this.timers)clearTimeout(id);this.timers.clear();this.onOpen();for(const {packet,label}of this.earlyPackets.splice(0)){if(this.closed)break;this.onPacket(packet,label);}}};
  channel.onclose=()=>{if(!this.closed)this.fail('The other player left the room.');};channel.onerror=()=>{if(!this.closed)this.fail('The peer connection failed.');};
 }
 send(packet,realtime=false){
  if(this.closed)return false;const channel=this.channels[realtime?'realtime':'control'];if(channel?.readyState!=='open'||channel.bufferedAmount>(realtime?32768:131072))return false;
  const data=JSON.stringify(packet);if(data.length>MAX_PACKET)return false;try{channel.send(data);return true;}catch{return false;}
 }
 fail(reason){if(this.closed)return;this.close();this.onClose(reason);}
 close(){if(this.closed)return;this.closed=true;this.open=false;this.earlyPackets.length=0;for(const id of this.timers)clearTimeout(id);this.timers.clear();for(const channel of Object.values(this.channels)){channel.onclose=null;channel.close();}if(this.pc){this.pc.onconnectionstatechange=null;this.pc.close();}if(this.ws){this.ws.onclose=null;this.ws.onerror=null;this.ws.close();}}
}
