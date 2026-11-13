import {Simulation, C} from '../../dist/physics.js';
import {GuestReplica, makeState} from '../../dist/network-state.js';
import {ServerInputs} from '../../server/inputs.mjs';

const percentile = (values, p) => values.sort((a, b) => a - b)[
  Math.floor((values.length - 1) * p)] || 0;

// Run server ticks, browser frames and packet arrivals on independent clocks.
// Unlike a loop that renders after every physics step, this reproduces real
// animation-frame batching and held controls between uneven input deliveries.
export function drivingTrial(fps, rtt = 200) {
  const host = new Simulation({humanIds: [0, 1]}),
    guest = new Simulation({humanIds: [0, 1]});
  host.phase = guest.phase = 'playing';
  host.cars[0].p.set(25, C.carHeight, 25);
  host.cars[1].p.set(-20, C.carHeight, -20);
  host.cars[1].q.identity();
  host.ball.p.set(25, 12, 0);
  const replica = new GuestReplica(guest, 1), remote = new ServerInputs(),
    packets = [], speedErrors = [], corrections = [];
  replica.receive(makeState(host, 1, 0, 'test'), 0);
  replica.setLatency(rtt);
  const framePattern = [0.83, 1.17, 0.96, 1.04, 1, 1];
  let sequence = 1, now = 0, serverAt = 0, renderAt = 0, lastRender = 0,
    accumulator = 0, lastSend = -Infinity, renders = 0, serverTicks = 0,
    lastPose = null, stalledFrames = 0, measuredFrames = 0, maxSnapshotSnap = 0;
  while (now < 8000) {
    const incoming = packets.reduce((first, packet) => Math.min(first, packet.at), Infinity);
    now = Math.min(serverAt, renderAt, incoming);
    if (incoming <= now) {
      for (let index = packets.length - 1; index >= 0; index--) {
        if (packets[index].at > now) continue;
        const packet = packets.splice(index, 1)[0];
        if (packet.frames) remote.receive(packet.frames, now);
        else {
          const before = replica.sample(now, 0).cars[1].p.slice();
          replica.receive(packet.state, now);
          if (now > 1000) corrections.push(replica.lastCorrection);
          const after = replica.sample(now, 0).cars[1].p;
          maxSnapshotSnap = Math.max(maxSnapshotSnap,
            Math.hypot(...after.map((n, axis) => n - before[axis])));
        }
      }
    }
    if (serverAt <= now) {
      host.step({}, C.step, new Map([[0, {}], [1, remote.next(now)]]));
      // Approximately 3% loss, plus jitter that can reorder snapshots.
      if (serverTicks % 4 === 0 && serverTicks % 124 !== 0)
        packets.push({at: now + rtt / 2 + [2, 12, -3, 5][sequence % 4],
          state: {...makeState(host, ++sequence, remote.ack, 'test'),
            net: {inputTick: remote.inputTick ?? remote.ack}}});
      serverTicks++;
      serverAt += C.step * 1000;
    }
    if (renderAt <= now) {
      const dt = Math.min(0.1, Math.max(0, (now - lastRender) / 1000));
      lastRender = now;
      accumulator += dt;
      let steps = 0;
      while (accumulator >= C.step && steps++ < 12) {
        replica.step({throttle: 0.6, steer: 0.4});
        accumulator -= C.step;
      }
      // Match the real app: input sends happen at most once per render frame.
      if (now - lastSend >= 1000 / 60) {
        lastSend = now;
        if (renders % 31 !== 0)
          packets.push({at: now + rtt / 2 + [1, 9, -2, 4][renders % 4],
            frames: structuredClone(replica.inputFrames())});
      }
      const pose = replica.sample(now, dt, accumulator / C.step).cars[1].p.slice(),
        speed = replica.predicted.v.length();
      if (lastPose && dt > 0 && now > 2000 && speed > 5) {
        const distance = Math.hypot(...pose.map((n, axis) => n - lastPose[axis]));
        if (distance < 1e-6) stalledFrames++;
        speedErrors.push(Math.abs(distance / dt - speed) / speed);
        measuredFrames++;
      }
      lastPose = pose;
      renderAt += 1000 / fps * framePattern[renders % framePattern.length];
      renders++;
    }
  }
  return {fps, rtt, stalledFrames, measuredFrames,
    p95SpeedError: percentile(speedErrors, 0.95),
    p95CorrectionMetres: percentile(corrections, 0.95), maxSnapshotSnap,
    ...replica.diagnostics()};
}
