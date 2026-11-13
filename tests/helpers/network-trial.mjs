import {Simulation, C} from '../../dist/physics.js';
import {GuestReplica, makeState} from '../../dist/network-state.js';
import {ServerInputs} from '../../server/inputs.mjs';
export function trial(rtt, loss = 0.03, changing = false) {
  const host = new Simulation({humanIds: [0, 1]}),
    guest = new Simulation({humanIds: [0, 1]});
  for (const sim of [host, guest]) {
    sim.phase = 'playing';
    sim.cars[0].p.set(25, C.carHeight, 25);
    sim.cars[1].p.set(0, C.carHeight, -20);
    sim.cars[1].q.identity();
    sim.ball.p.set(25, 12, 0);
  }
  const replica = new GuestReplica(guest, 1),
    remote = new ServerInputs(),
    inputs = [],
    states = [];
  replica.receive(makeState(host, 1, 0, 'test'), 0);
  replica.setLatency(rtt);
  let seq = 1,
    random = 417,
    cursor = null,
    maxStep = 0,
    maxInstant = 0,
    maxCorrection = 0,
    received = 0;
  const rand = () => {
    random = (1664525 * random + 1013904223) >>> 0;
    return random / 2 ** 32;
  };
  for (let tick = 0; tick < 960; tick++) {
    const now = (tick * 1000) / 120,
      input = changing
        ? {
            throttle: tick < 300 ? 0.7 : tick < 450 ? -0.4 : 0.5,
            steer: tick < 450 ? 0.25 : -0.2,
            jump: tick === 180 || tick === 186,
            pitch: tick === 186 ? 1 : 0
          }
        : {throttle: 0.5, steer: 0.3};
    replica.step(input);
    if (tick % 2 === 0 && rand() >= loss)
      inputs.push({
        at: now + rtt / 2 + (rand() - 0.5) * 12,
        frames: structuredClone(replica.inputFrames())
      });
    inputs.sort((a, b) => a.at - b.at);
    while (inputs[0]?.at <= now) remote.receive(inputs.shift().frames, now);
    host.step(
      {},
      C.step,
      new Map([
        [0, {}],
        [1, remote.next(now)]
      ])
    );
    if (tick % 4 === 0 && rand() >= loss)
      states.push({
        at: now + rtt / 2 + (rand() - 0.5) * 16,
        state: makeState(host, ++seq, remote.ack, 'test')
      });
    states.sort((a, b) => a.at - b.at);
    while (states[0]?.at <= now) {
      const before = replica.sample(now, 0).cars[1].p.slice(),
        state = states.shift();
      replica.receive(state.state, now);
      maxCorrection = Math.max(maxCorrection, replica.lastCorrection);
      received++;
      const after = replica.sample(now, 0).cars[1].p;
      maxInstant = Math.max(maxInstant, Math.hypot(...before.map((n, i) => n - after[i])));
    }
    const pose = replica.sample(now, C.step).cars[1].p;
    if (cursor) maxStep = Math.max(maxStep, Math.hypot(...pose.map((n, i) => n - cursor[i])));
    cursor = pose.slice();
  }
  return {
    rtt,
    loss,
    received,
    maxStep,
    maxInstant,
    maxCorrection,
    positionError: replica.positionError.length(),
    ...replica.diagnostics()
  };
}
