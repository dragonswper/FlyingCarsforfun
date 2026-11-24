// Deterministic eight-player physics/input/snapshot CPU benchmark. No network.
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {ServerSession} from '../server/session.mjs';
import {C} from '../dist/physics.js';
const runs = [];
let bytes = 0;
for (let run = 0; run < 3; run++) {
  let now = 0;
  const room = new ServerSession({
    code: 'benchmark',
    options: {mode: 'custom', maxPeople: 8, duration: 1800},
    clock: () => now,
    setTimer: () => ({unref() {}}),
    clearTimer() {},
  });
  for (let i = 0; i < 8; i++) {
    const {entry} = room.attach(
      {
        readyState: 1,
        bufferedAmount: 0,
        send: (raw) => (bytes += Buffer.byteLength(raw)),
        close() {},
      },
      {look: {name: 'Bench'}},
      {id: 'bench-' + i},
    );
    entry.member.team = i % 2;
  }
  room.makeSimulation('benchmark', room.players());
  room.status = 'playing';
  room.sim.phase = 'playing';
  bytes = 0;
  const start = performance.now();
  for (let tick = 1; tick <= 5000; tick++) {
    now = tick * C.step * 1000;
    if (tick % 2 === 0)
      for (const [i, entry] of room.entries) {
        const frames = [];
        for (let n = Math.max(1, tick - 3); n <= tick; n++)
          frames.push([
            n,
            0.45,
            i % 2 ? 0.08 : -0.08,
            0,
            0,
            n % 900 === 0 ? 1 : 0,
            0.5,
          ]);
        entry.remote.receive(frames, now);
      }
    room.pump(C.step);
  }
  runs.push(performance.now() - start);
  room.close(false);
}
const result = {
  ticksPerRun: 5000,
  players: 8,
  runsMs: runs,
  medianMs: [...runs].sort((a, b) => a - b)[1],
  bytesPerRun: bytes,
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
