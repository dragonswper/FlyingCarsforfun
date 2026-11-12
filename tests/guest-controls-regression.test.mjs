import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,C,makeCar,stepCar} from '../dist/physics.js';
import {RemoteInputs,packInputFrames} from '../dist/network-protocol.js';
import {GuestReplica,makeState} from '../dist/network-state.js';
import {Input} from '../dist/input.js';
import {ChaseCamera} from '../dist/camera.js';
import {CAMERA_DEFAULTS} from '../dist/preferences.js';
import {Vector3,Quaternion} from '../dist/vendor/three.module.js';

test('a delayed first batch and four-second input outage never permanently lock out guest controls',()=>{
 const remote=new RemoteInputs();assert.equal(remote.receive([{n:480,i:{throttle:1,boost:true}}],4000),true);assert.equal(remote.next(4000).throttle,1);assert.equal(remote.ack,480);assert.equal(remote.next(4400).boost,false);assert.equal(remote.receive([{n:960,i:{throttle:-1}}],8000),true);assert.equal(remote.next(8000).throttle,-1);assert.equal(remote.ack,960);assert.equal(remote.receive([{n:961,i:{}}],8010),true);assert.equal(remote.next(8010).throttle,0);assert.ok(remote.queue.length<=1);
});
test('newest controls apply immediately without FIFO delay, while two jump edges survive a redundant batch',()=>{
 const remote=new RemoteInputs();remote.receive([{n:1,i:{throttle:1,jump:true}},{n:2,i:{jump:false}},{n:3,i:{jump:true}},{n:4,i:{jump:false}}],0);assert.equal(remote.next(0).jump,true);assert.equal(remote.ack,4);assert.equal(remote.current.throttle,0);assert.equal(remote.next(8).jump,false);assert.equal(remote.next(16).jump,true);assert.equal(remote.next(24).jump,false);
});
test('guest predicts physical ball and car contacts before a new host snapshot without changing authority',()=>{
 const sim=new Simulation({humanIds:[0,1]});sim.phase='playing';sim.cars[1].p.set(0,C.carHeight,0);sim.cars[1].q.identity();sim.cars[1].v.set(0,0,15);sim.ball.p.set(0,C.ballRestHeight,1.4);const replica=new GuestReplica(sim,1),originalBall=sim.ball.p.clone();replica.receive(makeState(sim,1,0,'test'),0);replica.step({throttle:1});assert.ok(replica.predictedBall.v.length()>1);assert.ok(replica.predictedBall.p.z>originalBall.z);assert.equal(sim.ball.v.length(),0);assert.equal(sim.cars[1].touches,0);assert.deepEqual(sim.score,[0,0]);
 sim.cars[0].p.set(0,C.carHeight,1);sim.ball.p.set(10,2,10);replica.receive(makeState(sim,2,0,'test'),10);const other=replica.otherCars[0];replica.step({throttle:1});assert.ok(replica.predicted.p.distanceTo(other.p)>1);assert.equal(sim.cars[0].p.z,1);const corrected=makeState(sim,3,replica.inputSequence,'test');corrected.ball.p=[-8,2,-8];replica.receive(corrected,20);assert.equal(replica.pending.length,0);assert.deepEqual(replica.predictedBall.p.toArray(),[-8,2,-8]);
});
test('control redundancy and correction work stay bounded after prolonged high latency',()=>{
 const sim=new Simulation({humanIds:[0,1]});sim.phase='playing';const replica=new GuestReplica(sim,1);for(let n=0;n<600;n++)replica.step({throttle:1,steer:.3});assert.equal(replica.pending.length,120);assert.equal(replica.inputFrames().length,4);const bytes=Buffer.byteLength(JSON.stringify({t:'input',matchId:crypto.randomUUID(),frames:replica.inputFrames()}));assert.ok(bytes*60*8<350000);let replays=0;const predict=replica.predict.bind(replica);replica.predict=input=>{replays++;predict(input);};replica.receive(makeState(sim,1,0,'test'),5000);assert.equal(replays,48);assert.ok(replica.predicted.p.toArray().every(Number.isFinite));
});
test('opposite pitch cancels front-flip rotation while preserving the remainder of its flight',()=>{
 const car=makeCar(0,0);car.p.set(0,12,0);car.grounded=false;car.canDouble=true;car.hasJumped=true;stepCar(car,{jump:true,pitch:1},C.step);for(let n=0;n<20;n++)stepCar(car,{pitch:1},C.step);const before=car.q.clone();for(let n=0;n<24;n++)stepCar(car,{pitch:-1},C.step);assert.equal(car.flipAxis.x,0);assert.ok(Math.abs(car.omega.x)<.01);assert.ok(before.angleTo(car.q)<.15);assert.ok(car.p.y>1);assert.ok(car.flipTime>0);
});
test('releasing a two-button mouse chord clears boost and jump without a second click',t=>{
 const old={window:globalThis.window,document:globalThis.document};globalThis.window=new EventTarget();globalThis.document=new EventTarget();document.hidden=false;const canvas=new EventTarget(),input=new Input(canvas,{active:()=>true});t.after(()=>{input.dispose();Object.assign(globalThis,old);});const mouse=(target,type,button,buttons)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{button,buttons});target.dispatchEvent(event);};mouse(canvas,'pointerdown',0,1);mouse(canvas,'mousedown',2,3);assert.equal(input.read().boost,true);assert.equal(input.read().jump,true);mouse(window,'mouseup',0,2);assert.equal(input.read().boost,false);assert.equal(input.read().jump,true);mouse(window,'pointerup',2,0);assert.equal(input.read().jump,false);assert.equal(input.read().boost,false);
});
test('controller look returns to the chase heading after the right stick is released',()=>{
 const camera=new ChaseCamera(),p=new Vector3(0,1,0),q=new Quaternion(),ball=new Vector3(0,1,15);camera.stick(1,.4,false);for(let n=0;n<60;n++)camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/60);assert.ok(Math.abs(camera.stickYaw)>2);camera.stick(0,0,false);for(let n=0;n<60;n++)camera.sample(p,q,ball,CAMERA_DEFAULTS,false,1/60);assert.ok(Math.abs(camera.stickYaw)<1e-5);assert.ok(Math.abs(camera.stickPitch)<1e-5);assert.equal(camera.orbitYaw,0);
});
test('a constrained 256kbps uplink with 300ms one-way delay remains responsive after a four-second outage',()=>{
 const remote=new RemoteInputs(),packets=[];let available=0,n=0,firstRestored=null,released=null;
 for(let tick=0;tick<960;tick++){const now=tick*C.step*1000,drive=tick<840;const frames=Array.from({length:Math.min(4,++n)},(_,i)=>({n:n-Math.min(4,n)+i+1,i:{throttle:drive?1:0,boost:drive,jump:false,steer:.12345}}));
  if(tick%2===0){const wire=packInputFrames(frames),bytes=Buffer.byteLength(JSON.stringify({t:'input',matchId:crypto.randomUUID(),frames:wire}));assert.ok(bytes<300);if(tick>=480){available=Math.max(available,now)+bytes/(256000/8)*1000;packets.push({at:available+300,wire});}}
  while(packets.length&&packets[0].at<=now){remote.receive(packets.shift().wire,now);}const input=remote.next(now);if(tick>480&&input.throttle===1&&firstRestored===null)firstRestored=now;if(tick>=840&&input.throttle===0&&released===null)released=now;
 }
 assert.ok(firstRestored>=4000&&firstRestored<4500);assert.ok(released>=7000&&released<7500);assert.ok(remote.ack>900);assert.ok(packets.length<25);
});
