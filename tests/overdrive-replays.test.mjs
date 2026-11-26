import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, C} from '../dist/physics.js';
import {
  ReplayRecorder,
  validateReplay,
  REPLAY_LIMIT,
} from '../dist/replays/codec.js';
import {ReplayTimeline} from '../dist/replays/timeline.js';
import {SnapshotTiming} from '../dist/network-tuning.js';
import {cleanLoadouts} from '../dist/overdrive/loadouts.js';
import {garageStyle, styleVehicle} from '../dist/garage-style.js';
import * as T from '../dist/vendor/three.module.js';
import {makeCarModel} from '../dist/scene.js';
function clip() {
  const sim = new Simulation({mode: 'duel'}),
    recorder = new ReplayRecorder();
  recorder.start(
    sim,
    sim.cars.map((c) => ({
      id: c.id,
      team: c.team,
      name: 'DRIVER',
      body: 'striker',
      color: '#299bff',
    })),
  );
  for (let i = 0; i < 6; i++) {
    sim.elapsed = i * 0.2;
    sim.ball.p.x = i;
    recorder.capture(sim.snapshot(), sim.elapsed);
  }
  recorder.bookmark(0.6, 'BLUE GOAL');
  return recorder.finish([1, 0]);
}
test('replay files preserve poses, match rules and bookmarks, reject untrusted data, and contain no session capabilities', () => {
  const replay = clip();
  assert.equal(replay.frames.length, 6);
  assert.equal(replay.bookmarks.length, 1);
  assert.equal(replay.score[0], 1);
  assert.equal(replay.rules.gravity, 'normal');
  const raw = JSON.parse(JSON.stringify(replay));
  raw.secret = 'not exported';
  assert.equal(validateReplay(raw).secret, undefined);
  for (const mutate of [
    (c) => c.frames.reverse(),
    (c) => (c.frames[0].ball.q = [0, 0, 0, 0]),
    (c) => (c.roster[0].body = 'unknown'),
    (c) => (c.frames[0].cars[0].id = 7),
    (c) => (c.frames[1].cars[0].p[0] = Infinity),
    (c) => c.roster.push(c.roster[0]),
  ]) {
    const broken = structuredClone(replay);
    mutate(broken);
    assert.throws(() => validateReplay(broken));
  }
});
test('replay seeking uses real timestamps and interpolates a reusable output without mutating recorded frames', () => {
  const replay = clip(),
    before = structuredClone(replay),
    timeline = new ReplayTimeline(replay),
    out = timeline.sample(0.5);
  assert.equal(out.ball.p[0], 2.5);
  assert.equal(timeline.sample(0.75), out);
  assert.equal(out.ball.p[0], 3.75);
  assert.equal(timeline.sample(-100).ball.p[0], 0);
  assert.equal(timeline.sample(999).ball.p[0], 5);
  assert.deepEqual(replay, before);
});
test('recording excludes playback/practice worlds and uses a fixed rolling 15-minute capacity', () => {
  const recorder = new ReplayRecorder(),
    practice = new Simulation({mode: 'free'});
  recorder.start(practice, []);
  assert.equal(recorder.active, false);
  const sim = new Simulation({mode: 'duel'});
  const roster = sim.cars.map((c) => ({
    id: c.id,
    team: c.team,
    name: 'D',
    body: 'striker',
    color: '#299bff',
  }));
  recorder.start(sim, roster);
  const snap = sim.snapshot();
  for (let i = 0; i < REPLAY_LIMIT + 20; i++) recorder.capture(snap, i * 0.11);
  assert.equal(recorder.frames.length, REPLAY_LIMIT);
  const replay = recorder.finish([0, 0]);
  assert.equal(replay.frames.length, REPLAY_LIMIT);
  assert.equal(replay.truncated, true);
  assert.ok(replay.frames[0].time > 0);
  assert.equal(recorder.finish([0, 0]), null);
});
test('stable snapshot links use a smaller buffer, jitter grows it safely and stale packets cannot disturb its clock', () => {
  const t = new SnapshotTiming();
  for (let i = 0; i < 100; i++) t.receive(i, i / 30, (i * 1000) / 30);
  assert.ok(t.delay >= 0.045 && t.delay < 0.055);
  const stable = t.delay;
  for (let i = 100; i < 120; i++)
    t.receive(i, i / 30, (i * 1000) / 30 + (i % 2 ? 65 : 0));
  assert.ok(t.delay > stable + 0.02 && t.delay <= 0.16);
  const before = t.diagnostics();
  assert.equal(t.receive(5, 1, 1), false);
  assert.deepEqual(t.diagnostics(), before);
  assert.ok(t.redundancy >= 4 && t.redundancy <= 12);
});
test('five loadout slots sanitize cosmetic values and vehicle styling changes presentation materials without changing roots', () => {
  const slots = cleanLoadouts([
    {
      name: '<script>',
      body: 'striker',
      paint: 'mint',
      style: {wheels: 'gold', decal: 'racing'},
    },
    {body: 'unknown'},
  ]);
  assert.equal(slots.length, 5);
  assert.equal(slots[0].name, 'script');
  assert.equal(slots[1], null);
  assert.deepEqual(garageStyle({wheels: 'fast', decal: 'unsafe'}), {
    wheels: 'stock',
    decal: 'none',
  });
  const model = makeCarModel(),
    before = model.root.matrix.clone(),
    paint = model.paint;
  styleVehicle(model, {wheels: 'gold', decal: 'chevron'});
  assert.ok(model.root.matrix.equals(before));
  assert.equal(model.paint, paint);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
  };
  paint.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /circuitDecalScale/);
  assert.ok(shader.uniforms.circuitDecalScale.value.isVector3);
  assert.match(paint.customProgramCacheKey(), /chevron/);
});
