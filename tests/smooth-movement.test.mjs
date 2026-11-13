import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,makeCar,stepCar,C} from '../dist/physics.js';
import {GuestReplica,makeState} from '../dist/network-state.js';
import {carSupport} from '../dist/arena.js';
import {Vector3} from '../dist/vendor/three.module.js';
const up=new Vector3(0,1,0),near=(a,b,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function prediction(){const sim=new Simulation({humanIds:[0,1]});sim.phase='playing';sim.cars[0].p.set(25,C.carHeight,20);sim.cars[1].p.set(-20,C.carHeight,-20);sim.cars[1].q.identity();sim.ball.p.set(20,6,0);const replica=new GuestReplica(sim,1);replica.receive(makeState(sim,1,0,'test'),0);return {sim,replica};}

test('a 600ms input window replays every unacknowledged movement rather than losing its first 200ms',()=>{
 const {sim,replica}=prediction();for(let n=0;n<72;n++)replica.step({throttle:1});const predicted=replica.predicted.p.clone(),before=replica.sample(600,0).cars[1].p.slice();assert.ok(predicted.distanceTo(sim.cars[1].p)>2);replica.receive(makeState(sim,2,0,'test'),600);assert.equal(replica.pending.length,72);assert.ok(replica.predicted.p.distanceTo(predicted)<1e-6);const after=replica.sample(600,0).cars[1].p;for(let axis=0;axis<3;axis++)near(after[axis],before[axis]);
});
test('local rendering follows new input immediately and ordinary corrections preserve the visible pose',()=>{
 const {sim,replica}=prediction();replica.step({throttle:1});near(replica.sample(8,C.step).cars[1].p[2],replica.predicted.p.z);const before=replica.sample(8,0).cars[1].p.slice(),packet=makeState(sim,2,1,'test');packet.cars[1].p[2]-=1;replica.receive(packet,10);const after=replica.sample(10,0).cars[1].p;for(let axis=0;axis<3;axis++)near(after[axis],before[axis]);replica.sample(26,1/60);assert.ok(replica.positionError.length()>0&&replica.positionError.length()<1.1);
});
test('reconciling a 600ms input acknowledgement advances the remote world for only 300ms',()=>{
 const {sim,replica}=prediction();sim.ball.v.set(10,0,0);replica.setLatency(600);for(let n=0;n<72;n++)replica.step({});replica.receive(makeState(sim,2,0,'test'),600);assert.ok(replica.predictedBall.p.x>22.9&&replica.predictedBall.p.x<23.1);assert.ok(replica.predictedBall.p.x<sim.ball.p.x+4);
});
test('remote presentation stays monotonic through jitter, reordered snapshots and brief missing updates',()=>{
 const sim=new Simulation({humanIds:[0,1]});sim.phase='playing';const replica=new GuestReplica(sim,null),queue=[];let sequence=0,lastX=null,largest=0;for(let frame=0;frame<240;frame++){const now=frame*1000/60;if(frame%3===0&&frame%21!==0){sim.elapsed=now/1000;sim.cars[0].p.x=sim.elapsed*10;sim.cars[0].v.x=10;queue.push({at:now+[50,140,70,180,90][sequence%5],state:makeState(sim,++sequence,0,'test')});}queue.sort((a,b)=>a.at-b.at);while(queue[0]?.at<=now){const packet=queue.shift();replica.receive(packet.state,now);}const output=replica.sample(now,1/60);if(output){const x=output.cars[0].p[0];if(lastX!==null){assert.ok(x>=lastX-1e-5,'remote motion reversed during jitter');largest=Math.max(largest,x-lastX);}lastX=x;}}assert.ok(largest<.36,largest);assert.ok(lastX>30);
});
test('a short jump can finish front, back and side flips and land without penetrating the ground',()=>{
 for(const direction of [{pitch:1},{pitch:-1},{steer:1},{steer:-1}]){const car=makeCar(0,0);let turn=0;for(let n=0;n<300;n++){const before=car.q.clone(),input=n<3?{jump:true}:n===5?{jump:true,...direction}:{};stepCar(car,input,C.step);turn+=before.angleTo(car.q);assert.ok(car.p.y>=carSupport(car,up)-1e-7);assert.ok(car.omega.length()<=C.maxAngularSpeed+1e-7);}assert.ok(turn>2*Math.PI*.95,turn);assert.equal(car.grounded,true);assert.ok(up.clone().applyQuaternion(car.q).y>.999);}
});
test('the final collision pass keeps a car above the floor after a stacked vehicle pushes it downward',()=>{
 const sim=new Simulation({humanIds:[0,1]});sim.phase='playing';for(const car of sim.cars){car.q.setFromAxisAngle(new Vector3(0,0,1),Math.PI/2);car.grounded=false;car.p.set(0,car.id===0?.421:1,0);car.v.set(0,0,0);}sim.ball.p.set(20,2,20);for(let n=0;n<50;n++){sim.step({},C.step);for(const car of sim.cars)assert.ok(car.p.y>=carSupport(car,up)-1e-7);}
});
test('visual correction cannot interpolate the local chassis through the floor',()=>{
 const {sim,replica}=prediction();replica.positionError.y=-2;replica.rotationError.setFromAxisAngle(new Vector3(0,0,1),1.1);const state=replica.sample(10,1/60).cars[1];assert.ok(state.p[1]>=carSupport({q:replica.visualQ},up));const packet=makeState(sim,2,0,'test');packet.phase='kickoff';packet.cars[1].p=[4,C.carHeight,5];replica.receive(packet,20);near(replica.sample(20,0).cars[1].p[0],4);assert.equal(replica.positionError.length(),0);
});

test('authoritative updates preserve an in-progress dodge through full input reconciliation',()=>{
 const host=new Simulation({humanIds:[0,1]}),guest=new Simulation({humanIds:[0,1]});host.phase=guest.phase='playing';for(const sim of [host,guest]){sim.cars[0].p.set(25,C.carHeight,20);sim.cars[1].p.set(-20,5,-20);sim.cars[1].q.identity();sim.cars[1].grounded=false;sim.cars[1].canDouble=true;sim.ball.p.set(20,6,0);}const replica=new GuestReplica(guest,1);replica.receive(makeState(host,1,0,'test'),0);let state;for(let n=0;n<60;n++){const input=n===0?{jump:true,pitch:1}:{};replica.step(input);host.step({},C.step,new Map([[1,input]]));if(n===19)state=makeState(host,2,20,'test');}assert.equal(state.cars[1].flipActive,true);assert.ok(state.cars[1].flipRotation>0);replica.receive(state,500);assert.ok(replica.predicted.q.angleTo(host.cars[1].q)<1e-6);near(replica.predicted.flipRotation,host.cars[1].flipRotation);assert.equal(replica.predicted.flipActive,host.cars[1].flipActive);
});
