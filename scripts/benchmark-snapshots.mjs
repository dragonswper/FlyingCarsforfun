// Isolated CPU benchmark: synthetic sockets serialize every real snapshot, but
// no network, player accounts or renderer are involved. Run on an idle machine.
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {ServerSession} from '../server/session.mjs';

let clock = 0, bytes = 0;
const room = new ServerSession({
  code: 'benchmark', options: {mode: 'custom', maxPeople: 8},
  clock: () => clock, setTimer: () => ({unref() {}}), clearTimer() {}
});
for (let i = 0; i < 8; i++) {
  const socket = {
    readyState: 1, bufferedAmount: 0,
    send: data => bytes += Buffer.byteLength(data), close() {}
  };
  const {entry} = room.attach(socket, {look: {name: 'Benchmark'}}, {id: 'benchmark-' + i});
  entry.member.team = i % 2;
  entry.member.ready = true;
}
room.makeSimulation('benchmark', room.players());
room.status = 'playing';
let worlds = 0;
const q = room.sim.cars[0].q, toArray = q.toArray;
q.toArray = function(...args) { worlds++; return toArray.apply(this, args); };
for (let i = 0; i < 200; i++) { clock += 40; room.publish(true); }
const runs = [];
worlds = bytes = 0;
for (let run = 0; run < 3; run++) {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) { clock += 40; room.publish(true); }
  runs.push(performance.now() - start);
}
room.close(false);
const result = {
  publishes: 3000, players: 8, worldSnapshots: worlds, bytes,
  runsMs: runs, medianMs: [...runs].sort((a, b) => a - b)[1]
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
