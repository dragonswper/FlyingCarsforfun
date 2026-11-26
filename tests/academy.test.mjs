import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation, C} from '../dist/physics.js';
import {
  AcademyDirector,
  academyProgress,
  medalFor,
  practiceBall,
} from '../dist/academy/director.js';
import {ACADEMY_PACKS, ACADEMY_DRILLS} from '../dist/academy/catalog.js';
const world = () => new Simulation({mode: 'free'});
test('24 unique Academy setups are within the arena and can reset without changing shared rules', () => {
  assert.equal(ACADEMY_PACKS.length, 6);
  assert.equal(ACADEMY_DRILLS.length, 24);
  assert.equal(new Set(ACADEMY_DRILLS.map((d) => d.key)).size, 24);
  for (const p of ACADEMY_PACKS)
    for (let index = 0; index < 4; index++) {
      const sim = world(),
        director = new AcademyDirector(sim, {pack: p.id, index});
      assert.equal(sim.phase, 'playing');
      assert.equal(sim.cars.length, 1);
      assert.equal(sim.options.mode, 'free');
      assert.ok(sim.ball.p.y >= C.ballRestHeight);
      assert.ok(Math.abs(sim.ball.p.x) < C.halfWidth);
      assert.ok(Math.abs(sim.ball.p.z) < C.halfLength);
      sim.step({}, C.step);
      director.step(C.step);
      for (const value of [...sim.cars[0].p, ...sim.ball.p])
        assert.ok(Number.isFinite(value));
      assert.ok(director.time > 0);
      assert.ok(director.time < 1);
      assert.equal(director.progress[director.drill.key].attempts, 1);
      sim.cars[0].v.set(30, 30, 30);
      sim.cars[0].hasJumped = true;
      director.reset();
      assert.equal(sim.cars[0].v.length(), 0);
      assert.equal(sim.cars[0].hasJumped, false);
      assert.equal(director.time, 0);
    }
});
test('Academy refuses multiplayer/dedicated worlds and practice tools never modify them', () => {
  for (const options of [
    {mode: 'duel'},
    {mode: 'free', dedicated: true},
    {mode: 'custom'},
  ]) {
    const sim = new Simulation(options),
      before = sim.ball.p.toArray();
    assert.throws(() => new AcademyDirector(sim), /offline/);
    assert.equal(practiceBall(sim, 'pop'), false);
    assert.deepEqual(sim.ball.p.toArray(), before);
  }
});
test('goal medals require the player’s own touch, records are monotonic and results commit once', () => {
  const sim = world(),
    d = new AcademyDirector(sim);
  sim.score[0] = 1;
  d.step(0.1);
  assert.equal(d.status, 'running');
  sim.lastTouch = 0;
  sim.cars[0].touches = 1;
  d.step(0.1);
  assert.equal(d.outcome.success, true);
  assert.equal(d.outcome.medal, 3);
  const r = structuredClone(d.progress);
  d.finish(true);
  d.step(100);
  assert.deepEqual(d.progress, r);
  d.reset();
  sim.lastTouch = 0;
  sim.cars[0].touches = 1;
  sim.score[0] = 1;
  d.step(d.drill.par * 2);
  assert.equal(d.progress[d.drill.key].medal, 3);
  assert.equal(d.progress[d.drill.key].best, r[d.drill.key].best);
  assert.equal(medalFor(d.drill, d.drill.par * 1.4), 2);
  assert.equal(medalFor(d.drill, d.drill.par * 2), 1);
});
test('goalkeeper must actually clear the ball, and own goals fail a drill', () => {
  const sim = world(),
    d = new AcademyDirector(sim, {pack: 'keeper'});
  sim.lastTouch = 0;
  sim.cars[0].touches = 1;
  sim.ball.v.z = -3;
  d.step(0.1);
  assert.equal(d.status, 'running');
  sim.ball.v.z = 3;
  d.step(0.1);
  assert.equal(d.outcome.success, true);
  d.reset();
  sim.phase = 'goal';
  sim.score[1] = 1;
  d.step(0.1);
  assert.equal(d.outcome.success, false);
});
test('airborne objectives require height, routes require ordered gates, recovery needs sustained upright contact', () => {
  const sim = world(),
    d = new AcademyDirector(sim, {pack: 'aerial'});
  sim.lastTouch = 0;
  sim.cars[0].touches = 1;
  sim.ball.p.y = 1;
  d.step(0.1);
  assert.equal(d.status, 'running');
  sim.ball.p.y = 5;
  d.step(0.1);
  assert.equal(d.outcome.success, true);
  const route = new AcademyDirector(world(), {pack: 'control'});
  route.sim.cars[0].p.fromArray(route.drill.checkpoints[2]);
  route.step(0.1);
  assert.equal(route.checkpoint, 0);
  for (const target of route.drill.checkpoints) {
    route.sim.cars[0].p.fromArray(target);
    route.step(0.1);
  }
  assert.equal(route.outcome.success, true);
  const rec = new AcademyDirector(world(), {pack: 'control', index: 3});
  rec.step(0.6);
  assert.equal(rec.status, 'running');
  rec.sim.cars[0].q.identity();
  rec.sim.cars[0].grounded = true;
  rec.step(0.3);
  assert.equal(rec.status, 'running');
  rec.step(0.3);
  assert.equal(rec.outcome.success, true);
});
test('timeout cannot earn medals, pack next is bounded, and progress sanitizes malformed browser saves', () => {
  const d = new AcademyDirector(world(), {pack: 'control', index: 3});
  d.step(99);
  assert.equal(d.outcome.success, false);
  assert.equal(d.next(), false);
  assert.deepEqual(academyProgress({unknown: {medal: 3}}), {});
  const raw = academyProgress({
    'striker/straight': {
      attempts: -4,
      completions: Infinity,
      best: -1,
      medal: 99,
    },
  })['striker/straight'];
  assert.equal(raw.attempts, 0);
  assert.equal(raw.completions, 0);
  assert.equal(raw.best, null);
});
test('practice pass and pop are relative to car heading, and exported Blender assets contain original meshes', () => {
  const sim = world();
  sim.cars[0].q.identity();
  sim.cars[0].p.set(3, C.carHeight, -12);
  assert.equal(practiceBall(sim, 'pass'), true);
  assert.ok(sim.ball.v.z < 0);
  assert.equal(sim.ball.p.x, 3);
  assert.equal(practiceBall(sim, 'pop'), true);
  assert.equal(sim.ball.v.y, 13);
  const bytes = readFileSync(
    new URL('../dist/assets/academy/guides.glb', import.meta.url),
  );
  assert.ok(bytes.length < 50000);
  const json = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  for (const name of ['Academy_Hoop', 'Academy_Cone', 'Academy_Chevron'])
    assert.ok(json.nodes.some((n) => n.name === name));
  assert.ok(
    readFileSync(new URL('../art/academy-guides.blend', import.meta.url))
      .length > 1000,
  );
});
