import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, C} from '../dist/physics.js';
import {GuestReplica, makeState} from '../dist/network-state.js';
import {ServerInputs} from '../server/inputs.mjs';
import {drivingTrial} from './helpers/driving-trial.mjs';

function driving() {
 const host=new Simulation({humanIds:[0,1]}),guest=new Simulation({humanIds:[0,1]});
 host.phase=guest.phase='playing';host.cars[0].p.set(25,C.carHeight,25);host.cars[1].p.set(-20,C.carHeight,-20);host.cars[1].q.identity();host.cars[1].v.set(0,0,14);host.ball.p.set(25,12,0);
 const replica=new GuestReplica(guest,1);replica.receive(makeState(host,1,0,'test'),0);replica.setLatency(200);
 return {host,guest,replica,remote:new ServerInputs()};
}

test('held server controls do not make reconciliation replay physics that authority already simulated',()=>{
 const {host,replica,remote}=driving(),input={throttle:.6,steer:.4};
 remote.receive([{n:1,i:input}],0);
 for(let tick=0;tick<3;tick++){replica.step(input);host.step({},C.step,new Map([[1,remote.next(tick*1000/120)]]));}
 assert.equal(remote.ack,1,'Only the actually consumed input may be acknowledged');
 const before=replica.predicted.p.clone(),state=makeState(host,2,remote.ack,'test');
 state.net={inputTick:remote.inputTick};replica.receive(state,33);
 assert.ok(replica.predicted.p.distanceTo(before)<1e-7,'Held input time was replayed a second time');
 assert.equal(replica.lastReplay,0);
});

test('late frames update held controls without putting their physics steps back on the input timeline',()=>{
 const remote=new ServerInputs();remote.receive([{n:1,i:{throttle:1}}],0);
 for(let tick=0;tick<4;tick++)remote.next(tick*8);
 assert.equal(remote.inputTick,4);
 remote.receive([{n:2,i:{throttle:1}},{n:3,i:{throttle:1}},{n:4,i:{throttle:-1}}],32);
 assert.equal(remote.next(32).throttle,-1);
 assert.equal(remote.ack,4);assert.equal(remote.inputTick,5);
});

test('a delayed jump is applied once while the server timeline continues',()=>{
 const remote=new ServerInputs();remote.receive([{n:1,i:{}}],0);
 for(let tick=0;tick<5;tick++)remote.next(tick*8);
 remote.receive([{n:2,i:{jump:true}},{n:3,i:{jump:false}},{n:4,i:{jump:true}},{n:5,i:{jump:false}}],40);
 const jumps=[];for(let tick=0;tick<6;tick++)jumps.push(remote.next(40+tick*8).jump);
 assert.deepEqual(jumps,[true,false,true,false,false,false]);assert.equal(remote.inputTick,11);
 assert.equal(remote.next(400).throttle,0);assert.equal(remote.next(400).jump,false);
});

for (const [fps, rtt] of [[30,200],[60,50],[60,200],[90,200],[144,200],[240,200]])
 test(`driving stays paced at ${fps} FPS and ${rtt} ms with uneven frames and 3% missing packets`,()=>{
  const result=drivingTrial(fps,rtt);
  assert.ok(result.measuredFrames>100);
  assert.equal(result.stalledFrames,0,JSON.stringify(result));
  assert.ok(result.p95SpeedError<.04,JSON.stringify(result));
  assert.ok(result.p95CorrectionMetres<.03,JSON.stringify(result));
  assert.ok(result.maxSnapshotSnap<1e-8,JSON.stringify(result));
 });

test('a mid-step render preserves its visible pose when authority corrects car and ball',()=>{
 const {host,replica}=driving();replica.step({throttle:1});
 const before=structuredClone(replica.sample(8,0,.35)),state=makeState(host,2,1,'test');
 state.cars[1].p[0]+=.6;state.ball.p[0]-=.4;
 replica.receive(state,12);
 const after=replica.sample(12,0,.35);
 for(const [oldPose,newPose]of [[before.cars[1],after.cars[1]],[before.ball,after.ball]])
  assert.ok(Math.hypot(...oldPose.p.map((n,axis)=>n-newPose.p[axis]))<1e-8);
});

test('fresh controls rebase a slow client input clock without waiting for a connection timeout',()=>{
 const remote=new ServerInputs();let sequence=0;
 for(let tick=0;tick<120;tick++){
  const now=tick*1000/120;
  if(tick%2===0)remote.receive([{n:++sequence,i:{throttle:.6}}],now);
  remote.next(now);
 }
 assert.ok(remote.inputTick<=sequence+10,'The held timeline permanently outran the active client');
 assert.ok(remote.ack>=sequence-1);
});

test('driving recovers after repeated 220ms render hitches without permanent server corrections',()=>{
 const result=drivingTrial(60,200,{hitches:true});
 assert.equal(result.stalledFrames,0,JSON.stringify(result));
 assert.ok(result.p95SpeedError<.04,JSON.stringify(result));
 assert.ok(result.p95CorrectionMetres<.03,JSON.stringify(result));
});
