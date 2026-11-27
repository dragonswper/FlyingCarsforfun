import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatTuning, makeFlick } from '../src/combat.js';
import { lerp, riverProfile, routeDrainage } from '../src/landscape.js';
import { createGame, equipWeapon, stepGame } from '../src/simulation.js';
import { createWorld, hydrateWorld, worldData, WorldTuning } from '../src/world.js';

test('watersheds route runoff from closed depressions through the lowest outlet', () => {
  const heights = Float32Array.of(
    9, 9, 9, 9, 9,
    9, 5, 5, 5, 9,
    9, 5, -3, 2, 0,
    9, 5, 5, 5, 9,
    9, 9, 9, 9, 9,
  );
  const { flow, downstream } = routeDrainage(heights, 5);
  assert.equal(downstream[12], 13);
  assert.equal(downstream[13], 14);
  let drained = 0;
  for (let i = 0; i < flow.length; i++) if (downstream[i] === -1) drained += flow[i];
  assert.equal(drained, heights.length);
});

test('a configured Frontier terrain survives worker transfer and regenerates identically', () => {
  const config = { preset: 'large', era: 'redcanopy' };
  const first = createWorld('CAMP-26', 'frontier', config);
  const second = createWorld('CAMP-26', 'frontier', config);
  assert.equal(first.size, WorldTuning.sizes.large);
  assert.equal(first.regions[0].id, 'redcanopy');
  assert.deepEqual(first.terrain.heights, second.terrain.heights);
  assert.deepEqual(first.props, second.props);
  const hydrated = hydrateWorld(structuredClone(worldData(first)));
  assert.deepEqual(hydrated.forts, first.forts);
  let water = 0;
  for (let z = -72; z < 72; z += 3) for (let x = -12; x < 12; x += 2) {
    assert.equal(hydrated.height(x, z), first.height(x, z));
    assert.equal(hydrated.canMove(x, z), first.canMove(x, z));
    assert.ok(Math.abs(hydrated.biomeWeights(x, z).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-6);
    if (hydrated.waterAt(x, z) !== null) water++;
  }
  assert.ok(water > 20);
  assert.notDeepEqual(first.terrain.heights, createWorld('OTHER', 'frontier', config).terrain.heights);
});

test('fort sites share elevation and distance, and place clear gates and spawn pads', () => {
  for (const preset of ['small', 'medium', 'large']) {
    const world = createWorld('BALANCE', 'frontier', { preset });
    assert.equal(world.forts.length, 4);
    assert.equal(new Set(world.forts.map(({ region }) => region.id)).size, 4);
    const first = world.forts[0];
    for (const fort of world.forts) {
      assert.equal(Math.hypot(fort.x, fort.z), Math.hypot(first.x, first.z));
      assert.ok(Math.abs(world.height(fort.x, fort.z) - first.elevation) < 1e-5);
      assert.equal(world.canMove(fort.spawn.x, fort.spawn.z), true);
      assert.equal(world.canMove(fort.x, fort.z), false);
      assert.equal(world.canMove(fort.x, fort.z - Math.sign(fort.z) * 6.2), true);
    }
    const hut = world.props.find(({ kind }) => kind === 'building');
    assert.equal(world.canMove(hut.x, hut.z), true);
    const doorX = hut.x + Math.sin(hut.rotation) * hut.depth / 2;
    const doorZ = hut.z + Math.cos(hut.rotation) * hut.depth / 2;
    assert.equal(world.canMove(doorX, doorZ), true);
  }
});

test('Arena seeds keep symmetrical floor and valid spawns', () => {
  const world = createWorld('PIT-26', 'arena', { era: 'glassreach' });
  assert.equal(world.regions[0].id, 'glassreach');
  assert.equal(world.height(0, 4.35), world.height(0, -4.35));
  assert.ok(world.spawns.every(({ x, z }) => world.canMove(x, z)));
  assert.equal(world.canMove(0, 10), false);
});

test('Frontier roads pass through their gates and over dry crossings', () => {
  const cases = [['small', 'ROADS-12'], ['small', 'ROADS-16'], ['medium', 'BALANCE'], ['large', 'ROADS-7']];
  for (const [preset, seed] of cases) {
    const world = createWorld(seed, 'frontier', { preset });
    let crossing = 0;
    for (const [from, to] of world.paths) {
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const steps = Math.ceil(length / 0.48);
      let previous = world.height(from.x, from.z);
      for (let i = 1; i <= steps; i++) {
        const x = lerp(from.x, to.x, i / steps);
        const z = lerp(from.z, to.z, i / steps);
        const y = world.height(x, z);
        const onCore = world.forts.some((fort) => Math.hypot(x - fort.x, z - fort.z) < 2);
        if (!onCore) assert.ok(world.canMove(x, z, 0.47), `${preset} ${seed} has a blocked road`);
        assert.ok(Math.abs(y - previous) / (length / steps) < 0.85, `${preset} ${seed} has a steep step`);
        previous = y;
        const river = riverProfile(world.river, z);
        if (Math.abs(x - river.x) < river.width) {
          assert.equal(world.waterAt(x, z), null);
          crossing++;
        }
      }
    }
    assert.ok(crossing > 0);
  }
});

test('training offers fixed and strafing targets, a knight loadout, and safe repeatable hits', () => {
  const world = createWorld('TRAINING', 'training');
  const match = createGame(world);
  const stationary = match.actors.find(({ drill }) => drill === 'fixed');
  const moving = match.actors.find(({ drill }) => drill === 'strafe');
  const { x, z } = moving;
  assert.equal(match.player.avatar, 'knight');
  assert.equal(match.player.weaponId, 'steel-longsword');
  const dagger = match.player.inventory.indexOf('knight-dagger');
  assert.equal(equipWeapon(match, dagger), true);
  assert.equal(equipWeapon(match, 0), true);
  for (let frame = 0; frame < 500; frame++) stepGame(match, 1 / 60);
  assert.equal(stationary.x, stationary.spawn.x);
  assert.equal(stationary.z, stationary.spawn.z);
  assert.ok(Math.hypot(moving.x - x, moving.z - z) > .05);
  assert.equal(match.player.health, 100);

  const flick = makeFlick(0, -1, CombatTuning.MinFlickVelocity * 1.5);
  for (let swing = 0; swing < 4; swing++) {
    stepGame(match, 1 / 60, { gesture: flick });
    for (let frame = 0; frame < 66; frame++) stepGame(match, 1 / 60);
  }
  assert.equal(match.training.fixedHits, 4);
  assert.ok(stationary.health < 100 || !stationary.alive);
  for (let frame = 0; frame < 90; frame++) stepGame(match, 1 / 60);
  assert.equal(stationary.health, 100);
  assert.equal(match.player.health, 100);
  assert.equal(match.status, 'playing');
});

test('each size and mode produces byte-identical serialized world data', async () => {
  const { serialize } = await import('node:v8');
  for (const mode of ['frontier', 'arena', 'training']) {
    for (const preset of ['small', 'medium', 'large']) {
      const config = { era: 'sunscar', preset };
      const bytes = () => serialize(worldData(createWorld('DAY-20261120', mode, config)));
      assert.deepEqual(bytes(), bytes(), `${mode} ${preset}`);
    }
  }
});
