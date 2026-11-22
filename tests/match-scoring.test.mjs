import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation,C} from '../dist/physics.js';
import {MatchScoring,MATCH_POINTS,goalThreat,matchMVP} from '../dist/scoring.js';
import {makeState,validState,GuestReplica,cleanEvents} from '../dist/network-state.js';

function live(mode='duel'){
 const sim=new Simulation({mode,humanIds:[0,1,2,3]});sim.phase='playing';
 for(const car of sim.cars)car.p.set(-25,C.carHeight,-30+car.id*10);
 return sim;
}
test('a real, directed contact awards a shot and its points exactly once before the goal',()=>{
 const sim=live(),car=sim.cars[0];car.p.set(0,C.carHeight,30);car.v.z=16;
 sim.ball.p.set(0,C.ballRestHeight,31.3);sim.step();
 assert.equal(car.shots,1);assert.equal(car.score,10);assert.equal(sim.score[0],0);
 assert.ok(sim.events.some(e=>e.type==='score'&&e.car===0&&e.kind==='shot'&&e.points===10));
 for(let i=0;i<3;i++)sim.scoring.touch(sim,car);
 assert.equal(car.shots,1);assert.equal(car.score,10);
 sim.lastTouch=0;sim.goal(0);assert.equal(car.goals,1);assert.equal(car.score,110);assert.deepEqual(sim.score,[1,0]);
});
test('redirecting an opponent shot away from the own goal earns a defensive save',()=>{
 const sim=live(),car=sim.cars[0];car.p.set(0,C.carHeight,-40);car.v.z=8;
 sim.ball.p.set(0,C.ballRestHeight,-38.6);sim.ball.v.z=-20;sim.lastTouch=1;
 sim.step();assert.equal(car.saves,1);assert.equal(car.score,50);assert.ok(sim.ball.v.z>0);
 assert.ok(sim.events.some(e=>e.type==='score'&&e.kind==='save'&&e.car===0));
});
test('backpasses, wide balls, practice hits and sustained contacts do not farm match points',()=>{
 const sim=live(),car=sim.cars[0];sim.ball.p.set(30,1,-38);sim.ball.v.set(0,0,-20);
 assert.equal(goalThreat(sim.ball,0),null);
 sim.ball.p.set(C.goalWidth-C.ballRadius,1,-38);assert.equal(goalThreat(sim.ball,0),null);
 sim.ball.p.set(0,1,-38);sim.lastTouch=0;sim.scoring.capture(sim);sim.ball.v.z=10;sim.scoring.touch(sim,car);
 assert.equal(car.saves,0);assert.equal(car.score,0);
 const practice=live('free');practice.ball.p.set(0,1,30);practice.ball.v.z=20;
 practice.scoring.capture(practice);practice.scoring.touch(practice,practice.cars[0]);assert.equal(practice.cars[0].shots,0);
 const tracker=new MatchScoring();sim.ball.p.set(0,1,30);sim.ball.v.z=20;tracker.capture(sim);tracker.touch(sim,car);
 assert.equal(car.shots,1);for(let i=0;i<20;i++){sim.elapsed+=.05;tracker.capture(sim);tracker.touch(sim,car);}assert.equal(car.shots,1);
});
test('winning-team MVP uses match points, then goals/saves, and excludes practice and ties',()=>{
 const sim=live('doubles');sim.phase='ended';sim.score=[2,1];sim.cars[0].score=100;sim.cars[1].score=150;sim.cars[2].score=500;
 assert.equal(matchMVP(sim).id,1);sim.cars[0].score=150;sim.cars[0].goals=2;assert.equal(matchMVP(sim).id,0);
 sim.score=[1,1];assert.equal(matchMVP(sim),null);const practice=live('free');practice.phase='ended';practice.score=[1,0];assert.equal(matchMVP(practice),null);
});
test('authoritative shots and match points replicate, while malformed score notifications are discarded',()=>{
 const authority=live(),guest=live();authority.cars[0].shots=2;authority.cars[0].saves=1;authority.cars[0].score=70;
 const state=makeState(authority,1,0,'match');assert.equal(validState(state,guest),true);
 const corrupt=structuredClone(state);corrupt.cars[0].shots=-1;assert.equal(validState(corrupt,guest),false);
 const replica=new GuestReplica(guest,0);assert.equal(replica.receive(state,0),true);assert.equal(guest.cars[0].shots,2);assert.equal(guest.cars[0].score,70);
 const events=cleanEvents([{type:'score',car:0,kind:'shot',points:MATCH_POINTS.shot},{type:'score',car:1,kind:'goal',points:9999},{type:'score',car:20,kind:'save',points:50},{type:'score',car:0,kind:'__proto__',points:10}]);
 assert.deepEqual(events,[{type:'score',car:0,kind:'shot',points:10}]);
});
