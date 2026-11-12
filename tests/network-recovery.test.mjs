import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {NetworkRoom,RECOVERY_MS} from '../dist/network-room.js';
import {C} from '../dist/physics.js';
import {NET_BUILD} from '../dist/network-protocol.js';
import {DeliveryWindow,ConnectionQuality,networkPreferences,regionQueue} from '../dist/network-quality.js';
import {Matchmaker} from '../dist/matchmaking.js';
import {RoomTransport} from '../dist/network-transport.js';

class Clock{
 now=0;id=0;jobs=new Map();set=(fn,ms)=>{const id=++this.id;this.jobs.set(id,{at:this.now+ms,fn});return id;};clear=id=>this.jobs.delete(id);
 step(ms){const end=this.now+ms;for(;;){const due=[...this.jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;this.jobs.delete(due[0]);this.now=due[1].at;due[1].fn();}this.now=end;}
 async advance(ms){for(let left=ms;left>0;){const step=Math.min(250,left);this.step(step);left-=step;await settle();}}
}
async function game(t){
 const clock=new Clock(),queues=new Map(),links=[],errors=[],matches=[],hub={online:true,suppressClose:false,openDelay:0,failSend:()=>false,rewrite:packet=>packet};let pairs=0;
 function flush(){if(!hub.online)return;for(const [key,all]of queues){const available=all.filter(link=>!link.closed&&!link.peer);if(available.length<2)continue;const [a,b]=available;queues.delete(key);a.peer=b;b.peer=a;a.open=b.open=true;a.initiator=++pairs%2===1;b.initiator=!a.initiator;for(const link of [a,b])if(link.role==='auto'){link.role=link.initiator?'host':'guest';link.onRole(link.role);}const opened=()=>{if(!a.closed)a.onOpen();if(!b.closed)b.onOpen();};hub.openDelay?clock.set(opened,hub.openDelay):queueMicrotask(opened);}}
 class Transport{
  constructor(callbacks){Object.assign(this,callbacks);this.closed=false;this.open=false;links.push(this);}
  connect(code,role){this.connectQueue('private-'+code,role);}
  connectQueue(key,role='auto'){this.key=key;this.role=role;if(!queues.has(key))queues.set(key,[]);queues.get(key).push(this);this.onWaiting();queueMicrotask(flush);}
  send(packet,realtime=false){if(this.closed||!this.open||hub.failSend(packet,this))return false;const peer=this.peer,copy=hub.rewrite(structuredClone(packet),this);if(copy&&hub.online&&!peer.closed)queueMicrotask(()=>{if(!peer.closed)peer.onPacket(copy);});return true;}
  close(){if(this.closed)return;this.closed=true;this.open=false;if(queues.has(this.key)){const left=queues.get(this.key).filter(link=>link!==this&&!link.closed);left.length?queues.set(this.key,left):queues.delete(this.key);}const peer=this.peer;if(peer&&!peer.closed&&!hub.suppressClose)queueMicrotask(()=>{if(!peer.closed)peer.onClose('Accidental transport close.');});}
  crash(){this.close();this.onClose('Accidental transport close.');}
 }
 const options={Transport,clock:()=>clock.now,setTimer:clock.set,clearTimer:clock.clear,onMatch:sim=>matches.push(sim),onDisconnect:reason=>errors.push(reason)},host=new NetworkRoom(options),guest=new NetworkRoom(options);
 t.after(()=>{host.close();guest.close();});host.create({duration:300},{body:'bike',paint:'mint'});guest.join(host.code,{body:'octane',paint:'violet'});await settle();guest.setReady(true);await settle();host.startMatch();await settle();host.sim.phase='playing';host.publish(true);await settle();
 return {host,guest,clock,hub,queues,links,errors,matches,flush};
}

test('a new WebRTC link resumes the same simulation, score, clock and fixed roles with reversed signaling',async t=>{
 const h=await game(t),sim=h.host.sim,remoteSim=h.guest.sim,id=h.host.matchId,initiator=h.host.transport.initiator;sim.score=[2,1];sim.remaining=173;sim.cars[1].score=310;h.host.publish(true);await settle();const old=h.host.transport;h.hub.online=false;old.crash();await settle();assert.equal(h.host.recovering,true);assert.equal(h.host.hostStep({throttle:1},C.step),false);const before=h.guest.replica.inputSequence;h.guest.guestStep({boost:true});assert.equal(h.guest.replica.inputSequence,before);h.hub.online=true;h.flush();await settle();
 assert.equal(h.host.recovering,false);assert.equal(h.guest.recovering,false);assert.equal(h.host.sim,sim);assert.equal(h.guest.sim,remoteSim);assert.equal(h.host.matchId,id);assert.equal(h.guest.matchId,id);assert.deepEqual(h.guest.sim.score,[2,1]);assert.equal(h.guest.sim.remaining,173);assert.equal(h.guest.sim.cars[1].score,310);assert.notEqual(h.host.transport.initiator,initiator);assert.equal(h.host.role,'host');assert.equal(h.guest.role,'guest');assert.equal(h.guest.sim.localPlayerId,1);assert.equal(h.matches.length,2);assert.deepEqual(h.errors,[]);
 old.onPacket({t:'bye'});assert.equal(h.host.closed,false);
});
test('recovery resets stale controls and both input counters so guest driving is acknowledged again',async t=>{
 const h=await game(t);for(let i=0;i<300;i++){h.guest.guestStep({throttle:1,boost:true});h.guest.sendInputs(true);await settle();h.host.hostStep({},C.step);}assert.ok(h.host.remote.ack>250);h.host.transport.crash();await settle();assert.equal(h.host.remote.ack,0);assert.equal(h.guest.replica.inputSequence,0);assert.equal(h.guest.replica.pending.length,0);assert.equal(h.host.inputs().get(1).boost,false);for(let i=0;i<12;i++){h.guest.guestStep({throttle:1});h.guest.sendInputs(true);await settle();h.host.hostStep({},C.step);}assert.equal(h.host.remote.ack,12);assert.ok(h.host.sim.cars[1].v.length()>0);
});
test('a paused host stays paused through recovery, including changes made while reconnecting',async t=>{
 const h=await game(t);h.host.setPaused(true);await settle();h.host.transport.crash();await settle();assert.equal(h.host.hostPaused,true);assert.equal(h.guest.hostPaused,true);assert.equal(h.guest.replica.paused,true);const elapsed=h.host.sim.elapsed;h.host.hostStep({},C.step);assert.equal(h.host.sim.elapsed,elapsed);
 h.hub.online=false;h.host.transport.crash();await settle();h.host.setPaused(false);h.hub.online=true;h.flush();await settle();assert.equal(h.host.recovering,false);assert.equal(h.guest.hostPaused,false);assert.equal(h.host.hostStep({},C.step),true);
});
test('asymmetric loss detection still recovers within the original fixed deadline',async t=>{
 const h=await game(t);h.hub.suppressClose=true;h.host.transport.crash();await settle();assert.equal(h.guest.recovering,false);const deadline=h.host.recoveryDeadline;await h.clock.advance(4000);assert.equal(h.host.recoveryDeadline,deadline);assert.equal(h.host.recovering,false);assert.equal(h.guest.recovering,false);assert.deepEqual(h.errors,[]);
});
test('a slow but valid negotiation may use more than eight seconds within the recovery window',async t=>{
 const h=await game(t);h.hub.openDelay=11000;h.host.transport.crash();await settle();await h.clock.advance(10500);assert.equal(h.host.recovering,true);assert.equal(h.host.closed,false);await h.clock.advance(500);assert.equal(h.host.recovering,false);assert.equal(h.guest.recovering,false);assert.deepEqual(h.errors,[]);
});
test('repeated reconnect attempts expire once at 20 seconds and leave no queue or timer behind',async t=>{
 const h=await game(t);h.hub.online=false;h.host.transport.crash();await settle();await h.clock.advance(RECOVERY_MS-1);assert.equal(h.host.closed,false);await h.clock.advance(1);assert.equal(h.host.closed,true);assert.equal(h.guest.closed,true);assert.equal(h.errors.length,2);assert.ok(h.errors.every(error=>/20 seconds/.test(error)));assert.equal(h.queues.size,0);assert.equal(h.host.timers.size,0);assert.equal(h.guest.timers.size,0);await h.clock.advance(30000);assert.equal(h.errors.length,2);
});
test('late handshakes cannot complete at the deadline, while a handshake just before it can',async t=>{
 for(const [at,closed]of [[19999,false],[20000,true]]){const h=await game(t);h.hub.online=false;h.host.transport.crash();await settle();h.clock.now=at;h.hub.online=true;h.flush();await settle();assert.equal(h.host.closed,closed);if(!closed)assert.equal(h.host.recovering,false);h.host.close();h.guest.close();}
});
test('a returning peer must prove the secret, match, build and opposite gameplay role',async t=>{
 for(const change of [packet=>packet.key='0'.repeat(64),packet=>packet.matchId=crypto.randomUUID(),packet=>packet.build=NET_BUILD+'-wrong',packet=>packet.role='host']){const h=await game(t);h.hub.rewrite=(packet,link)=>{if(packet.t==='resume'&&link.role==='guest')change(packet);return packet;};h.host.transport.crash();await settle();assert.equal(h.host.closed,true);assert.match(h.host.error,/could not be verified/);h.guest.close();}
});
test('explicit leave and Find Next terminate the room without starting a reconnect attempt',async t=>{
 for(const reason of ['left','next']){const h=await game(t),count=h.links.length;h.guest.close(true,reason);await settle();assert.equal(h.host.closed,true);assert.equal(h.host.recovering,false);assert.equal(h.links.length,count);assert.match(h.host.error,reason==='next'?/next match/:/left/);}
});
test('either player can vote, cancel or accept a rematch; both votes start exactly one fresh match',async t=>{
 const h=await game(t);h.host.sim.phase='ended';h.host.publish(true);await settle();const id=h.host.matchId;assert.equal(h.host.startMatch(),false);h.guest.requestRematch();await settle();assert.equal(h.host.remoteRematch,true);assert.equal(h.host.matchId,id);h.guest.requestRematch(false);await settle();assert.equal(h.host.remoteRematch,false);h.host.requestRematch();await settle();assert.equal(h.guest.remoteRematch,true);h.guest.requestRematch();await settle();assert.notEqual(h.host.matchId,id);assert.equal(h.guest.matchId,h.host.matchId);assert.equal(h.matches.length,4);h.host.receive({t:'rematch',matchId:id,wanted:true});assert.equal(h.matches.length,4);assert.equal(h.host.rematchWanted,false);assert.equal(h.guest.remoteRematch,false);
});
test('a remote rematch cannot bypass the other player’s consent',async t=>{
 const h=await game(t);h.host.sim.phase='ended';h.host.publish(true);await settle();h.host.transport.send({t:'start',matchId:crypto.randomUUID()});await settle();assert.equal(h.guest.closed,true);assert.match(h.guest.error,/agreement/);
});
test('a rematch interrupted after guest preparation resolves the host’s pending match exactly once',async t=>{
 const h=await game(t);h.host.sim.phase='ended';h.host.publish(true);await settle();const old=h.host.matchId;let dropped=false;
 h.hub.rewrite=packet=>{if(packet.t==='started'&&packet.matchId!==old&&!dropped){dropped=true;queueMicrotask(()=>h.guest.transport.crash());return null;}return packet;};h.host.requestRematch();h.guest.requestRematch();await settle();assert.equal(dropped,true);assert.equal(h.host.closed,false);assert.equal(h.guest.closed,false);assert.equal(h.host.recovering,false);assert.notEqual(h.host.matchId,old);assert.equal(h.host.matchId,h.guest.matchId);assert.equal(h.host.pendingMatch,null);assert.equal(h.matches.length,4);assert.deepEqual(h.errors,[]);
});
test('a failed final resume send keeps physics frozen and retries within the same deadline',async t=>{
 const h=await game(t);let failed=false;h.hub.failSend=packet=>packet.t==='resume-go'&&!failed&&(failed=true);h.host.transport.crash();await settle();assert.equal(failed,true);assert.equal(h.host.recovering,true);assert.equal(h.guest.recovering,true);assert.equal(h.host.hostStep({},C.step),false);const deadline=h.host.recoveryDeadline;await h.clock.advance(1000);assert.equal(h.host.recoveryDeadline,deadline);assert.equal(h.host.recovering,false);assert.equal(h.guest.recovering,false);assert.deepEqual(h.errors,[]);
});
test('estimated loss tolerates reordering and duplicates but detects missing realtime datagrams',()=>{
 const ordered=new DeliveryWindow();for(const n of [1,3,2,4,4,...Array.from({length:40},(_,i)=>i+5)])ordered.receive(n);assert.equal(ordered.loss(),0);const lost=new DeliveryWindow();for(let n=1;n<=80;n++)if(n%5)lost.receive(n);assert.ok(lost.loss()>.18&&lost.loss()<.22);lost.receive(NaN);lost.receive(1e9);assert.ok(lost.seen.size<=256);for(let n=81;n<10000;n++)lost.receive(n);assert.ok(lost.seen.size<=256);assert.equal(lost.loss(),0);
});
test('quality warnings use measured ping, jitter, peer loss reports and traffic age',()=>{
 const q=new ConnectionQuality();assert.equal(q.summary(0,0).status,'measuring');q.rtt(40);q.rtt(45);assert.equal(q.summary(0,0).status,'good');q.report(.12);assert.equal(q.summary(0,0).status,'loss');assert.equal(q.summary(0,0).loss,12);q.report(2);assert.equal(q.remoteLoss,.12);assert.equal(q.summary(2000,0).status,'stalled');assert.equal(q.summary(2000,0,true).status,'reconnecting');const slow=new ConnectionQuality();slow.rtt(250);assert.equal(slow.summary(0,0).status,'latency');const jitter=new ConnectionQuality();jitter.rtt(30);jitter.rtt(140);assert.equal(jitter.summary(0,0).status,'unstable');
});
test('region and ping preferences are bounded and regional queues are separate from Worldwide',()=>{
 assert.deepEqual(networkPreferences({region:'fake',maxPing:-20}),{region:'worldwide',maxPing:200});assert.equal(regionQueue('build','worldwide'),'build');assert.equal(regionQueue('build','oceania'),'build-oceania');assert.deepEqual(networkPreferences({region:'europe',maxPing:0}),{region:'europe',maxPing:0});
});
test('matching checks the stricter measured ping limit and ignores unsolicited probe responses',async t=>{
 const h=await game(t);h.host.preferences.maxPing=100;h.host.remotePreferences={maxPing:150};h.hub.rewrite=packet=>{if(packet.t==='pong')h.clock.now+=130;return packet;};await assert.rejects(h.host.checkConnection(),/limit 100 ms/);const before=h.host.quality.samples.length;h.host.receive({t:'pong',id:999999,at:h.clock.now});assert.equal(h.host.quality.samples.length,before);
});
test('a failed ping admission retries without resetting the 60-second search deadline',async t=>{
 const clock=new Clock(),rooms=[],fallback=[];class Room{constructor(callbacks){Object.assign(this,callbacks);rooms.push(this);}matchmake(look,options,queue,prefs){this.queue=queue;this.preferences=prefs;this.connected=true;this.options=options;this.onChange();}checkConnection(){return Promise.reject(Error('Opponent ping was too high.'));}close(){this.closed=true;}}
 const match=new Matchmaker({Room,clock:()=>clock.now,setTimer:clock.set,clearTimer:clock.clear,onBots:options=>fallback.push(options)});t.after(()=>match.cancel());match.start({}, {network:{region:'oceania',maxPing:100}});await settle();assert.match(match.reason,/ping/);assert.ok(rooms[0].queue.endsWith('-oceania'));await clock.advance(60000);assert.equal(fallback.length,1);assert.equal(match.deadline,60000);assert.ok(rooms.every(room=>room.closed));
});
test('realtime wire counters advance only after successful sends and ignore reliable state packets',()=>{
 const transport=new RoomTransport(),sent=[],channel={readyState:'open',bufferedAmount:0,send:data=>sent.push(JSON.parse(data)),close(){}};transport.channels={realtime:channel,control:{...channel}};transport.send({t:'probe'},true);transport.send({t:'state'});channel.bufferedAmount=40000;assert.equal(transport.send({t:'probe'},true),false);channel.bufferedAmount=0;transport.send({t:'probe'},true);assert.deepEqual(sent.map(packet=>packet.w),[1,undefined,2]);transport.close();
});


test('legacy room chat restores its five-message history on reconnect and clears for both peers',async t=>{
 const h=await game(t),hostStates=[],guestStates=[];h.host.onChatState=state=>hostStates.push(state);h.guest.onChatState=state=>guestStates.push(state);
 h.host.updateProfile('Host Driver');h.guest.updateProfile('Guest Driver');await settle();
 for(let n=1;n<=6;n++){assert.equal((n%2?h.host:h.guest).sendChat('Message '+n),true);await settle();await h.clock.advance(900);}
 const expected=[2,3,4,5,6].map(n=>'Message '+n);assert.deepEqual(hostStates.at(-1).messages.map(message=>message.text),expected);assert.deepEqual(guestStates.at(-1).messages,hostStates.at(-1).messages);
 h.guest.chat.clear();h.guest.transport.crash();await settle();assert.equal(h.guest.recovering,false);assert.deepEqual(guestStates.at(-1).messages,hostStates.at(-1).messages);
 h.host.chat.clear();await settle();assert.deepEqual(hostStates.at(-1).messages,[]);assert.deepEqual(guestStates.at(-1).messages,[]);
});
