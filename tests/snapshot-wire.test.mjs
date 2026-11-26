import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation,C} from '../dist/physics.js';
import {makeState,validState,GuestReplica,encodeCar} from '../dist/network-state.js';
import {CAR_NUMBERS,CAR_VECTORS,CAR_FLAGS} from '../dist/state-schema.js';
import {encodeSnapshotWorld,snapshotForPeer,decodeSnapshot} from '../dist/snapshot-wire.js';
import {ServerSession} from '../server/session.mjs';
import {GameService} from '../server/game-service.mjs';
import {ServerLink} from '../dist/server-link.js';
import {drivingTrial} from './helpers/driving-trial.mjs';

function frame(state,ack=3){return snapshotForPeer(encodeSnapshotWorld(state),{n:4,ack,w:5,net:{inputTick:ack+1,inputQueueMs:8}});}
for(const mode of ['duel','doubles','free','training','custom','hoops'])test(`binary snapshot preserves complete ${mode} authority state and training metadata`,()=>{
 const sim=new Simulation({mode,players:Array.from({length:8},(_,id)=>({id,team:id%2}))});
 sim.phase='playing';for(let tick=0;tick<7;tick++)sim.step({throttle:1,jump:tick>2},C.step);
 const state=makeState(sim,4,3,'test-match'),bytes=frame(state),out=decodeSnapshot(bytes);
 assert.ok(validState(out,sim));assert.equal(out.matchId,state.matchId);assert.equal(out.phaseTime,state.phaseTime);assert.equal(out.elapsed,state.elapsed);assert.deepEqual(out.score,state.score);assert.deepEqual(out.practice,state.practice);
 for(let i=0;i<state.cars.length;i++){
  const a=state.cars[i],b=out.cars[i];assert.equal(b.id,a.id);assert.equal(b.team,a.team);
  for(const key of [...CAR_VECTORS,'q','selfRightTarget'])for(let j=0;j<a[key].length;j++)assert.ok(Math.abs(a[key][j]-b[key][j])<1e-5,key);
  for(const key of CAR_NUMBERS)assert.ok(Math.abs(a[key]-b[key])<1e-5,key);
  for(const key of CAR_FLAGS)assert.equal(a[key],b[key]);
 }
 assert.ok(bytes.byteLength<Buffer.byteLength(JSON.stringify(state))*.45,'snapshot bandwidth reduction');
 const backing=new Uint8Array(bytes.length+12);backing.set(bytes,6);assert.deepEqual(decodeSnapshot(backing.subarray(6,-6)),out);
});
test('recipient sequence, ACK and held tick are independent and sent frames are immutable',()=>{
 const state=makeState(new Simulation(),0,0,'match'),world=encodeSnapshotWorld(state),saved=world.slice();
 const a=snapshotForPeer(world,{n:10,ack:7,w:2,net:{inputTick:9,inputQueueMs:16}}),b=snapshotForPeer(world,{n:11,ack:13,w:3,net:{inputTick:14,inputQueueMs:0}});
 assert.deepEqual(world,saved);assert.equal(decodeSnapshot(a).ack,7);assert.equal(decodeSnapshot(a).net.inputTick,9);assert.equal(decodeSnapshot(b).ack,13);
 b[8]=42;assert.equal(decodeSnapshot(a).n,10);assert.deepEqual(world,saved);
});
test('malformed, oversized, truncated, non-finite and unsupported binary snapshots fail closed',()=>{
 const good=frame(makeState(new Simulation(),4,3,'match'));
 for(let i=0;i<good.length;i++)assert.equal(decodeSnapshot(good.subarray(0,i)),null);
 for(const [offset,value]of [[0,0],[4,255],[5,1],[6,0],[8,255],[16,255]]){
  const bytes=good.slice();if(offset===8||offset===16)new DataView(bytes.buffer).setUint32(offset,0xffffffff,true);else bytes[offset]=value;
  assert.equal(decodeSnapshot(bytes),null,`invalid header at ${offset}`);
 }
 const bad=good.slice();new DataView(bad.buffer).setFloat32(24,NaN,true);assert.equal(decodeSnapshot(bad),null);
 assert.equal(decodeSnapshot(new Uint8Array(32769)),null);assert.equal(decodeSnapshot('state'),null);assert.equal(decodeSnapshot(good.slice().buffer)===null,false);
});
test('binary WebSocket messages use synchronous array buffers while reliable controls stay JSON',()=>{
 class Socket{constructor(){this.readyState=1;}close(){}}
 const packets=[],link=new ServerLink('wss://game.test/multiplayer',{WebSocketClass:Socket,onPacket:p=>packets.push(p)});
 assert.equal(link.socket.binaryType,'arraybuffer');link.socket.onopen();
 link.socket.onmessage({data:frame(makeState(new Simulation(),4,3,'match')).buffer});
 link.socket.onmessage({data:JSON.stringify({t:'pong',id:2})});link.socket.onmessage({data:new Uint8Array(20)});
 assert.deepEqual(packets.map(p=>p.t),['state','pong']);link.close();
});
test('prediction history reuses a bounded set of objects and arrays without changing detached encodings',()=>{
 const sim=new Simulation({mode:'free'}),replica=new GuestReplica(sim,0),snap=encodeCar(replica.predicted),saved=structuredClone(snap);
 const objects=new Set(),arrays=new Set();
 for(let i=0;i<1000;i++){replica.predicted.p.x=i;replica.remember(i);const state=replica.history.get(i);objects.add(state);arrays.add(state.p);}
 assert.equal(objects.size,121);assert.equal(arrays.size,121);assert.equal(replica.history.size,121);assert.deepEqual(snap,saved);
 replica.clearHistory();for(let i=1000;i<2000;i++){replica.remember(i);assert.ok(objects.has(replica.history.get(i)));}assert.equal(replica.historyPool.length,0);
});
test('server catch-up publishes the final physics tick once rather than the stale first tick',()=>{
 let now=0,steps=0;const published=[];
 const room={active:true,sim:{phase:'playing'},pump(dt,defer){assert.equal(dt,C.step);assert.equal(defer,true);steps++;},publish(){published.push(steps);},close(){}};
 const service=new GameService({clock:()=>now,autostart:false});service.rooms.set('test',room);service.pump();now=100;service.pump();
 assert.ok(steps>=11&&steps<=12);assert.deepEqual(published,[steps]);service.close();
});
test('backpressure drops stale realtime frames, resumes with fresh state and does not create fake packet loss',t=>{
 let now=0;const packets=[],socket={readyState:1,bufferedAmount:0,send:p=>packets.push(p),close(){}};
 const room=new ServerSession({code:'test',options:{mode:'custom',maxPeople:2},clock:()=>now,setTimer:()=>({unref(){}}),clearTimer(){}});t.after(()=>room.close(false));
 const {entry}=room.attach(socket,{look:{name:'Test'}},{id:'id'});entry.member.team=0;room.makeSimulation('test',room.players());room.status='playing';room.sim.phase='playing';
 room.publish(true);const first=decodeSnapshot(packets.at(-1));assert.ok(first);
 socket.bufferedAmount=100000;room.sim.cars[0].p.x=12;now=100;room.publish(true);assert.equal(decodeSnapshot(packets.at(-1)).n,first.n);
 socket.bufferedAmount=0;room.sim.cars[0].p.x=13;now=200;room.publish(true);const last=decodeSnapshot(packets.at(-1));assert.equal(last.cars[0].p[0],13);assert.equal(last.w,first.w+1);
});
for(const [fps,rtt] of [[30,200],[60,50],[60,150],[144,200]])test(`binary delivery preserves smooth prediction at ${fps} FPS, ${rtt} ms and 3% missing updates`,()=>{
 const result=drivingTrial(fps,rtt,{hitches:true,snapshot:state=>decodeSnapshot(snapshotForPeer(encodeSnapshotWorld(state),{...state,w:state.n}))});
 assert.equal(result.stalledFrames,0,JSON.stringify(result));assert.ok(result.p95SpeedError<.04,JSON.stringify(result));assert.ok(result.p95CorrectionMetres<.03,JSON.stringify(result));assert.ok(result.maxSnapshotSnap<1e-8,JSON.stringify(result));
});
