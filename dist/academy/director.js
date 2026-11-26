import {Vector3, Quaternion} from '../vendor/three.module.js';
import {C} from '../constants.js';
import {ACADEMY_PACKS, ACADEMY_DRILLS} from './catalog.js';
const up = new Vector3(0, 1, 0),
  forward = new Vector3(0, 0, 1);
const count = (n) => (Number.isSafeInteger(n) && n >= 0 ? Math.min(1e6, n) : 0);
export function academyProgress(raw = {}) {
  const clean = {};
  for (const drill of ACADEMY_DRILLS) {
    const d = raw?.[drill.key];
    if (!d || typeof d !== 'object') continue;
    clean[drill.key] = {
      attempts: count(d.attempts),
      completions: count(d.completions),
      medal:
        Number.isFinite(d.best) && d.best > 0 && d.best <= drill.limit
          ? Math.min(3, count(d.medal))
          : 0,
      best:
        Number.isFinite(d.best) && d.best > 0 && d.best <= drill.limit
          ? d.best
          : null,
    };
  }
  return clean;
}
export function medalFor(drill, seconds) {
  return seconds <= drill.par ? 3 : seconds <= drill.par * 1.6 ? 2 : 1;
}
// This director only owns a solo free-play Simulation. It neither changes
// shared physics nor accepts a network-owned world.
export class AcademyDirector {
  constructor(
    sim,
    {pack = 'striker', index = 0, progress = {}, onRecord = () => {}} = {},
  ) {
    if (
      sim.options.mode !== 'free' ||
      sim.options.dedicated ||
      sim.cars.length !== 1
    )
      throw Error('Academy requires an offline solo practice world.');
    this.sim = sim;
    this.pack = ACADEMY_PACKS.find((p) => p.id === pack) || ACADEMY_PACKS[0];
    this.index = Math.max(0, Math.min(3, Number.isInteger(index) ? index : 0));
    this.progress = academyProgress(progress);
    this.onRecord = onRecord;
    this.target = new Vector3();
    this.up = new Vector3();
    this.reset();
  }
  get drill() {
    return this.pack.drills[this.index];
  }
  reset() {
    const s = this.sim,
      d = this.drill,
      c = s.cars[0];
    s.phase = 'playing';
    s.resetPractice();
    s.score = [0, 0];
    s.clockStarted = false;
    s.lastTouch = -1;
    s.lastTouchTime = -99;
    s.touchHistory = [];
    s.events.length = 0;
    s.replay.length = 0;
    s.recordReplay = false;
    c.p.set(d.car[0], d.height ?? C.carHeight, d.car[1]);
    c.q.setFromAxisAngle(
      up,
      d.yaw ?? Math.atan2(d.ball[0] - d.car[0], d.ball[2] - d.car[1]),
    );
    if (d.upsideDown)
      c.q.multiply(new Quaternion().setFromAxisAngle(forward, Math.PI));
    c.grounded = !d.upsideDown;
    c.normal.copy(up);
    c.boost = 100;
    c.hitCooldown = c.extraHitCooldown = 0;
    for (const field of [
      'goals',
      'shots',
      'saves',
      'assists',
      'score',
      'touches',
      'demos',
    ])
      c[field] = 0;
    s.ball.p.fromArray(d.ball);
    s.ball.v.fromArray(d.velocity);
    s.ball.spin.set(0, 0, 0);
    s.ball.q.identity();
    s.prediction.invalidate();
    this.time = 0;
    this.checkpoint = 0;
    this.settled = 0;
    this.status = 'running';
    this.outcome = null;
    const record = this.progress[d.key] ?? {
      attempts: 0,
      completions: 0,
      medal: 0,
      best: null,
    };
    record.attempts = Math.min(1e6, record.attempts + 1);
    this.progress[d.key] = record;
    this.onRecord(this.progress);
  }
  step(dt) {
    if (this.status !== 'running') return;
    this.time += dt;
    const s = this.sim,
      d = this.drill,
      c = s.cars[0];
    const touch = s.lastTouch === c.id && c.touches > 0;
    const ownGoal = s.phase === 'goal' && s.score[1] > 0;
    let done = false;
    if (d.objective === 'goal') done = s.score[0] > 0 && touch;
    if (d.objective === 'touch') done = touch;
    if (d.objective === 'aerial')
      done = touch && s.ball.p.y >= (d.minHeight || 2.5);
    if (d.objective === 'save') done = touch && s.ball.v.z > 1 && !ownGoal;
    if (d.objective === 'route') {
      const target = d.checkpoints[this.checkpoint];
      if (target && c.p.distanceTo(this.target.fromArray(target)) < 3.4)
        this.checkpoint++;
      done = this.checkpoint === d.checkpoints.length;
    }
    if (d.objective === 'recover') {
      this.settled =
        c.grounded && this.up.set(0, 1, 0).applyQuaternion(c.q).y > 0.8
          ? this.settled + dt
          : 0;
      done = this.settled >= 0.5;
    }
    if (done) this.finish(true);
    else if (ownGoal || s.phase === 'goal' || this.time >= d.limit)
      this.finish(false);
  }
  finish(success) {
    if (this.status !== 'running') return false;
    this.status = 'result';
    const d = this.drill,
      seconds = Math.max(C.step, Math.min(this.time, d.limit)),
      medal = success ? medalFor(d, seconds) : 0;
    const r = this.progress[d.key];
    if (success) {
      r.completions = Math.min(1e6, r.completions + 1);
      r.medal = Math.max(r.medal, medal);
      r.best = r.best === null ? seconds : Math.min(r.best, seconds);
      this.onRecord(this.progress);
    }
    this.outcome = {success, seconds, medal};
    return true;
  }
  next() {
    if (this.index >= this.pack.drills.length - 1) return false;
    this.index++;
    this.reset();
    return true;
  }
  state() {
    return {
      pack: this.pack.id,
      drill: this.drill.key,
      index: this.index,
      time: this.time,
      remaining: Math.max(0, this.drill.limit - this.time),
      checkpoint: this.checkpoint,
      status: this.status,
      outcome: this.outcome,
    };
  }
}
export function practiceBall(sim, kind) {
  if (
    sim.options.mode !== 'free' ||
    sim.options.dedicated ||
    sim.cars.length !== 1
  )
    return false;
  const car = sim.cars[0],
    ball = sim.ball,
    dir = new Vector3(0, 0, 1).applyQuaternion(car.q);
  dir.y = 0;
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();
  sim.phase = 'playing';
  sim.events.length = 0;
  ball.spin.set(0, 0, 0);
  ball.q.identity();
  if (kind === 'pass') {
    ball.p.copy(car.p).addScaledVector(dir, 16);
    ball.p.y = C.ballRestHeight;
    ball.v.copy(dir).multiplyScalar(-12);
  } else if (kind === 'pop') {
    ball.p.copy(car.p).addScaledVector(dir, 10);
    ball.p.y = C.ballRestHeight;
    ball.v.copy(dir).multiplyScalar(3);
    ball.v.y = 13;
  } else if (kind === 'defend') {
    ball.p.set(0, 4, -10);
    ball.v.set((car.p.x - ball.p.x) * 0.55, 1, -19);
  } else if (kind === 'freeze') {
    ball.v.set(0, 0, 0);
    ball.spin.set(0, 0, 0);
  } else return false;
  sim.prediction.invalidate();
  return true;
}
