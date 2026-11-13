import {SIGNAL_URL,queueID,decodePacket,MAX_PACKET} from './network-protocol.js';
import {hasRelay,directServers,readConnectionInfo} from './network-route.js';
export const DIRECT_CONNECT_MS=4500;

// NetplayJS's public, game-agnostic queue bootstraps a WebRTC link. Its randomly
// selected initiator becomes the casual-match host; private rooms retain their
// explicitly selected game host independently of that signaling role.
export class RoomTransport{
 constructor({onWaiting=()=>{},onRole=()=>{},onOpen=()=>{},onPacket=()=>{},onClose=()=>{},WebSocketClass=globalThis.WebSocket,RTCClass=globalThis.RTCPeerConnection,signalURL=SIGNAL_URL,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  Object.assign(this,{onWaiting,onRole,onOpen,onPacket,onClose,WebSocketClass,RTCClass,signalURL,setTimer,clearTimer});this.closed=false;this.open=false;this.candidates=[];this.earlyPackets=[];this.signalChain=Promise.resolve();this.channels={};this.timers=new Set();this.connectionInfo={route:'unknown',protocol:null,networkPing:null};
 }
 timer(fn,ms){const id=this.setTimer(()=>{this.timers.delete(id);if(!this.closed)fn();},ms);this.timers.add(id);return id;}
 connect(code,role){
  this.code=code;this.begin(queueID(code),role);
 }
 connectQueue(queue,role='auto'){if(typeof queue!=='string'||!/^[a-zA-Z0-9._:-]{1,160}$/.test(queue))throw new Error('Invalid matchmaking queue.');this.begin(queue,role);}
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
   if(!this.pc&&Array.isArray(message.clientIDs)&&message.clientIDs.length===1){this.makePeer(message.clientIDs[0],true);await this.offer();}
  }else if(message.kind==='join-match'){
   if(!this.pc&&typeof message.hostID==='string')this.makePeer(message.hostID,false);
  }else if(message.kind==='peer-message'){
   if(message.sourceID!==this.peerID||!this.pc)return;
   if(message.type==='offer'){if(message.payload?.boostRelay===true)this.enableRelay(false);if(this.closed)return;await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);this.sendSignal({kind:'send-message',destinationID:this.peerID,type:'answer',payload:this.pc.localDescription});this.negotiated();}
   else if(message.type==='answer'){await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();this.negotiated();}
   else if(message.type==='candidate'){if(this.pc.remoteDescription&&this.candidateMatches(message.payload))await this.addCandidate(message.payload);else if(this.candidates.length<64)this.candidates.push(message.payload);}
  }else if(['server-error','match-request-failure','send-message-failure'].includes(message.kind))this.fail('The room connection failed. Ask the host for a fresh code.');
 }
 makePeer(peerID,initiator){
  if(this.closed)return;if(this.role==='auto'){this.role=initiator?'host':'guest';this.onRole(this.role);if(this.closed)return;}
  this.peerID=peerID;this.initiator=initiator;this.directFirst=hasRelay(this.iceServers);this.relayFallback=false;this.pc=new this.RTCClass({iceServers:this.directFirst?directServers(this.iceServers):this.iceServers});
  this.pc.onicecandidate=e=>{if(e.candidate)this.sendSignal({kind:'send-message',type:'candidate',destinationID:this.peerID,payload:e.candidate});};
  this.pc.onconnectionstatechange=()=>{const state=this.pc.connectionState;if(state==='failed'&&!this.open&&this.directFirst&&!this.relayFallback){this.enableRelay();return;}if(['failed','closed','disconnected'].includes(state)&&!this.closed)this.fail('The peer connection was interrupted.');};
  this.pc.ondatachannel=e=>this.attachChannel(e.channel);
  if(initiator){this.attachChannel(this.pc.createDataChannel('control',{ordered:true}));this.attachChannel(this.pc.createDataChannel('realtime',{ordered:false,maxRetransmits:0}));}
  this.peerDeadline(18000);
 }
 peerDeadline(ms){this.clearTimer(this.peerTimer);this.timers.delete(this.peerTimer);this.peerTimer=this.timer(()=>{if(!this.open)this.fail('The browsers could not establish a peer connection. Try another network or a self-hosted signaling/TURN service.');},ms);}
 negotiated(){if(this.closed||this.open||!this.directFirst||this.relayFallback||this.directTimer||!this.pc?.localDescription||!this.pc.remoteDescription||this.pc.signalingState&&this.pc.signalingState!=='stable')return;this.directTimer=this.timer(()=>this.enableRelay(),DIRECT_CONNECT_MS);}
 async offer(restart=false){const pc=this.pc;if(this.closed||!pc||restart&&this.open)return;const offer=await pc.createOffer(restart?{iceRestart:true}:undefined);if(this.closed||this.pc!==pc||restart&&this.open)return;await pc.setLocalDescription(offer);if(!this.closed&&this.pc===pc)this.sendSignal({kind:'send-message',destinationID:this.peerID,type:'offer',payload:restart?{type:pc.localDescription.type,sdp:pc.localDescription.sdp,boostRelay:true}:pc.localDescription});}
 enableRelay(negotiate=true){if(this.closed||this.open||!this.pc||!this.directFirst||this.relayFallback)return;if(negotiate&&'signalingState'in this.pc&&(this.pc.signalingState!=='stable'||!this.pc.localDescription||!this.pc.remoteDescription)){if(!this.relayWait)this.relayWait=this.timer(()=>{this.relayWait=null;this.enableRelay();},250);return;}this.relayFallback=true;this.peerDeadline(13500);try{this.pc.setConfiguration({iceServers:this.iceServers});if(negotiate&&this.initiator)this.signalChain=this.signalChain.then(()=>this.offer(true)).catch(()=>this.fail('The relay fallback could not be negotiated. Try another network.'));}catch{this.fail('This browser could not enable the relay fallback. Try a current desktop browser.');}}
 async refreshStats(){if(this.statsPending||!this.open||this.closed||typeof this.pc?.getStats!=='function')return;const pc=this.pc;this.statsPending=true;try{const report=await pc.getStats();if(!this.closed&&this.pc===pc)this.connectionInfo=readConnectionInfo(report);}catch{}finally{this.statsPending=false;}}
 candidateMatches(candidate){if(!candidate||typeof candidate!=='object')return false;const sdp=this.pc?.remoteDescription?.sdp||'',fragment=typeof candidate.usernameFragment==='string'?candidate.usernameFragment:typeof candidate.candidate==='string'?candidate.candidate.match(/(?:^| )ufrag ([^ ]+)/)?.[1]:null,fragments=[...sdp.matchAll(/^a=ice-ufrag:([^\r\n]+)/gm)].map(match=>match[1]);if(fragment&&fragments.length&&!fragments.includes(fragment))return false;const mids=[...sdp.matchAll(/^a=mid:([^\r\n]+)/gm)].map(match=>match[1]);return candidate?.sdpMid==null||!mids.length||mids.includes(String(candidate.sdpMid));}
 async addCandidate(candidate){if(this.closed||!this.pc)return;try{await this.pc.addIceCandidate(candidate);}catch{this.rejectedCandidates=(this.rejectedCandidates||0)+1;}}
 async flushCandidates(){for(const candidate of this.candidates.splice(0))if(this.candidateMatches(candidate))await this.addCandidate(candidate);}

 attachChannel(channel){
  if(this.closed||!['control','realtime'].includes(channel.label)||this.channels[channel.label]){channel.close();return;}this.channels[channel.label]=channel;
  channel.onmessage=e=>{const packet=decodePacket(e.data);if(!packet||this.closed)return;if(!this.open){if(this.earlyPackets.length<64)this.earlyPackets.push({packet,label:channel.label});}else this.onPacket(packet,channel.label);};
  channel.onopen=()=>{if(!this.closed&&!this.open&&Object.values(this.channels).filter(c=>c.readyState==='open').length===2){this.open=true;for(const id of this.timers)this.clearTimer(id);this.timers.clear();this.refreshStats();this.onOpen();for(const {packet,label}of this.earlyPackets.splice(0)){if(this.closed)break;this.onPacket(packet,label);}}};
  channel.onclose=()=>{if(!this.closed)this.fail('The other player left the room.');};channel.onerror=()=>{if(!this.closed)this.fail('The peer connection failed.');};
 }
 send(packet,realtime=false){
  if(this.closed)return false;const channel=this.channels[realtime?'realtime':'control'];if(channel?.readyState!=='open'||channel.bufferedAmount>(realtime?32768:131072))return false;
  const wire=realtime?(this.wireSequence||0)+1:null,data=JSON.stringify(realtime?{...packet,w:wire}:packet);if(data.length>MAX_PACKET)return false;try{channel.send(data);if(realtime)this.wireSequence=wire;return true;}catch{return false;}
 }
 fail(reason){if(this.closed)return;this.close();this.onClose(reason);}
 close(){if(this.closed)return;this.closed=true;this.open=false;this.earlyPackets.length=0;for(const id of this.timers)this.clearTimer(id);this.timers.clear();for(const channel of Object.values(this.channels)){channel.onclose=null;channel.close();}if(this.pc){this.pc.onconnectionstatechange=null;this.pc.close();}if(this.ws){this.ws.onclose=null;this.ws.onerror=null;this.ws.close();}}
}
