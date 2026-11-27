import test from "node:test";
import assert from "node:assert/strict";
import {
  createCombatFlow,
  recordCleanHit,
  advanceCombatFlow,
  breakHitCombo,
  actorTimeScale,
  validCombatFlow,
} from "../src/combat-flow.js";
import { createGame, stepGame } from "../src/simulation.js";
import { createWorld } from "../src/world.js";
import { makeFlick, CombatTuning } from "../src/combat.js";

function charge(flow) {
  for (let id = 1; id <= 5; id++) recordCleanHit(flow, id);
}
function duel() {
  const game = createGame(createWorld("FOCUS-TEST", "arena"), {
    versus: "online",
  });
  Object.assign(game.player, { x: -4, z: 0 });
  Object.assign(game.rival, { x: 4, z: 0 });
  return game;
}

test("misses and received damage break the hit streak without spending earned charge", () => {
  const miss = duel();
  charge(miss.player.flow);
  const cut = makeFlick(0, 1, CombatTuning.MinFlickVelocity);
  for (let i = 0; i < 65; i++)
    stepGame(miss, 1 / 60, i === 0 ? { gesture: cut } : {});
  assert.equal(miss.player.flow.count, 0);
  assert.equal(miss.player.flow.charge, 100);

  const received = duel();
  Object.assign(received.player, { x: 0, z: 1 });
  Object.assign(received.rival, { x: 0, z: -1 });
  charge(received.player.flow);
  for (let i = 0; i < 65; i++)
    stepGame(received, 1 / 60, {}, i === 0 ? { gesture: cut } : {});
  assert.ok(received.player.health < 100);
  assert.equal(received.player.flow.count, 0);
  assert.equal(received.player.flow.charge, 100);
  assert.equal(received.rival.flow.charge, 20);
});

test("five distinct clean swings fill Focus; broad swings cannot earn duplicate charge", () => {
  const flow = createCombatFlow();
  charge(flow);
  assert.equal(flow.charge, 100);
  assert.equal(flow.count, 5);
  assert.equal(flow.best, 5);
  assert.equal(recordCleanHit(flow, 5), false);
  assert.equal(recordCleanHit(flow, 4), false);
  assert.equal(flow.count, 5);
  advanceCombatFlow(flow, 3.01);
  assert.equal(flow.count, 0);
  assert.equal(flow.charge, 100);
  recordCleanHit(flow, 6);
  assert.equal(flow.count, 1);
  assert.equal(flow.best, 5);
  breakHitCombo(flow);
  assert.equal(flow.count, 0);
  assert.equal(flow.charge, 100);
});

test("Focus requires full charge, lasts four seconds and cannot recharge while active", () => {
  const flow = createCombatFlow();
  assert.equal(advanceCombatFlow(flow, 0.01, { request: true }), false);
  charge(flow);
  assert.equal(advanceCombatFlow(flow, 0, { request: true }), true);
  assert.equal(flow.charge, 0);
  assert.equal(flow.remaining, 4);
  recordCleanHit(flow, 6);
  assert.equal(flow.charge, 0);
  assert.equal(advanceCombatFlow(flow, 1, { request: true }), false);
  assert.equal(flow.remaining, 3);
  advanceCombatFlow(flow, 3);
  assert.equal(flow.remaining, 0);
  recordCleanHit(flow, 7);
  assert.equal(flow.charge, 20);
  advanceCombatFlow(flow, 0, { alive: false });
  assert.equal(flow.remaining, 0);
  assert.equal(flow.charge, 0);
});

test("authoritative Focus slows the opponent to 35% while its owner moves normally", () => {
  const game = duel();
  charge(game.player.flow);
  for (let i = 0; i < 60; i++)
    stepGame(game, 1 / 60, { moveZ: 1, focus: i === 0 }, { moveZ: 1 });
  assert.ok(Math.abs(game.player.z - 6.3) < 1e-7);
  assert.ok(Math.abs(game.rival.z - 6.3 * 0.35) < 1e-7);
  assert.ok(Math.abs(game.rival.clock / game.player.clock - 0.35) < 1e-7);
  assert.ok(Math.abs(game.sceneTime / game.time - 0.35) < 1e-7);
  assert.equal(actorTimeScale(game, game.player), 1);
  assert.equal(actorTimeScale(game, game.rival), 0.35);
});

test("guest requests use the same charge rules; simultaneous Focus counters slowdown and expires", () => {
  const game = duel();
  stepGame(game, 1 / 60, {}, { focus: true });
  assert.equal(game.rival.flow.remaining, 0);
  charge(game.rival.flow);
  stepGame(game, 1 / 60, {}, { focus: true });
  assert.equal(actorTimeScale(game, game.rival), 1);
  assert.equal(actorTimeScale(game, game.player), 0.35);
  charge(game.player.flow);
  stepGame(game, 1 / 60, { focus: true });
  assert.equal(actorTimeScale(game, game.player), 1);
  assert.equal(actorTimeScale(game, game.rival), 1);
  for (let i = 0; i < 242; i++) stepGame(game, 1 / 60);
  assert.equal(game.player.flow.remaining, 0);
  assert.equal(game.rival.flow.remaining, 0);
  assert.equal(actorTimeScale(game, game.player), 1);
  assert.equal(actorTimeScale(game, game.rival), 1);
});

test("real landed attacks build combos and charge; a missed strike breaks the streak", () => {
  const game = createGame(createWorld("FOCUS-YARD", "training"), {
    startingWeapon: "plasma-blade",
  });
  const target = game.actors[1];
  for (const actor of game.actors.slice(1)) {
    actor.drill = "fixed";
    actor.x = 30;
    actor.z = 30;
  }
  Object.assign(game.player, { x: 0, z: 0, facing: 0 });
  Object.assign(target, { x: 0, z: 2, health: 1000, maxHealth: 1000 });
  const gesture = makeFlick(0, -1, CombatTuning.MinFlickVelocity);
  for (let hit = 1; hit <= 5; hit++) {
    stepGame(game, 1 / 60, { gesture, facing: 0 });
    for (let i = 0; i < 65; i++) stepGame(game, 1 / 60, { facing: 0 });
    assert.equal(game.player.flow.count, hit);
    assert.equal(game.player.flow.charge, hit * 20);
  }
  assert.equal(game.player.stats.longestHitCombo, 5);
  stepGame(game, 1 / 60, { gesture, facing: Math.PI });
  for (let i = 0; i < 65; i++) stepGame(game, 1 / 60, { facing: Math.PI });
  assert.equal(game.player.flow.count, 0);
  assert.equal(game.player.flow.best, 5);
  assert.equal(game.player.flow.charge, 100);
});

test("flow snapshot validation rejects invalid charge, timing and counters", () => {
  const flow = createCombatFlow();
  assert.equal(validCombatFlow(flow), true);
  for (const change of [
    { charge: 101 },
    { charge: NaN },
    { remaining: 4.1 },
    { window: Infinity },
    { count: -1 },
    { count: 1.5 },
    { best: 1000 },
  ])
    assert.equal(validCombatFlow({ ...flow, ...change }), false);
});
