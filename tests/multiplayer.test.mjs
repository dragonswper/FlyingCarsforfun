import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as settle} from 'node:timers/promises';
import {Simulation,C} from '../dist/physics.js';
import {NET_BUILD,NET_PROTOCOL,MAX_PACKET,CODE_ALPHABET,roomCode,normalizeCode,displayCode,queueID,roomOptions,appearance,cleanInput,decodePacket,RemoteInputs,guestId} from '../dist/network-protocol.js';
import {makeState,validState,GuestReplica} from '../dist/network-state.js';
import {NetworkRoom} from '../dist/network-room.js';
import {RoomTransport} from '../dist/network-transport.js';
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function hub(transform=packet=>packet){
 const waiting=new Map();return class Transport{
  constructor(handlers){Object.assign(this,handlers);this.open=false;this.closed=false;}
  connect(code,role){this.code=code;this.role=role;this.onWaiting();const other=waiting.get(code);if(!other){waiting.set(code,this);return;}waiting.delete(code);this.peer=other;other.peer=this;this.open=other.open=true;queueMicrotask(()=>{other.onOpen();this.onOpen();});}
  send(packet,realtime=false){if(this.closed||!this.open)return false;const peer=this.peer,value=transform(structuredClone(packet),this.role,realtime);if(value)queueMicrotask(()=>{if(!peer.closed)peer.onPacket(value);});return true;}
  close(){if(this.closed)return;this.closed=true;this.open=false;if(waiting.get(this.code)===this)waiting.delete(this.code);if(this.peer&&!this.peer.closed)queueMicrotask(()=>{if(!this.peer.closed)this.peer.onClose('Peer disconnected.');});}
 };
}
async function pair(t,options={},transform,looks={}){
 const Transport=hub(transform);let now=0;const events=[],errors=[];const host=new NetworkRoom({Transport,clock:()=>now,onDisconnect:r=>errors.push(r)}),guest=new NetworkRoom({Transport,clock:()=>now,onEvents:e=>events.push(...e),onDisconnect:r=>errors.push(r)});
 t.after(()=>{host.close();guest.close();});host.create(options,looks.host||{body:'fennec',paint:'blue'});guest.join(host.code,looks.guest||{body:'rally',paint:'mint'});await settle();return {host,guest,events,errors,advance:ms=>now+=ms};
}
async function start(pair){pair.guest.setReady(true);await settle();assert.equal(pair.host.startMatch(),true);await settle();}

test('room codes use the full 40-bit alphabet and normalize safely for copy/paste',()=>{
 const rng={getRandomValues:bytes=>bytes.set([0,1,2,3,28,29,30,31])},code=roomCode(rng);assert.equal(CODE_ALPHABET.length,32);assert.equal(code,'ABCD6789');assert.equal(normalizeCode(' abcd-6789 '),code);assert.equal(displayCode(code),'ABCD-6789');assert.match(queueID(code),/private-v1-ABCD6789$/);for(const invalid of ['',null,'1234-OOOO','ABCDEFGHJ','<script>'])assert.throws(()=>normalizeCode(invalid));assert.ok(new Set(Array.from({length:100},()=>roomCode())).size>99);
});
test('untrusted room options, cosmetics, packets and controls have bounded values',()=>{
 assert.deepEqual(roomOptions(null),{mode:'duel',coop:false,duration:300,difficulty:'pro'});assert.equal(guestId(roomOptions({mode:'doubles',coop:true})),1);assert.equal(guestId(roomOptions({mode:'doubles'})),2);assert.equal(appearance({body:'script',paint:'red'}).body,'fennec');assert.equal(appearance(null).paint,'blue');
 const input=cleanInput({throttle:900,steer:NaN,pitch:-5,roll:Infinity,jump:1,boost:true,drift:'true',dodgeDeadzone:-4});assert.deepEqual(input,{throttle:1,steer:0,pitch:-1,roll:0,jump:false,boost:true,drift:false,dodgeDeadzone:.1});assert.equal(cleanInput(null).throttle,0);assert.equal(decodePacket('{broken'),null);assert.equal(decodePacket('[]'),null);assert.equal(decodePacket('x'.repeat(MAX_PACKET+1)),null);
});
test('remote input rejects duplicates, neutralizes stale held buttons and bounds backlog',()=>{
 const queue=new RemoteInputs();queue.receive([{n:1,i:{boost:true,jump:true,throttle:1}}],0);assert.equal(queue.next(10).jump,true);assert.equal(queue.ack,1);assert.equal(queue.receive([{n:1,i:{boost:false}}],20),false);assert.equal(queue.next(301).boost,false);assert.equal(queue.next(301).throttle,0);
 for(let n=2;n<100;n++)queue.receive([{n,i:{steer:1}}],400);assert.ok(queue.queue.length<=24);assert.equal(queue.receive([{n:1000,i:{throttle:1}}],400),false);queue.next(401);assert.ok(queue.ack<=99);
});
test('host alone starts the room, guest readiness gates it, and local perspectives differ',async t=>{
 const p=await pair(t,{duration:120,difficulty:'expert'});assert.equal(p.host.status,'lobby');assert.equal(p.guest.options.duration,120);assert.equal(p.host.startMatch(),false);assert.equal(p.guest.startMatch(),false);await start(p);
 assert.equal(p.host.sim.localPlayerId,0);assert.equal(p.guest.sim.localPlayerId,1);assert.ok(p.host.sim.cars.every(c=>!c.bot));assert.equal(p.guest.sim.cars[1].appearance.body,'rally');assert.equal(p.host.sim.cars[0].networkRole,'host');assert.equal(p.guest.sim.cars[1].networkRole,'guest');assert.deepEqual(p.errors,[]);
});
test('doubles supports teammates or opposing human teams while retaining exactly two bots',async t=>{
 for(const coop of [false,true]){const p=await pair(t,{mode:'doubles',coop});await start(p);const id=guestId(p.host.options);assert.equal(p.host.sim.cars.filter(c=>c.bot).length,2);assert.equal(p.guest.sim.localPlayerId,id);assert.equal(p.host.sim.cars[id].team,coop?0:1);assert.equal(p.host.sim.cars[id].bot,false);p.host.close();p.guest.close();}
});
test('custom Bottled Car appearance survives the room handshake, both player perspectives and rematches',async t=>{
 const p=await pair(t,{},undefined,{host:{body:'bottled',paint:'violet'},guest:{body:'bottled',paint:'mint'}});assert.equal(p.host.remoteLook.body,'bottled');assert.equal(p.guest.remoteLook.body,'bottled');await start(p);
 for(const peer of [p.host,p.guest]){assert.equal(peer.sim.cars[0].appearance.body,'bottled');assert.equal(peer.sim.cars[1].appearance.body,'bottled');assert.equal(peer.sim.cars[0].appearance.color,'#a985fc');assert.equal(peer.sim.cars[1].appearance.color,'#53dbbd');}
 const match=p.host.matchId;assert.equal(p.host.startMatch(),true);await settle();assert.notEqual(p.host.matchId,match);assert.equal(p.guest.matchId,p.host.matchId);assert.equal(p.guest.sim.cars[p.guest.sim.localPlayerId].appearance.body,'bottled');assert.deepEqual(p.errors,[]);
});
test('the new car, bike and plane choices survive private-match start and preserve host/guest ownership',async t=>{
 for(const [hostBody,guestBody]of [['octane','che'],['bike','c17']]){const p=await pair(t,{mode:'doubles'},undefined,{host:{body:hostBody,paint:'violet'},guest:{body:guestBody,paint:'mint'}});await start(p);for(const peer of [p.host,p.guest]){assert.equal(peer.sim.cars[0].appearance.body,hostBody);assert.equal(peer.sim.cars[2].appearance.body,guestBody);assert.equal(peer.sim.cars[0].appearance.color,'#a985fc');assert.equal(peer.sim.cars[2].appearance.color,'#53dbbd');assert.equal(peer.sim.cars.filter(c=>c.bot).length,2);}assert.equal(p.guest.sim.localPlayerId,2);assert.deepEqual(p.errors,[]);p.host.close();p.guest.close();}
});
test('older game builds are rejected before any simulation starts',async t=>{
 const p=await pair(t,{},(packet,role)=>packet.t==='hello'&&role==='guest'?{...packet,build:'old-build'}:packet);assert.equal(p.host.closed,true);assert.equal(p.guest.closed,true);assert.ok(p.errors.some(e=>/versions differ/.test(e)));assert.equal(p.host.sim,undefined);
});
test('guest controls move only its assigned car in the authoritative simulation',async t=>{
 const p=await pair(t);await start(p);p.host.sim.phase='playing';p.host.publish(true);await settle();const hostStart=p.host.sim.cars[0].p.clone(),guestStart=p.host.sim.cars[1].p.clone();let minimumBoost=100;
 for(let i=0;i<120;i++){p.advance(C.step*1000);p.guest.guestStep({throttle:1,boost:i<20});p.guest.sendInputs();await settle();p.host.sim.step({},C.step,p.host.inputs());minimumBoost=Math.min(minimumBoost,p.host.sim.cars[1].boost);p.host.publish();await settle();}
 assert.ok(p.host.sim.cars[1].p.distanceTo(guestStart)>5);assert.ok(p.host.sim.cars[0].p.distanceTo(hostStart)<.1);assert.ok(minimumBoost<32);assert.ok(p.host.remote.ack>50);assert.equal(p.guest.sim.score[0],p.host.sim.score[0]);
 p.host.receive({t:'input',matchId:p.host.matchId,playerId:0,frames:[{n:p.host.remote.received+1,i:{throttle:1000,position:[999,999,999]}}]});assert.equal(p.host.inputs().has(0),false);assert.ok(p.host.sim.cars[0].p.distanceTo(hostStart)<.1);
});
test('snapshots reject malformed vectors, bad IDs and stale sequence numbers without mutating the guest',()=>{
 const host=new Simulation({humanIds:[0,1]}),guest=new Simulation({humanIds:[0,1]}),replica=new GuestReplica(guest,1),state=makeState(host,1,0,'match');assert.equal(validState(state,guest),true);assert.equal(replica.receive(state,0),true);
 for(const change of [s=>s.cars[1].id=0,s=>s.ball.p[0]=Infinity,s=>s.cars[0].q=[0,0,0,0],s=>s.pads.pop(),s=>s.cars[1].boost=999,s=>s.score=[-1,0]]){const corrupt=structuredClone(state);corrupt.n=2;change(corrupt);assert.equal(replica.receive(corrupt,10),false);}
 host.ball.p.x=3;const next=makeState(host,3,0,'match');assert.equal(replica.receive(next,20),true);assert.equal(replica.receive(state,25),false);assert.equal(guest.ball.p.x,3);assert.equal(replica.lastSequence,3);
});
test('guest prediction preserves an unacknowledged jump and reconciles it once acknowledged',()=>{
 const host=new Simulation({humanIds:[0,1]}),guest=new Simulation({humanIds:[0,1]});host.phase=guest.phase='playing';const replica=new GuestReplica(guest,1);replica.receive(makeState(host,1,0,'match'),0);
 const input={throttle:1,jump:true};replica.step(input);replica.step(input);const predicted=replica.predicted.p.clone();assert.ok(replica.predicted.v.y>0);replica.receive(makeState(host,2,0,'match'),5);near(replica.predicted.p.y,predicted.y);assert.equal(replica.pending.length,2);
 for(let i=0;i<2;i++)host.step({},C.step,new Map([[1,input]]));replica.receive(makeState(host,3,2,'match'),16.7);assert.equal(replica.pending.length,0);near(replica.predicted.p.y,host.cars[1].p.y);near(replica.predicted.p.z,host.cars[1].p.z);
});
test('a guest can self-right with one jump press and keep its recovery target through authoritative updates',async t=>{
 const p=await pair(t);await start(p);p.host.sim.phase='playing';const car=p.host.sim.cars[1];car.p.set(12,.5,0);car.v.set(0,0,0);car.q.set(0,0,1,0);car.grounded=false;car.canDouble=false;car.jumpHeld=false;
 for(let i=0;i<90;i++)p.host.sim.step({},C.step,p.host.inputs());p.host.publish(true);await settle();let recovering=false;
 for(let tick=0;tick<180;tick++){p.advance(C.step*1000);p.guest.guestStep({jump:tick===0});p.guest.sendInputs(true);await settle();p.host.sim.step({},C.step,p.host.inputs());recovering||=car.selfRightTime>0;if(tick%4===0){p.host.publish(true);await settle();assert.ok(p.guest.replica.predicted.selfRightTarget.angleTo(car.selfRightTarget)<1e-6);}}
 p.host.publish(true);await settle();assert.equal(recovering,true);assert.equal(car.grounded,true);assert.equal(car.selfRightTime,0);near(car.p.y,C.carHeight);assert.ok(car.q.angleTo(p.guest.replica.predicted.q)<1e-6);assert.equal(p.guest.replica.predicted.grounded,true);assert.deepEqual(p.errors,[]);
 const packet=makeState(p.host.sim,999,p.host.remote.ack,p.host.matchId);packet.cars[1].selfRightTarget=[0,0,0,0];assert.equal(validState(packet,p.guest.sim),false);packet.cars[1].selfRightTarget=[0,0,0,1];packet.cars[1].selfRightTime=10;assert.equal(validState(packet,p.guest.sim),false);
});
test('remote poses interpolate between authoritative snapshots and snap through kickoff teleports',()=>{
 const host=new Simulation(),guest=new Simulation(),replica=new GuestReplica(guest,1);host.phase=guest.phase='playing';host.elapsed=0;replica.receive(makeState(host,1,0,'match'),0);host.ball.p.x=2;host.elapsed=.1;replica.receive(makeState(host,2,0,'match'),100);near(replica.sample(100,1/60).ball.p[0],.3);
 host.kickoff();host.ball.p.x=20;host.elapsed=.2;replica.receive(makeState(host,3,0,'match'),200);near(replica.sample(200,1/60).ball.p[0],20);assert.equal(replica.sim.replay.length,0);
});
test('goals, final stats, host pause, rematches and disconnects propagate in room order',async t=>{
 const p=await pair(t);await start(p);p.host.setPaused(true);await settle();assert.equal(p.guest.hostPaused,true);assert.equal(p.guest.replica.paused,true);p.host.setPaused(false);await settle();assert.equal(p.guest.hostPaused,false);
 p.host.sim.score=[0,1];p.host.sim.cars[1].goals=1;p.host.sim.cars[1].score=100;p.host.sim.phase='ended';p.host.events([{type:'end',won:false}]);await settle();assert.deepEqual(p.guest.sim.score,[0,1]);assert.equal(p.guest.sim.phase,'ended');assert.equal(p.guest.sim.cars[1].goals,1);assert.equal(p.events.at(-1).type,'end');
 const oldMatch=p.host.matchId;assert.equal(p.host.startMatch(),true);await settle();assert.notEqual(p.host.matchId,oldMatch);assert.equal(p.guest.matchId,p.host.matchId);assert.deepEqual(p.guest.sim.score,[0,0]);p.guest.receive({...makeState(p.host.sim,999,0,oldMatch),score:[50,50]});assert.deepEqual(p.guest.sim.score,[0,0]);p.host.close();await settle();assert.equal(p.guest.closed,true);assert.equal(p.guest.status,'error');assert.ok(p.errors.length>0);
});
test('guest HUD values use the guest car instead of the host car',()=>{
 const sim=new Simulation({humanIds:[0,1]});sim.cars[0].boost=80;sim.cars[1].boost=12;sim.cars[1].v.set(0,0,20);assert.equal(sim.state(1).boost,12);near(sim.state(1).speed,72);assert.equal(sim.state().boost,80);
});

test('prediction and input recovery stay bounded with delay, jitter, loss and reordered snapshots',()=>{
 const host=new Simulation({humanIds:[0,1]}),guest=new Simulation({humanIds:[0,1]});host.phase=guest.phase='playing';const replica=new GuestReplica(guest,1),remote=new RemoteInputs(),packets=[];let sequence=0,largestPending=0,largestPacket=0;
 for(let tick=0;tick<1200;tick++){
  const now=tick*C.step*1000,input={throttle:.8,steer:Math.sin(tick*.007)*.18,boost:tick%300<30,jump:tick%240<12};replica.step(input);
  if(tick%2===0&&tick%14!==0)packets.push({at:now+35+(tick*19%55),type:'input',data:structuredClone(replica.inputFrames())});
  packets.sort((a,b)=>a.at-b.at);while(packets.length&&packets[0].at<=now){const packet=packets.shift();if(packet.type==='input')remote.receive(packet.data,now);else replica.receive(packet.data,now);}
  host.step({},C.step,new Map([[1,remote.next(now)]]));host.events.length=0;
  if(tick%4===0&&tick%20!==0){const state=makeState(host,++sequence,remote.ack,'test');largestPacket=Math.max(largestPacket,JSON.stringify(state).length);packets.push({at:now+40+(tick*23%65),type:'state',data:state});}
  const pose=replica.sample(now,C.step);if(pose)for(const car of pose.cars)assert.ok(car.p.every(Number.isFinite));largestPending=Math.max(largestPending,replica.pending.length);
 }
 assert.ok(remote.ack>1000);assert.ok(replica.lastSequence>200);assert.ok(largestPending<100,largestPending);assert.ok(replica.predicted.p.distanceTo(host.cars[1].p)<5);assert.ok(largestPacket<16384);assert.ok(replica.frames.length<=12);assert.ok(replica.sim.replay.length<=100);
});

class FakeSocket{constructor(){this.readyState=1;this.sent=[];}send(value){this.sent.push(JSON.parse(value));}close(){this.readyState=3;}}
class FakeChannel{constructor(label){this.label=label;this.readyState='connecting';this.bufferedAmount=0;this.sent=[];}send(value){this.sent.push(value);}close(){this.readyState='closed';this.onclose?.();}}
class FakeRTC{
 constructor(config){this.config=config;this.connectionState='new';this.added=[];this.created=[];}
 createDataChannel(label,options){const channel=new FakeChannel(label);this.created.push({channel,options});return channel;}
 async createOffer(){return {type:'offer',sdp:'test-offer'};}async createAnswer(){return {type:'answer',sdp:'test-answer'};}
 async setLocalDescription(value){this.localDescription=value;}async setRemoteDescription(value){this.remoteDescription=value;}
 async addIceCandidate(value){assert.ok(this.remoteDescription);this.added.push(value);}close(){this.connectionState='closed';}
}
test('early reliable packets wait until both channels open and the local hello is sent',async t=>{
 const order=[],transport=new RoomTransport({WebSocketClass:FakeSocket,RTCClass:FakeRTC,onOpen:()=>order.push('open'),onPacket:packet=>order.push(packet.t)});t.after(()=>transport.close());transport.connect('ABCD2345','host');transport.iceServers=[];await transport.signal(JSON.stringify({kind:'host-match',clientIDs:['peer']}));
 transport.channels.control.readyState='open';transport.channels.control.onopen();transport.channels.control.onmessage({data:JSON.stringify({t:'hello'})});assert.deepEqual(order,[]);assert.equal(transport.earlyPackets.length,1);
 transport.channels.realtime.readyState='open';transport.channels.realtime.onopen();assert.deepEqual(order,['open','hello']);assert.equal(transport.earlyPackets.length,0);
});
test('Netplay signaling uses a private queue and buffers early ICE until the description arrives',async t=>{
 let waiting=0;const transport=new RoomTransport({WebSocketClass:FakeSocket,RTCClass:FakeRTC,onWaiting:()=>waiting++});t.after(()=>transport.close());transport.connect('ABCD2345','host');await transport.signal(JSON.stringify({kind:'registration-success',clientID:'self',iceServers:[{urls:'stun:test'}]}));assert.equal(waiting,1);assert.equal(transport.ws.sent[0].gameID,queueID('ABCD2345'));assert.equal(transport.ws.sent[0].maxPlayers,2);
 await transport.signal(JSON.stringify({kind:'join-match',hostID:'peer'}));await transport.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'candidate',payload:{candidate:'candidate-a'}}));assert.equal(transport.candidates.length,1);assert.equal(transport.pc.added.length,0);await transport.signal(JSON.stringify({kind:'peer-message',sourceID:'peer',type:'offer',payload:{type:'offer',sdp:'sdp'}}));assert.equal(transport.pc.added.length,1);assert.equal(transport.ws.sent.at(-1).type,'answer');
});
test('control messages are reliable, realtime messages are bounded and the transport releases all resources',async t=>{
 let opens=0,packets=0;const transport=new RoomTransport({WebSocketClass:FakeSocket,RTCClass:FakeRTC,onOpen:()=>opens++,onPacket:()=>packets++});t.after(()=>transport.close());transport.connect('ABCD2345','guest');transport.iceServers=[];await transport.signal(JSON.stringify({kind:'host-match',clientIDs:['peer']}));assert.equal(transport.pc.created[0].options.ordered,true);assert.equal(transport.pc.created[1].options.maxRetransmits,0);
 for(const channel of Object.values(transport.channels)){channel.readyState='open';channel.onopen();}assert.equal(opens,1);assert.equal(transport.timers.size,0);assert.equal(transport.send({t:'hello',protocol:NET_PROTOCOL,build:NET_BUILD}),true);transport.channels.realtime.bufferedAmount=40000;assert.equal(transport.send({t:'state'},true),false);transport.channels.control.onmessage({data:'not-json'});transport.channels.control.onmessage({data:JSON.stringify({t:'ping'})});assert.equal(packets,1);const pc=transport.pc,ws=transport.ws;transport.close();assert.equal(pc.connectionState,'closed');assert.equal(ws.readyState,3);assert.equal(transport.send({t:'ping'}),false);
});
