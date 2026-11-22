import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,C,botInput} from '../dist/physics.js';
import {kickoffTaker,chooseShotTarget} from '../dist/bots.js';
import {Vector3} from '../dist/vendor/three.module.js';

test('both teams choose one kickoff taker, prefer the nearest and apply left-goes to ties',()=>{
 const sim=new Simulation({mode:'doubles',difficulty:'expert'});sim.phase='playing';sim.goAt=0;sim.elapsed=.5;
 sim.cars[0].p.set(-2.56,C.carHeight,-38.4);sim.cars[1].p.set(2.56,C.carHeight,-38.4);
 assert.equal(kickoffTaker(sim,0),0);assert.equal(botInput(sim.cars[0],sim).throttle,1);assert.equal(sim.cars[0].botState.intent,'kickoff');
 botInput(sim.cars[1],sim);assert.equal(sim.cars[1].botState.intent,'kickoff-cover');
 sim.cars[0].p.z=-46;assert.equal(kickoffTaker(sim,0),1);
 sim.cars[2].p.set(-2.56,C.carHeight,38.4);sim.cars[3].p.set(2.56,C.carHeight,38.4);
 assert.equal(kickoffTaker(sim,1),3);
});
test('support protects the back post while a closer teammate challenges in the defensive half',()=>{
 const sim=new Simulation({mode:'doubles',difficulty:'expert'});sim.phase='playing';sim.ball.p.set(12,1,-30);
 sim.cars[0].p.set(12,C.carHeight,-32);sim.cars[1].p.set(-12,C.carHeight,-45);
 botInput(sim.cars[1],sim);assert.equal(sim.cars[1].botState.intent,'cover');assert.ok(sim.cars[1].botState.target.x<0);assert.ok(sim.cars[1].botState.target.z<-40);
});
test('shot placement aims away from a goal-side defender',()=>{
 const sim=new Simulation({mode:'duel'}),attacker=sim.cars[0];sim.cars[1].p.set(-5,C.carHeight,48);
 const target=chooseShotTarget(attacker,sim,new Vector3(0,1,25));assert.ok(target.x>0);assert.equal(target.z,C.halfLength);
});
test('bots recover from inverted ground poses and reverse down walls without wasting boost',()=>{
 const sim=new Simulation({mode:'duel',difficulty:'expert'});sim.phase='playing';const car=sim.cars[1];
 car.p.set(0,.4,5);car.q.setFromAxisAngle(new Vector3(0,0,1),Math.PI);car.grounded=false;car.v.set(0,0,0);
 assert.equal(botInput(car,sim).jump,true);assert.equal(car.botState.recoverAt,1);
 car.grounded=true;car.normal.set(-1,0,0);car.p.set(40,8,0);car.q.setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2);
 const out=botInput(car,sim);assert.equal(out.throttle,-1);assert.equal(out.boost,false);
});
