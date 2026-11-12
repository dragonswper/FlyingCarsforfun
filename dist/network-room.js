import {Simulation} from './physics.js';
import {RoomTransport} from './network-transport.js';
import {NET_PROTOCOL,NET_BUILD,MATCH_QUEUE,roomCode,normalizeCode,roomOptions,appearance,guestId,RemoteInputs,STATE_INTERVAL,packInputFrames} from './network-protocol.js';
import {makeState,GuestReplica,cleanEvents,validState} from './network-state.js';
import {ConnectionQuality,networkPreferences} from './network-quality.js';
import {playerName,chatText} from './social.js';
import {ChatHistory} from './chat-history.js';
const colors={blue:'#299bff',ivory:'#e8efec',violet:'#a985fc',mint:'#53dbbd'};
export const RECOVERY_MS=20000;
const secret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const validSecret=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

export class NetworkRoom{
 constructor({Transport=RoomTransport,clock=()=>performance.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),onChange=()=>{},onMatch=()=>{},onEvents=()=>{},onDisconnect=()=>{},onChat=()=>{},onChatState=()=>{}}={}){
  Object.assign(this,{Transport,clock,setTimer,clearTimer,onChange,onMatch,onEvents,onDisconnect,onChat,onChatState});this.status='idle';this.closed=false;this.matchmade=false;this.ready=false;this.remoteReady=false;this.rtt=0;this.hostPaused=false;this.matchId=null;this.peerHello=false;this.timers=new Set();this.lastReceive=clock();this.lastRealtimeAt=clock();this.quality=new ConnectionQuality();this.pings=new Map();this.pingId=0;this.preferences=networkPreferences();this.recovering=false;this.rematchWanted=false;this.remoteRematch=false;this.chatSeen=new Set();this.chatAt=-Infinity;this.remoteChatAt=-Infinity;this.chat=new ChatHistory({clock,setTimer,clearTimer,onChange:state=>{if(this.closed)return;this.onChatState(state);if(this.role==='host'&&this.connected)this.transport.send({t:'chat-state',state});}});
 }
 get connected(){return !this.closed&&!!this.transport?.open&&this.peerHello;}
 get active(){return this.connected&&!!this.matchId&&this.status==='playing';}
 change(status=this.status){this.status=status;this.onChange(this);}
 create(options,look){this.role='host';this.options=roomOptions(options);this.look=appearance(look);this.code=roomCode();this.begin();}
 join(code,look){this.role='guest';this.look=appearance(look);this.code=normalizeCode(code);this.begin();}
 matchmake(look,options={},queue=MATCH_QUEUE,preferences={}){this.role='auto';this.matchmade=true;this.options={...roomOptions(options),mode:'duel',coop:false,duration:300};this.look=appearance(look);this.queue=queue;this.preferences=networkPreferences(preferences);this.code=null;this.begin();}
 begin(){
  this.change('connecting');this.link();
 }
 link(){
  if(this.closed)return;const resuming=this.recovering;let transport;const current=()=>!this.closed&&this.transport===transport;
  transport=new this.Transport({onWaiting:()=>{if(current()&&!this.recovering)this.change('waiting');},onRole:role=>{if(current()&&!this.recovering&&this.matchmade){this.role=role;this.change('connecting');}},onOpen:()=>{if(current())this.open();},onPacket:packet=>{if(current())this.receive(packet);},onClose:reason=>{if(current())this.linkLost(reason);}});this.transport=transport;
  try{if(resuming)transport.connectQueue('flyingcarsforfun-resume-'+NET_BUILD+'-'+this.recoveryKey,this.role);else if(this.matchmade)transport.connectQueue(this.queue);else transport.connect(this.code,this.role);}catch(error){this.linkLost(error.message);}
  if(resuming&&current())this.attemptTimer=this.later(()=>{if(current()&&this.recovering)this.retryRecovery();},Math.min(18000,this.recoveryDeadline-this.clock()));
 }
 later(fn,ms){const id=this.setTimer(()=>{this.timers.delete(id);if(!this.closed)fn();},ms);id?.unref?.();this.timers.add(id);return id;}
 stopTimer(id){this.clearTimer(id);this.timers.delete(id);}
 clearTimers(){for(const id of this.timers)this.clearTimer(id);this.timers.clear();}
 open(){
  if(this.closed)return;
  this.lastReceive=this.clock();
  if(this.recovering)this.transport.send({t:'resume',protocol:NET_PROTOCOL,build:NET_BUILD,role:this.role,matchId:this.matchId,pendingMatch:this.pendingMatch||null,key:this.recoveryKey});
  else{this.transport.send({t:'hello',protocol:NET_PROTOCOL,build:NET_BUILD,role:this.role,matchmade:this.matchmade,look:this.look,network:this.preferences});this.later(()=>{if(!this.peerHello)this.fail('The other player did not complete the version check. Try a fresh room.');},8000);}
  this.startHeartbeat();
 }
 startHeartbeat(){this.stopTimer(this.heartbeat);this.heartbeat=this.later(()=>{if(!this.recovering&&this.clock()-this.lastReceive>(this.matchId?3000:15000)){this.linkLost('The other player stopped responding.');return;}if(this.connected){this.ping();this.transport.send({t:'probe'},true);}this.change();this.startHeartbeat();},1000);}
 ping(done){const id=++this.pingId,at=this.clock();this.pings.set(id,{at,done});while(this.pings.size>16)this.pings.delete(this.pings.keys().next().value);this.transport?.send({t:'ping',id,at,loss:this.quality.delivery.loss()});}
 checkConnection(){
  if(!this.connected)return Promise.reject(Error('The opponent disconnected. Still searching…'));
  return new Promise((resolve,reject)=>{const check={samples:[],reject};this.preflight=check;const finish=error=>{if(this.preflight!==check)return;this.preflight=null;this.stopTimer(check.timer);error?reject(error):resolve();};check.timer=this.later(()=>finish(Error('The opponent did not answer the ping check. Still searching…')),4000);
   for(let i=0;i<3;i++)this.ping(ms=>{if(this.preflight!==check)return;check.samples.push(ms);if(check.samples.length===3){const limit=Math.min(this.preferences.maxPing||Infinity,this.remotePreferences?.maxPing||Infinity),measured=Math.max(...check.samples);finish(measured>limit?Error(`Opponent ping was ${Math.round(measured)} ms (limit ${limit} ms). Still searching…`):null);}});
  });
 }
 receive(packet){
  if(this.closed)return;this.lastReceive=this.clock();if(Number.isSafeInteger(packet.w)&&packet.w>0)this.lastRealtimeAt=this.clock();this.quality.delivery.receive(packet.w);
  if(this.recovering){this.receiveRecovery(packet);return;}
  if(packet.t==='hello'){
   if(this.peerHello)return;
   if(packet.protocol!==NET_PROTOCOL||packet.build!==NET_BUILD){this.transport.send({t:'reject',reason:'version'});this.fail('Game versions differ. Both players should reload the game before joining.');return;}
   if(packet.role===(this.role)||!['host','guest'].includes(packet.role)||this.matchmade!==(packet.matchmade===true)){this.transport.send({t:'reject',reason:'room'});this.fail('That room is unavailable. Ask the host for a new code.');return;}
   this.remotePreferences=networkPreferences(packet.network);if(this.matchmade&&this.remotePreferences.region!==this.preferences.region){this.fail('The opponent selected a different region. Search again.');return;}
   this.peerHello=true;this.remoteLook=appearance(packet.look);if(this.role==='host'){this.recoveryKey=secret();this.transport.send({t:'room',options:this.options,hostLook:this.look,recoveryKey:this.recoveryKey,chatState:this.chat.state()});}this.change('lobby');return;
  }
  if(packet.t==='reject'){this.fail(packet.reason==='version'?'Game versions differ. Both players should reload the game.':'The room is unavailable. Ask the host for a fresh code.');return;}
  if(!this.peerHello)return;
  if(packet.t==='chat'){const text=chatText(packet.text);if(typeof packet.id!=='string'||packet.id.length>40||!text||this.chatSeen.has(packet.id)||this.clock()-this.remoteChatAt<700)return;this.remoteChatAt=this.clock();this.chatSeen.add(packet.id);while(this.chatSeen.size>64)this.chatSeen.delete(this.chatSeen.values().next().value);this.onChat({name:this.remoteLook.name,text});if(this.role==='host')this.chat.add({id:packet.id,name:this.remoteLook.name,text});return;}
  if(packet.t==='chat-state'){if(this.role==='guest')this.chat.replace(packet.state);return;}
  if(packet.t==='profile'){this.remoteLook.name=playerName(packet.name);const car=this.sim?.cars.find(car=>car.networkRole!==this.role&&car.networkRole);if(car)car.playerName=this.remoteLook.name;this.change();return;}
  if(packet.t==='ping'){this.quality.report(packet.loss);if(Number.isFinite(packet.at)&&Number.isSafeInteger(packet.id))this.transport.send({t:'pong',id:packet.id,at:packet.at});return;}
  if(packet.t==='pong'){const ping=this.pings.get(packet.id);if(ping&&ping.at===packet.at){this.pings.delete(packet.id);const ms=this.clock()-ping.at;this.rtt=Math.max(0,Math.min(9999,Math.round(ms)));this.quality.rtt(ms);ping.done?.(ms);}return;}
  if(packet.t==='bye'){this.fail(packet.reason==='next'?'Your opponent is searching for their next match.':'The other player left the match.');return;}
  if(packet.t==='room'&&this.role==='guest'&&!this.matchId){this.options=roomOptions(packet.options);if(this.matchmade&&(this.options.mode!=='duel'||this.options.duration!==300||this.options.coop)){this.fail('The opponent requested incompatible match settings.');return;}if(validSecret(packet.recoveryKey))this.recoveryKey=packet.recoveryKey;this.remoteLook=appearance(packet.hostLook);if(packet.chatState)this.chat.replace(packet.chatState);this.change('lobby');}
  else if(packet.t==='ready'&&this.role==='host'&&!this.matchId){this.remoteReady=packet.ready===true;this.change();}
  else if(packet.t==='start'&&this.role==='guest'&&this.options&&typeof packet.matchId==='string'&&/^[a-f0-9-]{36}$/.test(packet.matchId)){
   if(this.sim?.phase==='ended'&&!(this.rematchWanted&&this.remoteRematch)){this.fail('The opponent tried to rematch without your agreement.');return;}
   if(this.matchmade&&!this.ready&&!this.matchId){this.fail('The opponent tried to start before the vehicles were ready.');return;}
   if(this.matchId===packet.matchId){this.transport.send({t:'started',matchId:this.matchId});return;}this.prepare(packet.matchId);this.transport.send({t:'started',matchId:this.matchId});
  }else if(packet.t==='started'&&this.role==='host'&&this.pendingMatch&&packet.matchId===this.pendingMatch){const matchId=this.pendingMatch;this.pendingMatch=null;this.prepare(matchId);this.publish(true);}
  else if(packet.t==='pause'&&this.role==='guest'&&packet.matchId===this.matchId){this.hostPaused=packet.paused===true;if(packet.state)this.state(packet.state);this.replica.paused=this.hostPaused;if(this.hostPaused){this.replica.pending.length=0;this.replica.visualP.copy(this.sim.cars[this.sim.localPlayerId].p);this.replica.visualQ.copy(this.sim.cars[this.sim.localPlayerId].q);}this.change();}
  else if(packet.matchId===this.matchId&&this.matchId){
   if(packet.t==='rematch'&&this.sim.phase==='ended'&&!this.pendingMatch){this.remoteRematch=packet.wanted===true;this.change();this.maybeRematch();}
   else if(packet.t==='input'&&this.role==='host')this.remote.receive(packet.frames,this.clock());
   else if(packet.t==='state'&&this.role==='guest')this.state(packet);
   else if(packet.t==='events'&&this.role==='guest'&&packet.state?.matchId===this.matchId&&validState(packet.state,this.sim)){this.state(packet.state);this.onEvents(cleanEvents(packet.events));}
   else if(packet.t==='skip'&&this.role==='host'&&this.sim.phase==='goal'){this.sim.skipReplay();this.publish(true);}
  }
 }
 setReady(ready){if(this.role!=='guest'||!this.connected||!this.options||this.matchId)return;this.ready=!!ready;this.transport.send({t:'ready',ready:this.ready});this.change();}
 startMatch(){
  if(this.role!=='host'||!this.connected||this.recovering||(!this.remoteReady&&!this.matchId)||this.pendingMatch||this.sim?.phase==='ended'&&!(this.rematchWanted&&this.remoteRematch))return false;
  this.pendingMatch=crypto.randomUUID();this.hostPaused=false;this.change('starting');this.transport.send({t:'start',matchId:this.pendingMatch});const pending=this.pendingMatch;this.later(()=>{if(this.pendingMatch===pending)this.fail('The guest did not start the match. Create a new room.');},10000);return true;
 }
 prepare(matchId){
  this.rematchWanted=false;this.remoteRematch=false;
  this.matchId=matchId;this.hostPaused=false;this.sequence=0;this.lastPublish=-Infinity;this.lastInput=-Infinity;this.remote=new RemoteInputs();this.playerInputs=new Map();const remoteId=guestId(this.options),localId=this.role==='host'?0:remoteId;
  this.sim=new Simulation({...this.options,humanIds:[0,remoteId],matchmaking:this.matchmade});this.sim.localPlayerId=localId;
  for(const car of this.sim.cars){const role=car.id===0?'host':car.id===remoteId?'guest':null;if(!role)continue;car.networkRole=role;car.matchmade=this.matchmade;const look=role===this.role?this.look:this.remoteLook;car.playerName=look.name;car.appearance={body:look.body,color:look.paint==='blue'&&car.team===1?'#f39838':colors[look.paint]};}
  if(this.role==='guest')this.replica=new GuestReplica(this.sim,localId);this.change('playing');this.onMatch(this.sim,this);return this.sim;
 }
 state(packet){if(packet?.matchId===this.matchId&&this.replica?.receive(packet,this.clock()))this.lastStateAt=this.clock();}
 inputs(){this.playerInputs.set(guestId(this.options),this.remote.next(this.clock()));return this.playerInputs;}
 hostStep(input,dt){if(this.role!=='host'||!this.active||this.recovering||this.hostPaused)return false;this.sim.step(input,dt,this.inputs());return true;}
 guestStep(input){if(this.active&&!this.hostPaused&&!this.recovering)this.replica.step(input);}
 sendInputs(force=false){const now=this.clock();if(this.role!=='guest'||!this.active||this.hostPaused||!force&&now-this.lastInput<1000/60)return;this.lastInput=now;const frames=packInputFrames(this.replica.inputFrames());if(frames.length)this.transport.send({t:'input',matchId:this.matchId,frames},true);}
 snapshot(){return makeState(this.sim,++this.sequence,this.remote.ack,this.matchId);}
 publish(force=false){const now=this.clock();if(this.role!=='host'||!this.active||!force&&(this.hostPaused||this.sim.phase==='ended'||now-this.lastPublish<STATE_INTERVAL))return;this.lastPublish=now;this.transport.send(this.snapshot(),true);}
 events(events){if(this.role!=='host'||!this.active||!events.length)return;const filtered=cleanEvents(events.slice(0,24));if(filtered.length)this.transport.send({t:'events',matchId:this.matchId,state:this.snapshot(),events:filtered});}
 setPaused(paused){if(this.role!=='host'||this.closed||!this.matchId)return;this.hostPaused=!!paused;if(this.active)this.transport.send({t:'pause',matchId:this.matchId,paused:this.hostPaused,state:this.snapshot()});this.change();}
 skipReplay(){if(!this.active)return;if(this.role==='host'){this.sim.skipReplay();this.publish(true);}else this.transport.send({t:'skip',matchId:this.matchId});}
 requestRematch(wanted=true){if(!this.active||this.sim.phase!=='ended'||this.pendingMatch)return false;this.rematchWanted=!!wanted;this.transport.send({t:'rematch',matchId:this.matchId,wanted:this.rematchWanted});this.change();this.maybeRematch();return true;}
 sendChat(value){const text=chatText(value);if(!text||!this.connected||this.clock()-this.chatAt<800)return false;const id=crypto.randomUUID();if(!this.transport.send({t:'chat',id,text}))return false;this.chatAt=this.clock();this.onChat({name:this.look.name,text});if(this.role==='host')this.chat.add({id,name:this.look.name,text});return true;}
 updateProfile(name){this.look.name=playerName(name);const car=this.sim?.cars.find(car=>car.id===this.sim.localPlayerId);if(car)car.playerName=this.look.name;if(this.connected)this.transport.send({t:'profile',name:this.look.name});}
 maybeRematch(){if(this.role==='host'&&this.rematchWanted&&this.remoteRematch&&this.sim?.phase==='ended')this.startMatch();}
 linkLost(reason){if(this.closed)return;if(this.recovering){this.retryRecovery();return;}if(this.matchId&&validSecret(this.recoveryKey)){this.beginRecovery();return;}this.fail(reason);}
 stopLink(){const old=this.transport;this.transport=null;this.stopTimer(this.heartbeat);this.stopTimer(this.attemptTimer);old?.close();}
 beginRecovery(){
  if(this.closed||this.recovering)return;this.recovering=true;this.recoveryDeadline=this.clock()+RECOVERY_MS;this.peerHello=false;this.pings.clear();this.clearTimers();this.stopLink();this.remote&&(this.remote=new RemoteInputs());if(this.replica){this.replica.pending.length=0;this.replica.paused=true;}this.recoveryTick();this.link();
 }
 recoveryTick(){if(!this.recovering||this.closed)return;if(this.clock()>=this.recoveryDeadline){this.fail('Reconnection timed out after 20 seconds. The match has ended.');return;}this.change('reconnecting');this.recoveryTimer=this.later(()=>this.recoveryTick(),Math.min(250,this.recoveryDeadline-this.clock()));}
 retryRecovery(){if(!this.recovering||this.closed)return;this.stopLink();this.resumePeer=false;this.resumeStateReady=false;if(this.clock()>=this.recoveryDeadline){this.recoveryTick();return;}this.stopTimer(this.retryTimer);this.retryTimer=this.later(()=>this.link(),Math.min(1000,this.recoveryDeadline-this.clock()));}
 receiveRecovery(packet){
  if(this.clock()>=this.recoveryDeadline){this.recoveryTick();return;}
  const valid=packet.key===this.recoveryKey&&packet.matchId===this.matchId;
  if(packet.t==='resume'){
   const committed=this.role==='host'&&this.pendingMatch&&packet.matchId===this.pendingMatch,awaiting=this.role==='guest'&&packet.pendingMatch===this.matchId;
   if(packet.key!==this.recoveryKey||!valid&&!committed&&!awaiting||packet.protocol!==NET_PROTOCOL||packet.build!==NET_BUILD||packet.role===this.role||!['host','guest'].includes(packet.role)){this.fail('The returning player could not be verified.');return;}
   if(this.role==='host'&&this.pendingMatch){const pending=this.pendingMatch;this.pendingMatch=null;if(committed)this.prepare(pending);}
   this.resumePeer=true;if(this.role==='host'){this.remote=new RemoteInputs();this.playerInputs=new Map();if(!this.transport.send({t:'resume-state',matchId:this.matchId,key:this.recoveryKey,state:this.snapshot(),paused:this.hostPaused,hostVote:this.rematchWanted,guestVote:this.remoteRematch,chatState:this.chat.state()}))this.retryRecovery();}
  }else if(valid&&this.resumePeer){
   if(packet.t==='resume-leave'){this.fail('The other player left the match.');return;}
   if(packet.t==='resume-state'&&this.role==='guest'&&validState(packet.state,this.sim)&&packet.state.matchId===this.matchId){this.replica=new GuestReplica(this.sim,this.sim.localPlayerId);this.replica.receive(packet.state,this.clock());this.replica.visualP.copy(this.replica.predicted.p);this.replica.visualQ.copy(this.replica.predicted.q);this.replica.paused=true;this.hostPaused=packet.paused===true;this.rematchWanted=packet.guestVote===true;this.remoteRematch=packet.hostVote===true;this.sim.events.length=0;if(packet.chatState)this.chat.replace(packet.chatState);this.resumeStateReady=true;if(!this.transport.send({t:'resume-ready',matchId:this.matchId,key:this.recoveryKey}))this.retryRecovery();}
   else if(packet.t==='resume-ready'&&this.role==='host'){if(this.transport.send({t:'resume-go',matchId:this.matchId,key:this.recoveryKey}))this.completeRecovery();else this.retryRecovery();}
   else if(packet.t==='resume-go'&&this.role==='guest'&&this.resumeStateReady)this.completeRecovery();
  }
 }
 completeRecovery(){this.recovering=false;this.peerHello=true;this.resumePeer=false;this.resumeStateReady=false;this.lastReceive=this.clock();this.lastRealtimeAt=this.clock();this.lastInput=-Infinity;this.lastPublish=-Infinity;this.clearTimers();this.quality=new ConnectionQuality();this.pings.clear();if(this.replica)this.replica.paused=this.hostPaused;this.startHeartbeat();this.change('playing');if(this.role==='host'){this.transport.send({t:'pause',matchId:this.matchId,paused:this.hostPaused,state:this.snapshot()});this.publish(true);this.maybeRematch();}}
 fail(reason){if(this.closed)return;this.error=reason;this.close(false);this.status='error';this.onChange(this);this.onDisconnect(reason);}
 close(notify=true,reason='left'){if(this.closed)return;if(notify&&this.connected)this.transport.send({t:'bye',reason});else if(notify&&this.recovering&&this.transport?.open&&this.resumePeer)this.transport.send({t:'resume-leave',matchId:this.matchId,key:this.recoveryKey});this.closed=true;this.chat.dispose();this.preflight?.reject(Error('The opponent disconnected. Still searching…'));this.preflight=null;this.clearTimers();this.pings.clear();this.transport?.close();this.recovering=false;this.status='closed';}
}
