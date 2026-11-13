import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation, C} from '../dist/physics.js';
import {GuestReplica, makeState, validState, applyState} from '../dist/network-state.js';
import {stepBall} from '../dist/ball.js';
import {ServerInputs, MAX_INPUT_BUFFER} from '../server/inputs.mjs';
import {PartyRoom} from '../dist/party-room.js';
import {NetworkRoom} from '../dist/network-room.js';

function contact() {
  const sim = new Simulation({humanIds: [0, 1]});
  sim.phase = 'playing';
  sim.cars[0].p.set(25, C.carHeight, 25);
  const car = sim.cars[1];
  car.p.set(0, C.carHeight, 0);
  car.q.identity();
  car.v.set(0, 0, 15);
  sim.ball.p.set(0, C.ballRestHeight, 1.4);
  const replica = new GuestReplica(sim, 1);
  replica.setLatency(200);
  replica.receive(makeState(sim, 1, 0, 'test'), 0);
  return {sim, replica};
}

test('an older snapshot cannot erase an unacknowledged local ball impulse', () => {
  const {sim, replica} = contact();
  replica.step({throttle: 1});
  const speed = replica.predictedBall.v.length();
  assert.ok(speed > 10);
  const before = replica.predictedBall.p.clone(), stale = makeState(sim, 2, 0, 'test');
  stale.elapsed = 0.033;
  replica.receive(stale, 33);
  assert.ok(replica.predictedBall.v.length() >= speed * 0.99,
    'The local ball hit was replaced with the older stationary ball');
  assert.ok(replica.predictedBall.p.distanceTo(before) < 1e-8);
  assert.deepEqual(sim.score, [0, 0]);
  assert.equal(sim.cars[1].touches, 0);
  assert.equal(replica.diagnostics().preservedBallSnapshots, 1);
});

test('an acknowledged rejected hit returns to authority with ordinary one-way extrapolation', () => {
  const {sim, replica} = contact();
  replica.step({throttle: 1});
  const denied = makeState(sim, 2, 1, 'test');
  denied.ball.p = [-8, 2, -8];
  denied.ball.v = [0, 0, 0];
  const reference = new Simulation().ball;
  reference.p.fromArray(denied.ball.p);
  reference.v.fromArray(denied.ball.v);
  for (let left = 0.1; left > 1e-8; left -= C.step)
    stepBall(reference, Math.min(C.step, left));
  replica.receive(denied, 200);
  assert.ok(replica.predictedBall.p.distanceTo(reference.p) < 1e-8);
  assert.ok(replica.predictedBall.v.distanceTo(reference.v) < 1e-8);
  assert.equal(replica.localTouch, null);
});

test('a new opponent touch, a phase transition and a missing acknowledgement all bound local prediction', () => {
  for (const reason of ['remote', 'goal', 'timeout', 'paused-input']) {
    const {sim, replica} = contact();
    replica.step({throttle: 1});
    if (reason === 'timeout') for (let i = 0; i < 40; i++) replica.step({});
    const state = makeState(sim, 2, 0, 'test');
    state.ball.p = [-10, 3, -10];
    if (reason === 'remote') {
      state.ball.lastTouch = 0;
      state.ball.lastTouchTime = 0.02;
    }
    if (reason === 'goal') state.phase = 'goal';
    replica.receive(state, 400);
    assert.equal(replica.localTouch, null, reason);
    assert.ok(replica.predictedBall.p.x < -9, reason);
  }
});

test('local contact feedback is immediate, not replayed, and its confirmed echo is suppressed once', () => {
  const {sim, replica} = contact();
  replica.step({throttle: 1});
  const predicted = replica.drainPredictedEvents();
  assert.equal(predicted.length, 1);
  assert.equal(predicted[0].type, 'hit');
  assert.equal(predicted[0].car, 1);
  assert.equal(sim.events.some(event => event.type === 'hit'), false);
  replica.receive(makeState(sim, 2, 0, 'test'), 33);
  assert.deepEqual(replica.drainPredictedEvents(), []);
  const confirmed = makeState(sim, 3, 1, 'test');
  confirmed.cars[1].touches = 1;
  const own = {type: 'hit', car: 1}, remote = {type: 'hit', car: 0}, goal = {type: 'goal', team: 0};
  assert.deepEqual(replica.filterAuthoritativeEvents([own, remote, goal], confirmed), [remote, goal]);
  assert.deepEqual(replica.filterAuthoritativeEvents([own], confirmed), [own]);
});

test('a contact with existing momentum deduplicates without waiting for its client input ACK', () => {
  const {sim, replica} = contact();
  replica.step({throttle: 1});
  replica.drainPredictedEvents();
  const momentumHit = makeState(sim, 2, 0, 'test');
  momentumHit.cars[1].touches = 1;
  const effect = {type: 'hit', car: 1};
  assert.deepEqual(replica.filterAuthoritativeEvents([effect], momentumHit), []);

  const missed = contact();
  missed.replica.step({throttle: 1});
  for (let n = 0; n < 130; n++) missed.replica.step({});
  assert.deepEqual(missed.replica.filterAuthoritativeEvents([effect], momentumHit), [effect],
    'An expired speculative miss must not suppress a later genuine hit');
});

for (const Room of [PartyRoom, NetworkRoom])
  test(Room.name + ' sends local impact feedback to the game during the same input step', () => {
    const {sim, replica} = contact(), events = [];
    const room = {
      active: true, sim, replica, hostPaused: false, recovering: false,
      onEvents: value => events.push(...value)
    };
    Room.prototype.guestStep.call(room, {throttle: 1});
    assert.equal(events.length, 1);
    assert.equal(events[0].predicted, true);
  });

test('ball contact ownership is validated and replicated without altering match scores', () => {
  const {sim} = contact();
  sim.lastTouch = 1;
  sim.lastTouchTime = 0.5;
  const state = makeState(sim, 2, 1, 'test'), guest = new Simulation({humanIds: [0, 1]});
  assert.equal(validState(state, guest), true);
  applyState(guest, state);
  assert.equal(guest.lastTouch, 1);
  assert.equal(guest.lastTouchTime, 0.5);
  assert.deepEqual(guest.score, [0, 0]);
  for (const invalid of [{lastTouch: 8}, {lastTouch: 0.5}, {lastTouchTime: Infinity}]) {
    const bad = structuredClone(state);
    Object.assign(bad.ball, invalid);
    assert.equal(validState(bad, guest), false);
  }
});

test('a ping spike changes the prediction horizon gradually without accepting invalid latency', () => {
  const {replica} = contact();
  replica.setLatency(1000);
  assert.ok(replica.latency > 0.1 && replica.latency < 0.11);
  const before = replica.latency;
  for (const invalid of [NaN, Infinity, -1, 5001]) replica.setLatency(invalid);
  assert.equal(replica.latency, before);
});

test('network jitter cannot build a permanent FIFO delay after a stalled input batch', () => {
  const remote = new ServerInputs();
  remote.receive([{n: 1, i: {throttle: 1}}], 0);
  remote.next(0);
  const frames = Array.from({length: 24}, (_, i) =>
    ({n: i + 2, i: {throttle: i < 22 ? 1 : -1}}));
  for (let n = 0; n < frames.length; n += 4) remote.receive(frames.slice(n, n + 4), 200);
  let input;
  for (let n = 0; n < 2; n++) input = remote.next(200 + n * 1000 / 120);
  assert.equal(input.throttle, -1, 'Fresh reverse input remained behind a stalled FIFO batch');
  assert.ok(remote.queue.length <= MAX_INPUT_BUFFER);
  assert.equal(remote.ack, 25);
});

test('discarding a stale movement backlog preserves two jump presses and their release', () => {
  const remote = new ServerInputs(), frames = Array.from({length: 16}, (_, i) =>
    ({n: i + 1, i: {throttle: i < 14 ? 1 : -1, jump: i === 1 || i === 4}}));
  remote.receive(frames, 0);
  let previous = false, presses = 0;
  for (let n = 0; n < 8; n++) {
    const input = remote.next(n * 8);
    if (input.jump && !previous) presses++;
    previous = input.jump;
    assert.equal(input.throttle, -1);
  }
  assert.equal(presses, 2);
  assert.equal(previous, false, 'A preserved jump must not remain stuck after its release');
  assert.equal(remote.next(301).throttle, 0);
  assert.equal(remote.next(301).jump, false);
});

for (const rtt of [180, 200, 220])
  test(`own touches survive delayed, lost and reordered snapshots at ${rtt} ms RTT`, () => {
    const host = new Simulation({humanIds: [0, 1]}), guest = new Simulation({humanIds: [0, 1]});
    host.phase = guest.phase = 'playing';
    host.cars[0].p.set(25, C.carHeight, 25);
    host.cars[1].p.set(0, C.carHeight, -18);
    host.cars[1].q.identity();
    const replica = new GuestReplica(guest, 1), inputs = new ServerInputs(), packets = [];
    replica.setLatency(rtt);
    replica.receive(makeState(host, 1, 0, 'test'), 0);
    let seq = 1, contactAt = null, confirmedAt = null, receivedAfterHit = 0, worstInstant = 0;
    let lastBallZ = null, minBallStep = Infinity, maxBallStep = 0;
    for (let tick = 0; tick < 360; tick++) {
      const now = tick * C.step * 1000;
      replica.step({throttle: 1, boost: contactAt === null});
      if (contactAt === null && replica.predictedBall.v.length() > 1) contactAt = now;
      if (tick % 2 === 0 && tick % 62 !== 0)
        packets.push({at: now + rtt / 2 + [0, 8, 1, 4][tick % 4],
          frames: structuredClone(replica.inputFrames())});
      packets.sort((a, b) => a.at - b.at);
      while (packets[0]?.at <= now) {
        const packet = packets.shift();
        if (packet.frames) inputs.receive(packet.frames, now);
        else {
          const before = replica.sample(now, 0).ball.p.slice();
          replica.receive(packet.state, now);
          const after = replica.sample(now, 0).ball.p;
          worstInstant = Math.max(worstInstant, Math.hypot(...after.map((n, i) => n - before[i])));
          if (contactAt !== null && !confirmedAt) {
            receivedAfterHit++;
            assert.ok(replica.predictedBall.v.length() > 1, 'A stale snapshot erased the local touch');
          }
          if (host.cars[1].touches && replica.sim.cars[1].touches && confirmedAt === null)
            confirmedAt = now;
        }
      }
      host.step({}, C.step, new Map([[1, inputs.next(now)]]));
      if (tick % 4 === 0 && tick % 124 !== 0)
        packets.push({at: now + rtt / 2 + [2, 45, 0][seq % 3],
          state: {...makeState(host, ++seq, inputs.ack, 'test'),
            net: {inputTick: inputs.inputTick ?? inputs.ack}}});
      const ballZ = replica.sample(now, C.step).ball.p[2];
      if (contactAt !== null && lastBallZ !== null) {
        minBallStep = Math.min(minBallStep, ballZ - lastBallZ);
        maxBallStep = Math.max(maxBallStep, ballZ - lastBallZ);
      }
      lastBallZ = ballZ;
      if (confirmedAt !== null && now - confirmedAt > 800) break;
    }
    assert.ok(contactAt !== null && confirmedAt > contactAt);
    assert.ok(receivedAfterHit >= 2);
    assert.ok(replica.preservedBallSnapshots >= 2);
    assert.ok(worstInstant < 1e-8, 'Snapshot reconciliation visibly snapped the ball');
    assert.ok(minBallStep >= -0.01, 'The confirmed hit visibly moved backwards: ' + minBallStep);
    assert.ok(maxBallStep < 0.8, 'The ball visibly jumped forward: ' + maxBallStep);
    assert.ok(replica.predictedBall.v.toArray().every(Number.isFinite));
    assert.deepEqual(guest.score, [0, 0]);
});
