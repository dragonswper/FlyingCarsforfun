import assert from 'node:assert/strict';
import test from 'node:test';
import { AttackPhase, CombatTuning, advanceCombat, comboProgress, createCombatState, makeFlick } from '../src/combat.js';
import { createGame, getWeapon, stepGame } from '../src/simulation.js';
import { createWorld } from '../src/world.js';

const { IDLE, WINDUP, ACTIVE_SWING, RECOVERY, COOLDOWN } = AttackPhase;
const { MinFlickVelocity, InputCooldown, BufferWindow } = CombatTuning;
const weapon = getWeapon('plasma-blade');
const down = makeFlick(0, -1, MinFlickVelocity * 1.5);
const left = makeFlick(-1, 0, MinFlickVelocity);
const up = makeFlick(0, 1, MinFlickVelocity);
const opensAt = 1 - BufferWindow;

test('one follow-up buffers in the last 30% and fires after recovery and cooldown', () => {
  const combat = createCombatState();
  assert.equal(combat.phase, IDLE);
  assert.equal(advanceCombat(combat, weapon, weapon.windup / 2, { gesture: down }).started, true);
  assert.equal(combat.phase, WINDUP);
  advanceCombat(combat, weapon, weapon.windup / 2, { gesture: left });
  assert.equal(combat.phase, ACTIVE_SWING);
  assert.equal(combat.buffered, null);

  const firstHit = advanceCombat(combat, weapon, weapon.swing * (opensAt - 0.1), { gesture: left });
  assert.equal(firstHit.strike, down);
  assert.equal(comboProgress(combat, weapon), null);
  assert.equal(combat.buffered, null);
  advanceCombat(combat, weapon, weapon.swing * 0.1);
  assert.ok(Math.abs(comboProgress(combat, weapon) - opensAt) < 1e-9);
  assert.equal(advanceCombat(combat, weapon, weapon.swing * 0.05, { gesture: left }).strike, null);
  assert.equal(combat.buffered, left);
  advanceCombat(combat, weapon, weapon.swing * (BufferWindow - 0.05), { gesture: up });
  assert.equal(combat.phase, RECOVERY);
  assert.equal(combat.buffered, left);

  advanceCombat(combat, weapon, weapon.recovery, { gesture: up });
  assert.equal(combat.phase, COOLDOWN);
  assert.equal(advanceCombat(combat, weapon, InputCooldown / 2, { gesture: up }).started, false);
  assert.equal(advanceCombat(combat, weapon, InputCooldown / 2).started, true);
  assert.equal(combat.phase, WINDUP);
  assert.equal(combat.swingId, 2);
  assert.equal(combat.gesture, left);
  assert.equal(combat.buffered, null);
});

test('late network combos must match the preceding swing and its open window', () => {
  const combat = createCombatState();
  advanceCombat(combat, weapon, weapon.windup + weapon.swing, { gesture: down });
  assert.equal(combat.phase, RECOVERY);
  const queue = (swingId, progress, allowLateCombo) => advanceCombat(combat, weapon, 0.01, {
    gesture: { ...up, combo: { swingId, progress } }, allowLateCombo,
  });
  queue(combat.swingId, 0.9, false);
  queue(combat.swingId - 1, 0.9, true);
  queue(combat.swingId, opensAt - 0.05, true);
  assert.equal(combat.buffered, null);
  queue(combat.swingId, 0.9, true);
  assert.equal(combat.buffered.direction, 'UP');

  advanceCombat(combat, weapon, weapon.recovery, { cancelBuffer: true, canAttack: false });
  advanceCombat(combat, weapon, InputCooldown);
  assert.equal(combat.phase, IDLE);
  assert.equal(combat.swingId, 1);
  assert.equal(combat.buffered, null);
});

test('slow motions and unaffordable follow-ups do not start an attack', () => {
  const combat = createCombatState();
  advanceCombat(combat, weapon, 0.01, { gesture: makeFlick(1, 1, MinFlickVelocity - 1) });
  assert.equal(combat.phase, IDLE);
  advanceCombat(combat, weapon, weapon.windup + weapon.swing * opensAt, { gesture: down });
  advanceCombat(combat, weapon, weapon.swing * BufferWindow, { gesture: up });
  advanceCombat(combat, weapon, weapon.recovery + InputCooldown, { canAttack: false });
  assert.equal(combat.phase, IDLE);
  assert.equal(combat.swingId, 1);
});

test('arena fighters deal simultaneous damage using their captured gestures', () => {
  const game = createGame(createWorld('SWING', 'arena'), { arenaWeapon: 'iron-axe', versus: 'online' });
  game.player.z = 1;
  game.rival.z = -1;
  const input = { aimY: 1 };
  for (let frame = 0; frame < 24; frame++) stepGame(game, 1 / 60, input);
  stepGame(game, 1 / 60, { ...input, gesture: down }, { gesture: up });
  assert.ok(game.player.aimY > 0.5);
  assert.equal(game.player.combat.gesture.direction, 'DOWN');
  assert.equal(game.rival.combat.gesture.direction, 'UP');

  for (let frame = 0; frame < 30; frame++) stepGame(game, 1 / 60, input);
  const damage = getWeapon('iron-axe').damage;
  assert.equal(game.player.health, 100 - damage);
  assert.equal(game.rival.health, 100 - damage);
});

test('a late guard parries a strike and freezes both fighters briefly', () => {
  const game = createGame(createWorld('PARRY', 'arena'), { arenaWeapon: 'iron-axe', versus: 'online' });
  game.player.z = 1;
  game.rival.z = -1;
  stepGame(game, 1 / 60, { gesture: down });
  for (let frame = 0; frame < 19; frame++) stepGame(game, 1 / 60);
  let parry;
  for (let frame = 0; frame < 12 && !parry; frame++) {
    stepGame(game, 1 / 60, {}, { guard: true });
    parry = game.events.find(({ type }) => type === 'parry');
  }
  assert.ok(parry);
  assert.equal(game.rival.health, 100);
  assert.ok(game.player.stagger > 0);
  assert.ok(game.hitStop >= 2 / 60);
  const time = game.time;
  stepGame(game, 1 / 60);
  assert.equal(game.time, time);
});

test('an exhausted held guard breaks and stays down until released', () => {
  const game = createGame(createWorld('GUARD', 'arena'), { versus: 'online' });
  game.rival.stamina = 0.1;
  stepGame(game, 1 / 60, {}, { guard: true });
  assert.ok(game.events.some(({ type }) => type === 'guard-break'));
  assert.equal(game.rival.guarding, false);
  assert.equal(game.rival.guardLocked, true);
  for (let frame = 0; frame < 120; frame++) stepGame(game, 1 / 60, {}, { guard: true });
  assert.equal(game.rival.guarding, false);
  stepGame(game, 1 / 60);
  stepGame(game, 1 / 60, {}, { guard: true });
  assert.equal(game.rival.guarding, true);
});
