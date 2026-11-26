import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation, C, makeCar, stepCar} from '../dist/physics.js';
import {matchRules, physicalRules} from '../dist/match-rules.js';
import {serverOptions} from '../dist/server-options.js';
import {
  HOOPS,
  hoopsGoal,
  hoopsBallContacts,
  hoopsCarContacts,
} from '../dist/hoops-physics.js';
import {goalThreat} from '../dist/scoring.js';
import {GuestReplica, makeState} from '../dist/network-state.js';
import {Vector3, Quaternion} from '../dist/vendor/three.module.js';
import {collideCourseBox} from '../dist/overdrive/course-physics.js';
import {carSupport} from '../dist/arena.js';
import {ArcadeDirector, COURSE, TARGETS} from '../dist/overdrive/arcade.js';
const playing = (options) => {
  const s = new Simulation(options);
  s.phase = 'playing';
  return s;
};
test('mutators are bounded presets and competitive queues retain standard physics', () => {
  assert.deepEqual(
    matchRules({
      gravity: 'evil',
      ball: Infinity,
      boost: 'unlimited',
      bounce: 'soft',
      scoreLimit: 99,
    }),
    {
      gravity: 'normal',
      ball: 'normal',
      boost: 'unlimited',
      bounce: 'soft',
      scoreLimit: 0,
    },
  );
  assert.equal(physicalRules({gravity: 'low'}).gravity, C.gravity / 2);
  assert.equal(physicalRules({ball: 'large'}).radius, C.ballRadius * 1.5);
  assert.equal(
    serverOptions({mode: 'duel', rules: {gravity: 'low'}}).rules.gravity,
    'normal',
  );
  assert.equal(
    serverOptions({mode: 'custom', rules: {gravity: 'low'}}).rules.gravity,
    'low',
  );
  assert.equal(serverOptions({mode: 'hoops'}).mode, 'hoops');
});
test('low gravity affects airborne cars and balls equally, oversized balls rest on their true radius, unlimited boost does not drain', () => {
  const normal = playing({
      mode: 'custom',
      players: [{id: 0, team: 0}],
      rules: {},
    }),
    low = playing({
      mode: 'custom',
      players: [{id: 0, team: 0}],
      rules: {gravity: 'low', boost: 'unlimited', ball: 'large'},
    });
  for (const s of [normal, low]) {
    s.cars[0].p.set(20, 10, 0);
    s.cars[0].grounded = false;
    s.ball.p.set(-20, 10, 0);
  }
  for (let i = 0; i < 60; i++) {
    normal.step({boost: true});
    low.step({boost: true});
  }
  assert.ok(low.cars[0].p.y > normal.cars[0].p.y + 0.3);
  assert.ok(low.ball.p.y > normal.ball.p.y + 0.3);
  assert.equal(low.cars[0].boost, 100);
  assert.ok(normal.cars[0].boost < 33);
  for (let i = 0; i < 1000; i++) low.step({});
  assert.ok(low.ball.p.y >= low.rules.radius + C.ballMargin - 0.01);
  assert.equal(C.gravity, 6.5);
  assert.equal(C.ballRadius, 0.9125);
});
test('custom scoring limits end at the selected score after the goal celebration', () => {
  const s = playing({mode: 'custom', rules: {scoreLimit: 1}});
  s.goal(0);
  for (let i = 0; i < 481; i++) s.step({});
  assert.equal(s.phase, 'ended');
  assert.deepEqual(s.score, [1, 0]);
});
test('Hoops scores only a downward swept basket inside the rim, uses four cars and closes football goal tunnels', () => {
  const s = playing({mode: 'hoops'});
  assert.equal(s.cars.length, 4);
  assert.equal(s.cars.filter((c) => c.team === 0).length, 2);
  s.ball.p.set(0, 6.2, HOOPS.z);
  s.ball.v.set(0, -9, 0);
  for (let i = 0; i < 20 && s.phase === 'playing'; i++) s.step({});
  assert.deepEqual(s.score, [1, 0]);
  const up = {
    p: new Vector3(0, 6, HOOPS.z),
    v: new Vector3(0, 8, 0),
    radius: C.ballRadius,
  };
  assert.equal(hoopsGoal(new Vector3(0, 5.7, HOOPS.z), up), null);
  assert.equal(
    hoopsGoal(new Vector3(4.5, 6, HOOPS.z), {
      ...up,
      p: new Vector3(4.5, 5.6, HOOPS.z),
      v: new Vector3(0, -8, 0),
    }),
    null,
  );
  const closed = playing({mode: 'hoops'});
  closed.ball.p.set(0, 2, 50);
  closed.ball.v.set(0, 0, 20);
  for (let i = 0; i < 100; i++) closed.step({});
  assert.ok(closed.ball.p.z < C.halfLength);
  assert.deepEqual(closed.score, [0, 0]);
});
test('Hoops backboards and rim rebound the ball, and shot detection targets the basket rather than a football plane', () => {
  const b = {
    p: new Vector3(0, 9, 45.5),
    v: new Vector3(0, 0, 10),
    radius: C.ballRadius,
  };
  assert.ok(hoopsBallContacts(b) > 0);
  assert.ok(b.v.z < 0);
  const threat = goalThreat(
    {p: new Vector3(0, 8, HOOPS.z), v: new Vector3(0, -1, 0), hoops: true},
    1,
  );
  assert.ok(threat && threat.time > 0);
  assert.equal(
    goalThreat(
      {p: new Vector3(15, 8, HOOPS.z), v: new Vector3(0, -1, 0), hoops: true},
      1,
    ),
    null,
  );
});
test('guest prediction receives the same per-match gravity, radius and boost rules as the authority', () => {
  const options = {
      mode: 'custom',
      dedicated: true,
      players: [
        {id: 0, team: 0},
        {id: 1, team: 1},
      ],
      rules: {gravity: 'low', ball: 'large', boost: 'unlimited'},
    },
    host = playing(options),
    guest = playing(options);
  for (const s of [host, guest]) {
    s.cars[1].p.set(0, 8, -10);
    s.cars[1].grounded = false;
    s.cars[0].p.x = 30;
    s.ball.p.x = -30;
  }
  const replica = new GuestReplica(guest, 1);
  replica.receive(makeState(host, 1, 0, 'rules'), 0);
  for (let i = 0; i < 30; i++) {
    replica.step({throttle: 1, boost: true});
    host.step({}, C.step, new Map([[1, {throttle: 1, boost: true}]]));
  }
  assert.ok(replica.predicted.p.distanceTo(host.cars[1].p) < 0.01);
  assert.equal(replica.predictedBall.radius, host.ball.radius);
  assert.equal(replica.predicted.boost, 100);
});
test('real course hurdles stop a low car and allow a clean jump without ejecting it below the pitch', () => {
  const box = {x: 0, y: 0.7, z: 0, w: 6, h: 1.4, d: 0.7},
    car = makeCar(0, 0);
  car.p.set(0, C.carHeight, -0.6);
  car.v.z = 10;
  assert.equal(collideCourseBox(car, box), true);
  assert.ok(car.p.y >= 0);
  assert.ok(car.v.z <= 0.001);
  car.p.set(0, 3, 0);
  assert.equal(collideCourseBox(car, box), false);
  car.p.set(0, 1.5, 0);
  car.v.set(0, -2, 0);
  assert.equal(collideCourseBox(car, box), true);
  assert.equal(car.grounded, true);
  assert.ok(car.p.y >= 1.55);
});
test('solo targets count real plane crossings, courses require elevated clearance, and online worlds cannot be mutated', () => {
  const s = playing({mode: 'free'}),
    d = new ArcadeDirector(s, 'targets');
  s.ball.p.set(0, 2.5, 29.9);
  d.previous.copy(s.ball.p);
  s.ball.p.z = 30.1;
  s.ball.v.z = 8;
  d.step(0.1);
  assert.equal(d.points, 100);
  assert.equal(d.index, 1);
  assert.equal(s.phase, 'playing');
  const course = new ArcadeDirector(playing({mode: 'free'}), 'course');
  for (const gate of COURSE) {
    course.sim.cars[0].p.fromArray(gate.p);
    course.step(0.1);
  }
  assert.equal(course.completed, true);
  assert.equal(course.status, 'result');
  assert.ok(course.points >= 800);
  assert.throws(
    () => new ArcadeDirector(new Simulation({mode: 'duel'})),
    /offline/,
  );
  assert.equal(TARGETS.length, 8);
});

test('attacking and keeper personalities make different tactical choices without different physics', async () => {
  const {botInput} = await import('../dist/bots.js');
  const sims = ['balanced', 'attacker', 'keeper'].map((botStyle) => {
    const s = playing({mode: 'duel', difficulty: 'pro', botStyle});
    s.elapsed = 2;
    s.lastTouch = 0;
    s.ball.p.set(0, C.ballRestHeight, 0);
    s.cars[1].p.set(0, C.carHeight, 15);
    s.cars[1].q.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
    s.cars[1].boost = 100;
    botInput(s.cars[1], s);
    return s;
  });
  assert.ok(
    sims[1].cars[1].botState.target.z < sims[0].cars[1].botState.target.z,
  );
  assert.equal(sims[2].cars[1].botState.intent, 'cover');
  assert.ok(sims[2].cars[1].botState.target.z > 40);
  for (const s of sims) {
    for (let i = 0; i < 400; i++) s.step({});
    assert.ok(s.cars[1].v.length() <= C.maxSpeed + 0.001);
    assert.ok(Number.isFinite(s.cars[1].p.x + s.cars[1].p.y + s.cars[1].p.z));
  }
});

test('Hoops rims and backboards stop rotated cars using the same support extents as the arena', () => {
  const car = makeCar(0, 0);
  car.q.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4);
  car.p.set(HOOPS.radius, HOOPS.height + 0.2, HOOPS.z);
  const rimHeight =
    HOOPS.height + carSupport(car, new Vector3(0, 1, 0)) + HOOPS.tube;
  car.v.set(0, -5, 0);
  hoopsCarContacts(car, carSupport);
  assert.ok(car.p.y >= rimHeight);
  assert.ok(car.v.y >= 0);
  car.p.set(0, 9, HOOPS.boardZ - 0.3);
  car.v.set(0, 0, 10);
  hoopsCarContacts(car, carSupport);
  assert.ok(car.p.z <= HOOPS.boardZ - carSupport(car, new Vector3(0, 0, 1)));
  assert.ok(car.v.z <= 0);
});
