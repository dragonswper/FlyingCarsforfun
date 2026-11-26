import test from 'node:test';
import assert from 'node:assert/strict';
import {sessionHeartbeat} from '../server/runtime/session-heartbeat.mjs';
import {DedicatedRoom} from '../dist/dedicated-room.js';
import {GameService} from '../server/runtime/game-service.mjs';
test('asset preparation retains a minute of grace while live games keep the three-second watchdog', () => {
  let lost = 0;
  const entry = {
      id: 0,
      lastReceive: 0,
      lastRealtimeAt: 0,
      link: {open: true, send() {}},
      quality: {summary: () => ({ping: 0})},
    },
    room = {
      clock: () => 4000,
      closed: false,
      matchId: 'm',
      pendingMatch: 'm',
      status: 'starting',
      sim: {phase: 'kickoff'},
      entries: new Map([[0, entry]]),
      lostPeer: () => lost++,
      ping() {},
      change() {},
      later() {},
    };
  sessionHeartbeat(room);
  assert.equal(lost, 0);
  room.pendingMatch = null;
  room.status = 'playing';
  sessionHeartbeat(room);
  assert.equal(lost, 1);
  let clientLost = 0;
  const client = {
    clock: () => 4000,
    closed: false,
    recovering: false,
    admitted: true,
    link: {open: true, send() {}},
    lastReceive: 0,
    matchId: 'm',
    pendingMatch: 'm',
    status: 'starting',
    sim: {phase: 'kickoff'},
    lostHost: () => clientLost++,
    ping() {},
    change() {},
    later() {},
  };
  DedicatedRoom.prototype.beat.call(client);
  assert.equal(clientLost, 0);
  client.pendingMatch = null;
  client.status = 'playing';
  DedicatedRoom.prototype.beat.call(client);
  assert.equal(clientLost, 1);
});
test('free-server admissions are bounded while two returning squads keep reserved lightweight lobby space', () => {
  const service = new GameService({
    maxRooms: 1,
    maxLobbies: 8,
    autostart: false,
  });
  try {
    for (let i = 0; i < 8; i++) service.makeRoom({mode: 'custom'});
    assert.throws(() => service.makeRoom({mode: 'custom'}), /lobby/);
    assert.doesNotThrow(() => service.makeRoom({mode: 'custom'}, false, true));
    assert.doesNotThrow(() => service.makeRoom({mode: 'custom'}, false, true));
    assert.ok(service.rooms.size <= 11);
    assert.equal(service.physicsRooms.length, 0);
  } finally {
    service.close();
  }
});
