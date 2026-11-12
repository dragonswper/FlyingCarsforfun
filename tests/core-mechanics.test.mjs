import test from 'node:test';import assert from 'node:assert/strict';
import {Vector3 as V,Quaternion as Q} from '../dist/vendor/three.module.js';
import {C,stepCar,makeCar,Simulation,collideArena,collideCarBall,createPads} from '../dist/physics.js';
import {curve,THROTTLE_CURVE,arenaOutline,CORNER_PLANES} from '../dist/constants.js';import {BallPrediction,stepBall} from '../dist/ball.js';
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const ball=(p=[0,5,0],v=[0,0,0],spin=[0,0,0])=>({p:new V(...p),v:new V(...v),spin:new V(...spin),q:new Q()});
function flyingJump(hold){const c=makeCar(0,0);c.p.y=20;for(let i=0;i<hold;i++)stepCar(c,{jump:true},C.step);return c;}

test('reference conversions keep masses, arena, boost, jump, radii and angular limits distinct',()=>{
 near(C.height,2048/100);near(C.gravity,650/100);assert.equal(C.carMass,180);assert.equal(C.ballMass,30);near(C.ballRadius,91.25/100);near(C.ballVisualRadius,95/100);near(C.ballRestHeight,93.15/100);near(C.boostAccel,178500/180/100);near(C.boostAirAccel,(3175/3)/100);near(C.jump,52500/180/100);near(C.holdAccel,262500/180/100);assert.equal(C.maxAngularSpeed,5.5);assert.equal(C.ballMaxSpin,6);near(C.hitboxHalfLength*2,118.01/100);near(C.hitboxHalfWidth*2,84.2/100);near(C.hitboxHalfHeight*2,36.16/100);near(C.hitboxOffsetForward,13.88/100);
});
test('a full tank lasts three seconds and tapping boost enforces the 0.1 second minimum',()=>{
 const c=makeCar(0,0);c.boost=100;for(let i=0;i<360;i++)stepCar(c,{boost:true},C.step);assert.equal(c.boost,0);stepCar(c,{boost:true},C.step);assert.equal(c.boosting,false);
 const tap=makeCar(0,0);tap.boost=100;stepCar(tap,{boost:true},C.step);for(let i=0;i<20;i++)stepCar(tap,{},C.step);near(tap.boost,100-100/3*.1);assert.equal(tap.boosting,false);
});
test('air boost and the throttle curve use the source acceleration values',()=>{
 const c=makeCar(0,0);c.p.y=10;c.grounded=false;stepCar(c,{boost:true},C.step);near(c.v.z,(3175/3)/100*C.step);const d=makeCar(0,0);d.v.z=10;stepCar(d,{throttle:1},C.step);near(d.v.z,10+(1600*(1-.9*1000/1400)/100)*C.step);near(curve(THROTTLE_CURVE,14),1.6);near(curve(THROTTLE_CURVE,14.1),0);
});
test('double-jump eligibility expires after jump hold ends, and throttle alone is not a dodge',()=>{
 const tap=flyingJump(1);for(let i=0;i<157;i++)stepCar(tap,{},C.step);const before=tap.v.y;stepCar(tap,{jump:true},C.step);near(tap.v.y,before-C.gravity*C.step);assert.equal(tap.flipTime,0);
 const held=flyingJump(24);for(let i=0;i<143;i++)stepCar(held,{},C.step);const vy=held.v.y;stepCar(held,{jump:true,throttle:1},C.step);assert.ok(held.v.y>vy+2.8);assert.equal(held.flipTime,0);const after=held.v.y;stepCar(held,{jump:true},C.step);near(held.v.y,after-C.gravity*C.step);
});
test('rounded corner outline follows the imported collision profile rather than a guessed circle',()=>{
 const outline=arenaOutline();assert.ok(outline.some(([x,z])=>Math.abs(x-32)<1e-5&&Math.abs(z-48.64)<1e-5));assert.ok(outline.some(([x,z])=>Math.abs(x-40.96)<1e-5&&Math.abs(z-35.84)<1e-5));
 const b=ball([38,5,48],[8,0,8]);collideArena(b,C.ballRestHeight);for(const p of CORNER_PLANES)assert.ok(p.nx*Math.abs(b.p.x)+p.nz*Math.abs(b.p.z)-p.boundary>C.ballRestHeight-.03);assert.ok(b.v.x<0&&b.v.z<0);
});
test('oriented Octane box contacts use the published forward and upward offsets',()=>{
 const c=makeCar(0,0);c.p.y=5;c.grounded=false;const nose=(13.88+118.01/2+91.25)/100,y=5+20.75/100;
 assert.equal(collideCarBall(c,ball([0,y,nose+.001],[0,0,-2])),false);assert.equal(collideCarBall(c,ball([0,y,nose-.001],[0,0,-2])),true);
 const ceiling=makeCar(0,0);ceiling.p.set(15,C.height,0);collideArena(ceiling,C.carHeight,.05,true);near(ceiling.p.y,C.height-(20.75+36.16/2)/100);
});
test('ball prediction follows the same fixed-step bounce and friction model without moving the live ball',()=>{
 const start=ball([38,5,0],[12,-1,3],[0,0,-4]),prediction=new BallPrediction();prediction.update(start,0);near(start.p.x,38);const actual=ball([38,5,0],[12,-1,3],[0,0,-4]);for(let i=0;i<60;i++)stepBall(actual);assert.ok(actual.p.distanceTo(prediction.at(.5,0).p)<1e-6);assert.ok(actual.v.distanceTo(prediction.at(.5,0).v)<1e-6);const generation=prediction.generation;for(let i=0;i<4;i++)prediction.update(start,.01);assert.equal(prediction.generation,generation);prediction.invalidate();prediction.update(start,.02);assert.equal(prediction.generation,generation);prediction.update(start,.04);assert.equal(prediction.generation,generation+1);
});
test('rolling contact exchanges spin and velocity without the previous arbitrary ground slowdown',()=>{
 const b=ball([0,C.ballRestHeight,0],[4,0,0],[0,0,-4/C.ballRadius]);for(let i=0;i<120;i++)stepBall(b);assert.ok(b.v.x>3.8&&b.v.x<4);near(b.p.y,C.ballRestHeight);const fast=ball([0,5,0],[90,0,0],[0,100,0]);stepBall(fast);assert.ok(fast.v.length()<=60+1e-6);assert.ok(fast.spin.length()<=6+1e-6);
});
test('boost cylinders use the game height and do not pick up from above their trigger',()=>{
 const pads=createPads();near(pads.find(p=>!p.big).p.y,.7);near(pads.find(p=>p.big).p.y,.73);const sim=new Simulation({mode:'duel'});sim.phase='playing';sim.cars[1].demoTime=100;const c=sim.cars[0],pad=sim.pads.find(p=>!p.big);c.p.copy(pad.p).setY(1.7);c.boost=0;sim.step();assert.equal(c.boost,0);c.p.copy(pad.p).setY(1.6);c.v.set(0,0,0);sim.step();assert.equal(c.boost,12);
});
test('goals use the source scoring threshold and assists score fifty, not arbitrary touch points',()=>{
 const sim=new Simulation({mode:'doubles'});sim.phase='playing';for(const c of sim.cars)c.bot=false;sim.ball.p.set(0,2,51.2425+.9125-.0001);sim.step();assert.equal(sim.score[0],0);sim.lastTouch=0;sim.touchHistory=[{id:1,team:0,time:sim.elapsed}];sim.ball.p.z+=.001;sim.step();assert.equal(sim.score[0],1);assert.equal(sim.cars[0].score,100);assert.equal(sim.cars[1].score,50);assert.equal(sim.cars[1].assists,1);
});
test('supersonic has the source grace period and reverse-facing contact does not demolish',()=>{
 const c=makeCar(0,0);c.v.z=22.1;stepCar(c,{throttle:1},C.step);assert.equal(c.supersonic,true);c.v.z=21.5;for(let i=0;i<60;i++)stepCar(c,{throttle:1},C.step);assert.equal(c.supersonic,true);for(let i=0;i<70;i++)stepCar(c,{throttle:1},C.step);assert.equal(c.supersonic,false);
 const sim=new Simulation({mode:'duel'});sim.phase='playing';const [a,b]=sim.cars;a.q.setFromAxisAngle(new V(0,1,0),Math.PI);b.q.identity();b.bot=false;a.p.set(0,C.carHeight,0);b.p.set(0,C.carHeight,.6);a.v.z=23;sim.ball.p.set(20,1,20);sim.step();assert.equal(b.demoTime,0);assert.ok(b.v.z>0);assert.equal(a.score,0);
});
