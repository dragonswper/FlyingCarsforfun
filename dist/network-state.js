import {Vector3, Quaternion} from './vendor/three.module.js';
import {C, makeCar, stepCar, collideCarBall, collideCars} from './physics.js';
import {stepBall} from './ball.js';
import {carSupport, collideArena} from './arena.js';
import {cleanInput, validCounter} from './network-protocol.js';

const NUMBERS = [
  'boost',
  'boostTime',
  'handbrake',
  'jumpTime',
  'jumpEndTime',
  'airTime',
  'noContact',
  'flipTime',
  'flipRotation',
  'selfRightTime',
  'demoTime',
  'supersonicTime',
  'hitCooldown',
  'extraHitCooldown',
  'recoverTime',
  'score',
  'goals',
  'assists',
  'saves',
  'touches',
  'demos',
  'renderSteer',
  'renderThrottle'
];
const FLAGS = [
  'grounded',
  'boosting',
  'drifting',
  'jumpHeld',
  'jumpActive',
  'hasJumped',
  'canDouble',
  'supersonic',
  'flipActive'
];
const VECTORS = ['p', 'v', 'omega', 'normal', 'flipAxis'];
const finite = (n, max = 1e6) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
const array = (v, length, max = 1000) =>
  Array.isArray(v) && v.length === length && v.every((n) => finite(n, max));
const rotation = (q) => array(q, 4, 1.01) && q.reduce((sum, n) => sum + n * n, 0) > 0.5;
export function encodeCar(car) {
  const value = {
    id: car.id,
    team: car.team,
    q: car.q.toArray(),
    selfRightTarget: car.selfRightTarget.toArray()
  };
  for (const key of VECTORS) value[key] = car[key].toArray();
  for (const key of NUMBERS) value[key] = Number(car[key]) || 0;
  for (const key of FLAGS) value[key] = !!car[key];
  return value;
}
export function applyCar(car, value) {
  car.q.fromArray(value.q).normalize();
  car.selfRightTarget.fromArray(value.selfRightTarget).normalize();
  for (const key of VECTORS) car[key].fromArray(value[key]);
  for (const key of NUMBERS) car[key] = value[key];
  for (const key of FLAGS) car[key] = value[key];
}
export function makeState(sim, n, ack, matchId) {
  return {
    t: 'state',
    matchId,
    n,
    ack,
    phase: sim.phase,
    phaseTime: sim.phaseTime,
    elapsed: sim.elapsed,
    remaining: sim.remaining,
    overtime: sim.overtime,
    ...(sim.options.mode === 'training'
      ? {
          practice: {
            index: sim.trainingIndex,
            hits: sim.trainingHits,
            shotTime: sim.shotTime,
            name: sim.drillName
          }
        }
      : {}),
    score: [...sim.score],
    ball: {
      p: sim.ball.p.toArray(),
      q: sim.ball.q.toArray(),
      v: sim.ball.v.toArray(),
      spin: sim.ball.spin.toArray(),
      lastTouch: sim.lastTouch,
      lastTouchTime: sim.lastTouchTime
    },
    cars: sim.cars.map(encodeCar),
    pads: sim.pads.map((p) => p.timer)
  };
}
export function validState(value, sim) {
  if (
    !value ||
    !validCounter(value.n) ||
    !validCounter(value.ack) ||
    !['kickoff', 'playing', 'goal', 'ended'].includes(value.phase) ||
    !finite(value.elapsed, 86400) ||
    value.elapsed < 0 ||
    !finite(value.remaining, 86400) ||
    value.remaining < 0 ||
    !finite(value.phaseTime, 10) ||
    typeof value.overtime !== 'boolean' ||
    !array(value.score, 2, 1e6) ||
    value.score.some((n) => n < 0 || !Number.isInteger(n))
  )
    return false;
  if (
    value.practice &&
    (!Number.isInteger(value.practice.index) ||
      value.practice.index < 0 ||
      value.practice.index > 5 ||
      !Number.isInteger(value.practice.hits) ||
      value.practice.hits < 0 ||
      value.practice.hits > 1000 ||
      !finite(value.practice.shotTime, 16) ||
      typeof value.practice.name !== 'string' ||
      value.practice.name.length > 80)
  )
    return false;
  if (
    !value.ball ||
    !array(value.ball.p, 3) ||
    !rotation(value.ball.q) ||
    !array(value.ball.v, 3) ||
    !array(value.ball.spin, 3) ||
    !array(value.pads, 34, 11) ||
    value.pads.some((n) => n < 0)
  )
    return false;
  if (!Array.isArray(value.cars) || value.cars.length !== sim.cars.length) return false;
  if (
    ('lastTouch' in value.ball || 'lastTouchTime' in value.ball) &&
    (!Number.isInteger(value.ball.lastTouch) || value.ball.lastTouch < -1 ||
      value.ball.lastTouch > 7 || !finite(value.ball.lastTouchTime, 86400))
  ) return false;
  return value.cars.every(
    (car, index) =>
      car &&
      car.id === sim.cars[index].id &&
      car.team === sim.cars[index].team &&
      rotation(car.q) &&
      rotation(car.selfRightTarget) &&
      VECTORS.every((key) => array(car[key], 3)) &&
      NUMBERS.every((key) => finite(car[key])) &&
      FLAGS.every((key) => typeof car[key] === 'boolean') &&
      car.boost >= 0 &&
      car.boost <= 100.001 &&
      car.selfRightTime >= 0 &&
      car.selfRightTime <= 0.750001
  );
}
export function applyState(sim, value) {
  sim.phase = value.phase;
  sim.phaseTime = value.phaseTime;
  sim.elapsed = value.elapsed;
  sim.remaining = value.remaining;
  sim.overtime = value.overtime;
  sim.score[0] = value.score[0];
  sim.score[1] = value.score[1];
  if (value.practice) {
    sim.trainingIndex = value.practice.index;
    sim.trainingHits = value.practice.hits;
    sim.shotTime = value.practice.shotTime;
    sim.drillName = value.practice.name;
  }
  sim.ball.p.fromArray(value.ball.p);
  sim.ball.q.fromArray(value.ball.q).normalize();
  sim.ball.v.fromArray(value.ball.v);
  sim.ball.spin.fromArray(value.ball.spin);
  if (Number.isInteger(value.ball.lastTouch)) {
    sim.lastTouch = value.ball.lastTouch;
    sim.lastTouchTime = value.ball.lastTouchTime;
  }
  for (let i = 0; i < sim.cars.length; i++) applyCar(sim.cars[i], value.cars[i]);
  for (let i = 0; i < sim.pads.length; i++) sim.pads[i].timer = value.pads[i];
}

// Input replay covers the complete bounded one-second acknowledgement window.
// Visual correction is an error offset: ordinary input motion is never eased or
// teleported by a stale snapshot. Remote presentation has a small jitter buffer.
export const PREDICTION_WINDOW = 120;
// Compare the server with the prediction at its acknowledged input, never with
// the newer car on screen. Quantization noise must not restart motion replay.
export const RECONCILIATION = {position: 0.06, velocity: 0.3, angle: 0.025, angularVelocity: 0.2};
function closePrediction(a, b) {
  if (!a) return false;
  const distance = (key) => Math.hypot(...a[key].map((n, i) => n - b[key][i]));
  const dot = Math.min(
    1,
    Math.abs(a.q.reduce((sum, n, i) => sum + n * b.q[i], 0)) /
      Math.sqrt(a.q.reduce((s, n) => s + n * n, 0) * b.q.reduce((s, n) => s + n * n, 0))
  );
  return (
    distance('p') <= RECONCILIATION.position &&
    distance('v') <= RECONCILIATION.velocity &&
    distance('omega') <= RECONCILIATION.angularVelocity &&
    2 * Math.acos(dot) <= RECONCILIATION.angle &&
    FLAGS.every((key) => a[key] === b[key]) &&
    Math.abs(a.boost - b.boost) < 0.25 &&
    Math.abs(a.demoTime - b.demoTime) < 0.02 &&
    Math.abs(a.flipRotation - b.flipRotation) < 0.03 &&
    Math.abs(a.selfRightTime - b.selfRightTime) < 0.02
  );
}
export class GuestReplica {
  constructor(sim, localId) {
    this.sim = sim;
    this.localId = localId;
    this.spectator = localId === null;
    const car = sim.cars.find((c) => c.id === localId) || sim.cars[0];
    this.predicted = makeCar(car.id, car.team);
    applyCar(this.predicted, encodeCar(car));
    this.pending = [];
    this.inputSequence = 0;
    this.frames = [];
    this.lastSequence = -1;
    this.offset = null;
    this.lastPhase = sim.phase;
    this.replayAt = -1;
    this.latency = null;
    this.jitter = 0;
    this.timeline = null;
    this.localTouch = null;
    this.predictedEvents = [];
    this.predictedFeedback = [];
    this.feedbackCooldown = 0;
    this.preservedBallSnapshots = 0;
    this.visualP = car.p.clone();
    this.visualQ = car.q.clone();
    this.previousPrediction = {p: car.p.clone(), q: car.q.clone()};
    this.presentationAlpha = 1;
    this.positionError = new Vector3();
    this.rotationError = new Quaternion();
    this.ballError = new Vector3();
    this.ballRotationError = new Quaternion();
    this.qA = new Quaternion();
    this.qB = new Quaternion();
    this.forward = new Vector3();
    this.up = new Vector3(0, 1, 0);
    this.identity = new Quaternion();
    this.predictedBall = {
      p: sim.ball.p.clone(),
      q: sim.ball.q.clone(),
      v: sim.ball.v.clone(),
      spin: sim.ball.spin.clone()
    };
    this.visualBall = sim.ball.p.clone();
    this.visualBallQ = sim.ball.q.clone();
    this.previousBall = {p: sim.ball.p.clone(), q: sim.ball.q.clone()};
    this.otherCars = sim.cars
      .filter((c) => c.id !== localId)
      .map((car) => {
        const other = makeCar(car.id, car.team);
        applyCar(other, encodeCar(car));
        return other;
      });
    const pose = () => ({p: [0, 0, 0], q: [0, 0, 0, 1]});
    this.output = {
      ball: pose(),
      cars: sim.cars.map((car) => ({...pose(), id: car.id, team: car.team}))
    };
  }
  diagnostics() {
    return {
      pendingInputs: this.pending.length,
      replayedInputs: this.lastReplay || 0,
      reconciliations: this.reconciliations || 0,
      ignoredCorrections: this.ignoredCorrections || 0,
      correctionMetres: Math.round((this.lastCorrection || 0) * 1000) / 1000,
      interpolationMs: Math.round(Math.min(0.22, 0.085 + 2 * this.jitter) * 1000),
      pendingBallContact: !!this.localTouch,
      preservedBallSnapshots: this.preservedBallSnapshots,
      serverInputQueueMs: this.serverInputQueueMs ?? null,
      serverInputTick: this.serverInputTick ?? null,
      serverHeldSteps: this.serverHeldSteps ?? 0
    };
  }
  setLatency(ms) {
    if (!Number.isFinite(ms) || ms < 0 || ms > 5000) return;
    const target = ms / 2000;
    // Smooth the prediction horizon, not the measured ping shown in the HUD.
    this.latency = this.latency === null ? target :
      this.latency + Math.max(-0.025, Math.min(0.025, target - this.latency)) * 0.25;
  }
  step(input) {
    if (this.spectator) return null;
    const frame = {n: ++this.inputSequence, i: cleanInput(input)};
    this.feedbackCooldown = Math.max(0, this.feedbackCooldown - C.step);
    this.pending.push(frame);
    if (this.pending.length > PREDICTION_WINDOW) this.pending.shift();
    if (this.sim.phase === 'playing') this.predict(frame.i);
    this.remember(frame.n);
    return frame;
  }
  remember(n) {
    this.history ??= new Map();
    this.history.set(n, encodeCar(this.predicted));
    while (this.history.size > PREDICTION_WINDOW + 1)
      this.history.delete(this.history.keys().next().value);
  }
  predict(input, worldDt = C.step, ballDt = worldDt) {
    this.previousPrediction.p.copy(this.predicted.p);
    this.previousPrediction.q.copy(this.predicted.q);
    this.previousBall.p.copy(this.predictedBall.p);
    this.previousBall.q.copy(this.predictedBall.q);
    stepCar(
      this.predicted,
      input,
      C.step,
      ['free', 'training'].includes(this.sim.options.mode) || this.sim.options.unlimited
    );
    if (ballDt > 0) stepBall(this.predictedBall, ballDt);
    const hit = collideCarBall(this.predicted, this.predictedBall);
    if (hit && !this.replaying && !this.spectator) {
      // Keep the impulse through snapshots that predate this input. A fixed
      // upper bound and acknowledged/new remote contacts always end protection.
      this.localTouch ??= {n: this.inputSequence, authorityTouchTime: this.sim.lastTouchTime,
        receivedAt: this.lastArrival};
      if (this.feedbackCooldown <= 0) {
        this.feedbackCooldown = 0.15;
        this.predictedEvents.push({type: 'hit', car: this.localId,
          speed: this.predictedBall.v.length(), p: this.predictedBall.p.toArray(), predicted: true});
        this.predictedFeedback.push({n: this.inputSequence, receivedAt: this.lastArrival,
          touches: this.sim.cars.find(car => car.id === this.localId)?.touches || 0});
        if (this.predictedFeedback.length > 16) this.predictedFeedback.shift();
      }
    }
    for (const other of this.otherCars) {
      other.p.addScaledVector(other.v, worldDt);
      collideCars(this.predicted, other);
    }
    collideArena(this.predicted, C.carHeight, 0, true);
  }
  inputFrames() {
    return this.pending.slice(-4);
  }
  drainPredictedEvents() {
    return this.predictedEvents.splice(0);
  }
  filterAuthoritativeEvents(events, state) {
    const frames = Math.ceil(Math.min(1, Math.max(0.35,
      (this.latency ?? 0.1) * 2 + 0.15)) / C.step);
    this.predictedFeedback = this.predictedFeedback.filter(hit =>
      this.inputSequence - hit.n <= frames &&
      this.lastArrival - hit.receivedAt <= frames * C.step * 1000);
    const touches = state?.cars?.find(car => car.id === this.localId)?.touches || 0;
    return events.filter(event => {
      if (event.type !== 'hit' || event.car !== this.localId) return true;
      // A car can collide using held controls before the server receives the
      // numbered input at which we predicted contact. An ACK is not a contact
      // ID; match a recent own effect against the authoritative touch counter.
      const index = this.predictedFeedback.findIndex(hit => touches > hit.touches);
      if (index < 0) return true;
      this.predictedFeedback.splice(index, 1);
      return false;
    });
  }
  protectLocalBall(value, now) {
    const hit = this.localTouch;
    if (!hit) return false;
    const frames = Math.ceil(Math.min(0.75, Math.max(0.2,
      (this.latency ?? 0.1) * 2 + 0.1)) / C.step);
    const remoteHit = value.ball.lastTouch >= 0 && value.ball.lastTouch !== this.localId &&
      value.ball.lastTouchTime > hit.authorityTouchTime;
    if (value.phase !== 'playing' || value.ack >= hit.n ||
      this.inputSequence - hit.n > frames ||
      now - hit.receivedAt > frames * C.step * 1000 || remoteHit) {
      this.localTouch = null;
      return false;
    }
    return true;
  }
  receive(value, now) {
    if (value.n <= this.lastSequence || !validState(value, this.sim)) return false;
    const first = this.lastSequence < 0,
      changed = this.lastPhase !== value.phase,
      oldP = this.predicted.p.clone(),
      oldQ = this.predicted.q.clone(),
      oldBall = this.predictedBall.p.clone(),
      oldBallQ = this.predictedBall.q.clone(),
      wasDemo = this.predicted.demoTime > 0;
    const alpha = this.presentationAlpha,
      oldRenderP = this.previousPrediction.p.clone().lerp(oldP, alpha),
      oldRenderQ = this.previousPrediction.q.clone().slerp(oldQ, alpha),
      oldRenderBall = this.previousBall.p.clone().lerp(oldBall, alpha),
      oldRenderBallQ = this.previousBall.q.clone().slerp(oldBallQ, alpha);
    const preserveBall = this.protectLocalBall(value, now), heldBall = preserveBall ? {
      p: this.predictedBall.p.clone(), q: this.predictedBall.q.clone(),
      v: this.predictedBall.v.clone(), spin: this.predictedBall.spin.clone(),
      previousP: this.previousBall.p.clone(), previousQ: this.previousBall.q.clone()
    } : null;
    if (Number.isFinite(value.net?.inputQueueMs) &&
      value.net.inputQueueMs >= 0 && value.net.inputQueueMs <= 1000)
      this.serverInputQueueMs = value.net.inputQueueMs;
    if (this.lastArrival !== undefined && !changed) {
      const arrival = (now - this.lastArrival) / 1000,
        interval = value.elapsed - this.lastElapsed;
      this.jitter += (Math.abs(arrival - interval) - this.jitter) * 0.12;
    }
    this.lastArrival = now;
    this.lastElapsed = value.elapsed;
    this.lastSequence = value.n;
    this.lastPhase = value.phase;
    applyState(this.sim, value);
    // ACK identifies a received control, not every physics tick for which it
    // was held. Compare/replay at authority's actual input timeline, otherwise
    // a packet gap makes us advance the car a second time during correction.
    const through = validCounter(value.net?.inputTick) && value.net.inputTick >= value.ack
      ? value.net.inputTick : value.ack;
    this.serverInputTick = through;
    this.serverHeldSteps = through - value.ack;
    const local = value.cars.find((car) => car.id === this.localId) || value.cars[0],
      correct =
        first || changed || this.spectator || !closePrediction(this.history?.get(through), local);
    this.pending = this.pending.filter((frame) => frame.n > value.ack);
    const replay = this.pending.filter(frame => frame.n > through);
    if (correct) {
      applyCar(this.predicted, local);
      this.previousPrediction.p.copy(this.predicted.p);
      this.previousPrediction.q.copy(this.predicted.q);
      this.history?.clear();
      this.remember(through);
    } else {
      for (const key of ['score', 'goals', 'assists', 'saves', 'touches', 'demos'])
        this.predicted[key] = local[key];
      for (const n of this.history.keys()) if (n < through) this.history.delete(n);
    }
    this.predictedBall.p.fromArray(value.ball.p);
    this.predictedBall.q.fromArray(value.ball.q);
    this.predictedBall.v.fromArray(value.ball.v);
    this.predictedBall.spin.fromArray(value.ball.spin);
    this.previousBall.p.copy(this.predictedBall.p);
    this.previousBall.q.copy(this.predictedBall.q);
    for (const other of this.otherCars)
      applyCar(
        other,
        value.cars.find((car) => car.id === other.id)
      );
    if (changed) {
      this.localTouch = null;
      this.predictedEvents.length = 0;
      this.feedbackCooldown = 0;
      if (value.phase === 'kickoff') this.predictedFeedback.length = 0;
      this.pending.length = 0;
      this.frames.length = 0;
      this.timeline = null;
    } else if (value.phase === 'playing') {
      // Input ACK age includes both directions. The remote world is only one-way
      // old; replaying it for the full input window used to double its motion.
      const age = Math.min(0.5, this.latency ?? (this.pending.length * C.step) / 2),
        ownLead = value.ball.lastTouch === this.localId ?
          Math.max(0, Math.min(1, (1 - (value.elapsed - value.ball.lastTouchTime)) / 0.5)) : 0,
        // Our car is input-predicted ahead of authority by the uplink. After
        // confirmation, carry our own ball forward by that lead as well as the
        // snapshot's downlink age. Fade this extra lead over half a second so
        // handing the ball back to the shared timeline cannot reverse a shot.
        // Remote contacts retain one-way extrapolation.
        ballAge = Math.min(0.5, age * (1 + ownLead)),
        worldDt = replay.length ? Math.min(C.step, age / replay.length) : 0,
        ballDt = replay.length ? Math.min(C.step, ballAge / replay.length) : 0;
      if (correct) {
        this.replaying = true;
        try {
          for (const frame of replay) {
            this.predict(frame.i, worldDt, ballDt);
            this.remember(frame.n);
          }
        } finally {
          this.replaying = false;
        }
        if (!replay.length)
          for (let left = ballAge; left > 1e-8; left -= C.step) {
            this.previousBall.p.copy(this.predictedBall.p);
            this.previousBall.q.copy(this.predictedBall.q);
            stepBall(this.predictedBall, Math.min(C.step, left));
          }
      } else {
        for (let left = ballAge; left > 1e-8; left -= C.step) {
          const dt = Math.min(C.step, left);
          this.previousBall.p.copy(this.predictedBall.p);
          this.previousBall.q.copy(this.predictedBall.q);
          stepBall(this.predictedBall, dt);
        }
        for (const other of this.otherCars) other.p.addScaledVector(other.v, age);
      }
    }
    if (heldBall) {
      for (const key of ['p', 'q', 'v', 'spin']) this.predictedBall[key].copy(heldBall[key]);
      this.previousBall.p.copy(heldBall.previousP);
      this.previousBall.q.copy(heldBall.previousQ);
      this.preservedBallSnapshots++;
    }
    this.lastCorrection = oldP.distanceTo(this.predicted.p);
    this.lastReplay = correct && !changed ? replay.length : 0;
    if (correct) this.reconciliations = (this.reconciliations || 0) + 1;
    else this.ignoredCorrections = (this.ignoredCorrections || 0) + 1;
    const teleport =
      first ||
      changed ||
      (wasDemo && local.demoTime === 0) ||
      oldP.distanceToSquared(this.predicted.p) > 900;
    if (teleport) {
      this.previousPrediction.p.copy(this.predicted.p);
      this.previousPrediction.q.copy(this.predicted.q);
      this.positionError.set(0, 0, 0);
      this.rotationError.identity();
      this.visualP.copy(this.predicted.p);
      this.visualQ.copy(this.predicted.q);
    } else {
      this.positionError.add(oldRenderP).sub(
        this.previousPrediction.p.clone().lerp(this.predicted.p, alpha));
      this.rotationError.multiply(oldRenderQ).multiply(
        this.previousPrediction.q.clone().slerp(this.predicted.q, alpha).invert()).normalize();
    }
    if (first || changed || oldBall.distanceToSquared(this.predictedBall.p) > 900) {
      this.previousBall.p.copy(this.predictedBall.p);
      this.previousBall.q.copy(this.predictedBall.q);
      this.ballError.set(0, 0, 0);
      this.ballRotationError.identity();
      this.visualBall.copy(this.predictedBall.p);
      this.visualBallQ.copy(this.predictedBall.q);
    } else {
      this.ballError.add(oldRenderBall).sub(
        this.previousBall.p.clone().lerp(this.predictedBall.p, alpha));
      this.ballRotationError
        .multiply(oldRenderBallQ)
        .multiply(this.previousBall.q.clone().slerp(this.predictedBall.q, alpha).invert())
        .normalize();
    }
    const offset = value.elapsed - now / 1000;
    if (this.offset === null || changed) this.offset = offset;
    else this.offset += (offset - this.offset) * 0.03;
    this.frames.push(value);
    if (this.frames.length > 12) this.frames.shift();
    if (changed && value.phase === 'kickoff') this.sim.replay.length = 0;
    if (value.phase === 'playing' && value.elapsed - this.replayAt >= 0.045) {
      this.sim.replay.push(this.sim.snapshot());
      this.replayAt = value.elapsed;
      if (this.sim.replay.length > 100) this.sim.replay.shift();
    }
    return true;
  }
  sample(now, dt, alpha = this.presentationAlpha) {
    if (!this.frames.length) return null;
    this.presentationAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
    const delay = Math.min(0.22, 0.085 + 2 * this.jitter),
      desired = now / 1000 + this.offset - delay;
    if (this.timeline === null || this.paused || Math.abs(desired - this.timeline) > 0.5)
      this.timeline = desired;
    else this.timeline += Math.max(0, Math.min(Math.max(0, dt) * 1.2, desired - this.timeline));
    const time = this.timeline;
    let a = this.frames[0],
      b = a;
    for (let i = 1; i < this.frames.length; i++) {
      b = this.frames[i];
      if (b.elapsed >= time) break;
      a = b;
    }
    let remoteAlpha =
      b.elapsed > a.elapsed
        ? Math.max(0, Math.min(1, (time - a.elapsed) / (b.elapsed - a.elapsed)))
        : 1;
    if (a.phase !== b.phase) remoteAlpha = 1;
    const extrapolate =
      !this.paused && b.phase === 'playing' ? Math.max(0, Math.min(0.12, time - b.elapsed)) : 0;
    const blend = (out, from, to) => {
      let snap = false;
      for (let i = 0; i < 3; i++) if (Math.abs(from.p[i] - to.p[i]) > 20) snap = true;
      const mix = snap ? 1 : remoteAlpha;
      for (let i = 0; i < 3; i++)
        out.p[i] = from.p[i] + (to.p[i] - from.p[i]) * mix + (to.v?.[i] || 0) * extrapolate;
      this.qA.fromArray(from.q);
      this.qB.fromArray(to.q);
      this.qA.slerp(this.qB, mix).toArray(out.q);
    };
    blend(this.output.ball, a.ball, b.ball);
    const decay = Math.exp(-18 * Math.max(0, dt));
    if (!this.paused && !this.spectator) {
      this.ballError.multiplyScalar(decay);
      this.ballRotationError.slerp(this.identity, 1 - decay);
      this.visualBall.lerpVectors(this.previousBall.p, this.predictedBall.p,
        this.presentationAlpha).add(this.ballError);
      this.visualBall.y = Math.max(C.ballRestHeight, this.visualBall.y);
      this.visualBallQ.slerpQuaternions(this.previousBall.q, this.predictedBall.q,
        this.presentationAlpha).premultiply(this.ballRotationError);
      this.visualBall.toArray(this.output.ball.p);
      this.visualBallQ.toArray(this.output.ball.q);
    }
    for (let i = 0; i < this.output.cars.length; i++) {
      const from = a.cars[i],
        to = b.cars[i],
        out = this.output.cars[i];
      blend(out, from, to);
      this.qA.fromArray(to.q);
      this.forward.set(0, 0, 1).applyQuaternion(this.qA);
      out.speed = to.v[0] * this.forward.x + to.v[1] * this.forward.y + to.v[2] * this.forward.z;
      out.steer = to.renderSteer;
      out.throttle = to.renderThrottle;
      out.grounded = to.grounded;
      out.boosting = to.boosting;
      out.demo = to.demoTime > 0;
      if (out.id === this.localId && !this.paused) {
        this.positionError.multiplyScalar(decay);
        this.rotationError.slerp(this.identity, 1 - decay);
        this.visualP.lerpVectors(this.previousPrediction.p, this.predicted.p,
          this.presentationAlpha).add(this.positionError);
        this.visualQ.slerpQuaternions(this.previousPrediction.q, this.predicted.q,
          this.presentationAlpha).premultiply(this.rotationError);
        this.visualP.y = Math.max(this.visualP.y, carSupport({q: this.visualQ}, this.up));
        this.visualP.toArray(out.p);
        this.visualQ.toArray(out.q);
        out.speed = this.predicted.v.dot(
          this.forward.set(0, 0, 1).applyQuaternion(this.predicted.q)
        );
        out.steer = this.predicted.renderSteer;
        out.throttle = this.predicted.renderThrottle;
        out.boosting = this.predicted.boosting;
        out.grounded = this.predicted.grounded;
        out.demo = this.predicted.demoTime > 0;
      } else out.p[1] = Math.max(out.p[1], carSupport({q: this.qA.fromArray(out.q)}, this.up));
    }
    return this.output;
  }
}

export function cleanEvents(events) {
  if (!Array.isArray(events) || events.length > 24) return [];
  const types = ['goal', 'hit', 'bounce', 'pad', 'demo', 'go', 'overtime', 'end', 'save', 'miss'];
  return events
    .filter(
      (e) =>
        e &&
        types.includes(e.type) &&
        (!e.p || array(e.p, 3)) &&
        (!('speed' in e) || finite(e.speed, 1000)) &&
        (!('team' in e) || e.team === 0 || e.team === 1) &&
        (!('scorer' in e) ||
          e.scorer === null ||
          (Number.isInteger(e.scorer) && e.scorer >= 0 && e.scorer < 8)) &&
        (!('car' in e) || (Number.isInteger(e.car) && e.car >= 0 && e.car < 8))
    )
    .map((e) => {
      const result = {type: e.type};
      for (const key of ['team', 'scorer', 'speed', 'p', 'car', 'id', 'big', 'by', 'won'])
        if (key in e) result[key] = e[key];
      return result;
    });
}
