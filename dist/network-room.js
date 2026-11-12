import {Simulation} from './physics.js';
import {RoomTransport} from './network-transport.js';
import {NET_PROTOCOL,NET_BUILD,roomCode,normalizeCode,roomOptions,appearance,guestId,RemoteInputs,STATE_INTERVAL} from './network-protocol.js';
import {makeState,GuestReplica,cleanEvents,validState} from './network-state.js';
const colors={blue:'#299bff',ivory:'#e8efec',violet:'#a985fc',mint:'#53dbbd'};

export class NetworkRoom{
 constructor({Transport=RoomTransport,clock=()=>performance.now(),onChange=()=>{},onMatch=()=>{},onEvents=()=>{},onDisconnect=()=>{}}={}){
  Object.assign(this,{Transport,clock,onChange,onMatch,onEvents,onDisconnect});this.status='idle';this.closed=false;this.ready=false;this.remoteReady=false;this.rtt=0;this.hostPaused=false;this.matchId=null;this.peerHello=false;this.timers=new Set();this.lastReceive=clock();
 }
 get connected(){return !this.closed&&!!this.transport?.open&&this.peerHello;}
 get active(){return this.connected&&!!this.matchId&&this.status==='playing';}
 change(status=this.status){this.status=status;this.onChange(this);}
 create(options,look){this.role='host';this.options=roomOptions(options);this.look=appearance(look);this.code=roomCode();this.begin();}
 join(code,look){this.role='guest';this.look=appearance(look);this.code=normalizeCode(code);this.begin();}
 begin(){
  this.change('connecting');this.transport=new this.Transport({onWaiting:()=>this.change('waiting'),onOpen:()=>this.open(),onPacket:packet=>this.receive(packet),onClose:reason=>this.fail(reason)});
  try{this.transport.connect(this.code,this.role);}catch(error){this.fail(error.message);}
 }
 later(fn,ms){const id=setTimeout(()=>{this.timers.delete(id);if(!this.closed)fn();},ms);this.timers.add(id);return id;}
 open(){
  this.lastReceive=this.clock();this.transport.send({t:'hello',protocol:NET_PROTOCOL,build:NET_BUILD,role:this.role,look:this.look});
  this.later(()=>{if(!this.peerHello)this.fail('The other player did not complete the version check. Try a fresh room.');},8000);
  this.heartbeat=setInterval(()=>{if(this.closed)return;const now=this.clock();if(now-this.lastReceive>15000){this.fail('The other player stopped responding. Create or join a new room.');return;}this.transport.send({t:'ping',at:now});this.change();},1000);this.heartbeat.unref?.();
 }
 receive(packet){
  if(this.closed)return;this.lastReceive=this.clock();
  if(packet.t==='hello'){
   if(this.peerHello)return;
   if(packet.protocol!==NET_PROTOCOL||packet.build!==NET_BUILD){this.transport.send({t:'reject',reason:'version'});this.fail('Game versions differ. Both players should reload the game before joining.');return;}
   if(packet.role===(this.role)||!['host','guest'].includes(packet.role)){this.transport.send({t:'reject',reason:'room'});this.fail('That room is unavailable. Ask the host for a new code.');return;}
   this.peerHello=true;this.remoteLook=appearance(packet.look);if(this.role==='host')this.transport.send({t:'room',options:this.options,hostLook:this.look});this.change('lobby');return;
  }
  if(packet.t==='reject'){this.fail(packet.reason==='version'?'Game versions differ. Both players should reload the game.':'The room is unavailable. Ask the host for a fresh code.');return;}
  if(!this.peerHello)return;
  if(packet.t==='ping'){if(Number.isFinite(packet.at))this.transport.send({t:'pong',at:packet.at});return;}
  if(packet.t==='pong'){if(Number.isFinite(packet.at))this.rtt=Math.max(0,Math.min(9999,Math.round(this.clock()-packet.at)));return;}
  if(packet.t==='bye'){this.fail('The other player left the room. Create or join a new room.');return;}
  if(packet.t==='room'&&this.role==='guest'&&!this.matchId){this.options=roomOptions(packet.options);this.remoteLook=appearance(packet.hostLook);this.change('lobby');}
  else if(packet.t==='ready'&&this.role==='host'&&!this.matchId){this.remoteReady=packet.ready===true;this.change();}
  else if(packet.t==='start'&&this.role==='guest'&&this.options&&typeof packet.matchId==='string'&&/^[a-f0-9-]{36}$/.test(packet.matchId)){
   if(this.matchId===packet.matchId){this.transport.send({t:'started',matchId:this.matchId});return;}this.prepare(packet.matchId);this.transport.send({t:'started',matchId:this.matchId});
  }else if(packet.t==='started'&&this.role==='host'&&packet.matchId===this.pendingMatch){const matchId=this.pendingMatch;this.pendingMatch=null;this.prepare(matchId);this.publish(true);}
  else if(packet.t==='pause'&&this.role==='guest'&&packet.matchId===this.matchId){this.hostPaused=packet.paused===true;if(packet.state)this.state(packet.state);this.replica.paused=this.hostPaused;if(this.hostPaused){this.replica.pending.length=0;this.replica.visualP.copy(this.sim.cars[this.sim.localPlayerId].p);this.replica.visualQ.copy(this.sim.cars[this.sim.localPlayerId].q);}this.change();}
  else if(packet.matchId===this.matchId&&this.matchId){
   if(packet.t==='input'&&this.role==='host')this.remote.receive(packet.frames,this.clock());
   else if(packet.t==='state'&&this.role==='guest')this.state(packet);
   else if(packet.t==='events'&&this.role==='guest'&&packet.state?.matchId===this.matchId&&validState(packet.state,this.sim)){this.state(packet.state);this.onEvents(cleanEvents(packet.events));}
   else if(packet.t==='skip'&&this.role==='host'&&this.sim.phase==='goal'){this.sim.skipReplay();this.publish(true);}
  }
 }
 setReady(ready){if(this.role!=='guest'||!this.connected||!this.options||this.matchId)return;this.ready=!!ready;this.transport.send({t:'ready',ready:this.ready});this.change();}
 startMatch(){
  if(this.role!=='host'||!this.connected||(!this.remoteReady&&!this.matchId)||this.pendingMatch)return false;
  this.pendingMatch=crypto.randomUUID();this.hostPaused=false;this.change('starting');this.transport.send({t:'start',matchId:this.pendingMatch});const pending=this.pendingMatch;this.later(()=>{if(this.pendingMatch===pending)this.fail('The guest did not start the match. Create a new room.');},10000);return true;
 }
 prepare(matchId){
  this.matchId=matchId;this.hostPaused=false;this.sequence=0;this.lastPublish=-Infinity;this.lastInput=-Infinity;this.remote=new RemoteInputs();this.playerInputs=new Map();const remoteId=guestId(this.options),localId=this.role==='host'?0:remoteId;
  this.sim=new Simulation({...this.options,humanIds:[0,remoteId]});this.sim.localPlayerId=localId;
  for(const car of this.sim.cars){const role=car.id===0?'host':car.id===remoteId?'guest':null;if(!role)continue;car.networkRole=role;const look=role===this.role?this.look:this.remoteLook;car.appearance={body:look.body,color:look.paint==='blue'&&car.team===1?'#f39838':colors[look.paint]};}
  if(this.role==='guest')this.replica=new GuestReplica(this.sim,localId);this.change('playing');this.onMatch(this.sim,this);return this.sim;
 }
 state(packet){if(packet?.matchId===this.matchId&&this.replica?.receive(packet,this.clock()))this.lastStateAt=this.clock();}
 inputs(){this.playerInputs.set(guestId(this.options),this.remote.next(this.clock()));return this.playerInputs;}
 guestStep(input){if(!this.hostPaused)this.replica.step(input);}
 sendInputs(force=false){const now=this.clock();if(this.role!=='guest'||!this.active||this.hostPaused||!force&&now-this.lastInput<1000/60)return;this.lastInput=now;const frames=this.replica.inputFrames();if(frames.length)this.transport.send({t:'input',matchId:this.matchId,frames},true);}
 snapshot(){return makeState(this.sim,++this.sequence,this.remote.ack,this.matchId);}
 publish(force=false){const now=this.clock();if(this.role!=='host'||!this.active||!force&&(this.hostPaused||this.sim.phase==='ended'||now-this.lastPublish<STATE_INTERVAL))return;this.lastPublish=now;this.transport.send(this.snapshot(),true);}
 events(events){if(this.role!=='host'||!this.active||!events.length)return;const filtered=cleanEvents(events.slice(0,24));if(filtered.length)this.transport.send({t:'events',matchId:this.matchId,state:this.snapshot(),events:filtered});}
 setPaused(paused){if(this.role!=='host'||!this.active)return;this.hostPaused=!!paused;this.transport.send({t:'pause',matchId:this.matchId,paused:this.hostPaused,state:this.snapshot()});this.change();}
 skipReplay(){if(!this.active)return;if(this.role==='host'){this.sim.skipReplay();this.publish(true);}else this.transport.send({t:'skip',matchId:this.matchId});}
 fail(reason){if(this.closed)return;this.error=reason;this.close(false);this.status='error';this.onChange(this);this.onDisconnect(reason);}
 close(notify=true){if(this.closed)return;if(notify&&this.connected)this.transport.send({t:'bye'});this.closed=true;for(const id of this.timers)clearTimeout(id);this.timers.clear();clearInterval(this.heartbeat);this.transport?.close();this.status='closed';}
}
