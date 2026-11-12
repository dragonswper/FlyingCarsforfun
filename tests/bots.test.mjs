import test from 'node:test';import assert from 'node:assert/strict';
import {Simulation,C,botInput} from '../dist/physics.js';import {BOT_LEVELS,arrivalTime} from '../dist/bots.js';import {Vector3 as V} from '../dist/vendor/three.module.js';
const live=(mode='duel',difficulty='pro')=>{const s=new Simulation({mode,difficulty});s.phase='playing';return s;};
test('four bot levels have distinct reaction and thinking intervals without different physical limits',()=>{
 const names=Object.keys(BOT_LEVELS);assert.deepEqual(names,['rookie','pro','allstar','expert']);for(let i=1;i<names.length;i++){assert.ok(BOT_LEVELS[names[i]].reaction<BOT_LEVELS[names[i-1]].reaction);assert.ok(BOT_LEVELS[names[i]].think<BOT_LEVELS[names[i-1]].think);}assert.equal(BOT_LEVELS.rookie.dodge,false);assert.equal(BOT_LEVELS.expert.dodge,true);assert.equal(C.maxSpeed,23);
 const slow=live('duel','rookie');slow.goAt=0;slow.elapsed=.1;assert.equal(botInput(slow.cars[1],slow).throttle,undefined);const fast=live('duel','expert');fast.goAt=0;fast.elapsed=.1;assert.ok(Number.isFinite(botInput(fast.cars[1],fast).throttle));
});
test('a predicted own-goal threat takes priority over boost collection',()=>{
 const s=live('duel','expert'),c=s.cars[1];c.p.set(0,C.carHeight,40);c.boost=0;s.ball.p.set(2,1,25);s.ball.v.set(0,0,20);const command=botInput(c,s);assert.ok(s.prediction.goalThreat(1,0)?.time<3);assert.equal(c.botState.intent,'save');assert.ok(c.botState.target.z<c.p.z);assert.ok(Number.isFinite(command.steer));
});
test('a teammate rotates behind a closer attacking player and shares one prediction',()=>{
 const s=live('doubles'),c=s.cars[1];s.cars[0].p.set(0,C.carHeight,-1);c.p.set(-20,C.carHeight,-30);botInput(c,s);assert.equal(c.botState.intent,'rotate');assert.ok(c.botState.target.z<0);const generation=s.prediction.generation;botInput(s.cars[2],s);botInput(s.cars[3],s);assert.equal(s.prediction.generation,generation);assert.ok(arrivalTime(s.cars[0],s.ball.p)<arrivalTime(c,s.ball.p));
});
test('all bot levels play finite matches using the same fuel, speed and angular caps',()=>{
 for(const difficulty of Object.keys(BOT_LEVELS)){const s=new Simulation({mode:'doubles',difficulty});s.cars[0].bot=true;for(let tick=0;tick<120*60;tick++)s.step();assert.ok(s.cars.reduce((sum,c)=>sum+c.touches,0)>0,difficulty);for(const car of s.cars){assert.ok(car.p.toArray().every(Number.isFinite));assert.ok(car.v.length()<=23+1e-6);assert.ok(car.omega.length()<=5.5+1e-6);assert.ok(car.boost>=0&&car.boost<=100);}assert.ok(s.prediction.generation<1200,'Prediction must remain cached rather than regenerated for every car/tick');}
});
test('ball predictions include wall ricochets instead of projecting straight through the arena',()=>{
 const s=live('duel','expert');s.ball.p.set(38,4,0);s.ball.v.set(15,0,2);botInput(s.cars[1],s);const future=s.prediction.at(.5,0);assert.ok(future.p.x<C.halfWidth);assert.ok(future.v.x<0);assert.ok(s.cars[1].botState.target.toArray().every(Number.isFinite));
});
