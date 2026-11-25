import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerSession} from '../server/session.mjs';
import {DedicatedRoom} from '../dist/dedicated-room.js';
const timers = {setTimer: () => ({unref() {}}), clearTimer() {}};
test('the authority retains a slow/background lobby for a minute but keeps the live-match watchdog', (t) => {
  let now = 0;
  const room = new ServerSession({
    code: 'heartbeat',
    options: {mode: 'custom'},
    clock: () => now,
    ...timers,
  });
  t.after(() => room.close(false));
  const {entry} = room.attach(
    {readyState: 1, bufferedAmount: 0, send() {}, close() {}},
    {look: {name: 'Test'}},
    {id: 'heartbeat'},
  );
  now = 5000;
  room.beat();
  assert.equal(entry.recovering, false);
  now = 61000;
  room.beat();
  assert.equal(entry.recovering, true);
  entry.recovering = false;
  entry.lastReceive = 0;
  entry.link = {open: true, closed: false, send() {}, close() {}};
  room.matchId = 'active';
  room.sim = {phase: 'playing'};
  now = 4000;
  room.beat();
  assert.equal(entry.recovering, true);
});
test('the browser uses the same relaxed lobby and strict gameplay thresholds', (t) => {
  let now = 0,
    lost = 0;
  const room = new DedicatedRoom({
    address: 'https://example.test',
    clock: () => now,
    ...timers,
  });
  room.link = {
    open: true,
    send() {
      return true;
    },
    close() {},
  };
  room.admitted = true;
  room.lostHost = () => lost++;
  t.after(() => room.close(false));
  room.lastReceive = 0;
  now = 5000;
  room.beat();
  assert.equal(lost, 0);
  now = 61000;
  room.beat();
  assert.equal(lost, 1);
  room.matchId = 'active';
  room.sim = {phase: 'playing'};
  now = 4000;
  room.beat();
  assert.equal(lost, 2);
});
