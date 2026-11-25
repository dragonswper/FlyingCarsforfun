import test from 'node:test';
import assert from 'node:assert/strict';
import {lobbyDisplayScene, LobbyShowroom} from '../dist/lobby-showroom.js';
const members = [
  {
    id: 0,
    team: 0,
    connected: true,
    look: {name: 'Host', body: 'striker', paint: 'blue'},
  },
  {
    id: 2,
    team: 1,
    connected: true,
    look: {name: 'Friend', body: 'rally', paint: 'mint'},
  },
];
test('lobby cars use each member body and paint, stay separated and never mutate the roster', () => {
  const original = structuredClone(members),
    {scene, roster, width} = lobbyDisplayScene(members, 2, 'coast');
  assert.deepEqual(members, original);
  assert.equal(scene.localPlayerId, 2);
  assert.equal(scene.cars.length, 2);
  assert.equal(scene.cars[0].id, 2);
  assert.equal(scene.cars[0].appearance.body, 'rally');
  assert.equal(scene.cars[0].appearance.color, '#53dbbd');
  assert.equal(scene.cars[1].playerName, 'Host');
  assert.ok(scene.cars[0].p.distanceTo(scene.cars[1].p) >= 3.6);
  assert.ok(width > 5);
  assert.notEqual(roster[0].look, members[1].look);
  const many = Array.from({length: 8}, (_, id) => ({...members[0], id})),
    group = lobbyDisplayScene(many, 0, 'woods');
  assert.equal(group.scene.cars.length, 8);
  assert.equal(
    new Set(group.scene.cars.map((car) => car.p.toArray().join(','))).size,
    8,
  );
  assert.ok(group.depth > 0);
});
test('showroom cancels stale asset loads when someone leaves or the match starts', async () => {
  let complete;
  const prepared = new Promise((resolve) => (complete = resolve)),
    scenes = [],
    view = {ensureBody: () => prepared, sync: (scene) => scenes.push(scene)},
    room = {
      code: 'test',
      id: 0,
      ownerId: 0,
      party: true,
      connected: true,
      options: {maxPeople: 4},
      members,
    },
    settings = {arena: 'coast', paint: 'blue', body: 'striker'};
  let current = true;
  const showroom = new LobbyShowroom({
      view,
      settings,
      isCurrent: () => current,
      onScene() {},
    }),
    pending = showroom.sync(room);
  assert.equal(showroom.sync(room), pending);
  current = false;
  showroom.clear(false);
  complete();
  await pending;
  assert.equal(scenes.length, 0);
  assert.equal(view.showroom, null);
});
test('roster changes add and remove cars, heartbeats reuse models and failed bodies have a bounded fallback', async () => {
  const scenes = [],
    view = {
      ensureBody: async (body) => {
        if (body === 'rally') throw Error('unavailable');
      },
      sync: (scene) => scenes.push(scene),
    },
    room = {
      code: 'test',
      id: 0,
      ownerId: 0,
      party: true,
      connected: true,
      options: {maxPeople: 8},
      members: structuredClone(members),
    },
    settings = {arena: 'coast', paint: 'blue', body: 'striker'};
  const showroom = new LobbyShowroom({
    view,
    settings,
    isCurrent: () => true,
    onScene() {},
  });
  await showroom.sync(room);
  assert.equal(scenes.length, 1);
  assert.ok(scenes[0].cars.every((car) => car.appearance.body === 'striker'));
  await showroom.sync(room);
  assert.equal(scenes.length, 1);
  room.members.pop();
  await showroom.sync(room);
  assert.equal(scenes.at(-1).cars.length, 1);
  showroom.clear();
  assert.equal(view.showroom, null);
  assert.equal(scenes.at(-1).cars.length, 1);
});
