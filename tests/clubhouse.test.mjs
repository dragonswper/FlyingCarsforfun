import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  createCup,
  restoreCup,
  cupFixture,
  finishCupRound,
} from '../dist/club/cup.js';
import {
  Career,
  careerSave,
  ACHIEVEMENTS,
  dailyTasks,
  localDay,
} from '../dist/club/career.js';
import {clubStyle, ClubEffects} from '../dist/club/style.js';
import {ACADEMY_DRILLS} from '../dist/academy/catalog.js';
import {Simulation} from '../dist/physics.js';
const make = () =>
  createCup({name: 'VOLT', random: () => 0.33, id: 'test-cup-123456'});
const game = (id, overrides = {}) => ({
  id,
  mode: 'duel',
  won: true,
  goals: 3,
  touches: 12,
  shots: 4,
  saves: 1,
  assists: 0,
  demos: 0,
  points: 350,
  conceded: 0,
  ...overrides,
});
test('Cup creates eight distinct entries and three different fields, with increasing real bot levels', () => {
  const cup = make();
  assert.equal(cup.teams.length, 8);
  assert.equal(new Set(cup.teams).size, 8);
  assert.equal(new Set(cup.arenas).size, 3);
  assert.equal(cup.rounds[0].length, 4);
  const levels = [];
  for (let round = 0; round < 3; round++) {
    const fixture = cupFixture(cup),
      world = new Simulation(fixture);
    levels.push(world.options.difficulty);
    assert.equal(world.cars.length, 2);
    assert.equal(world.cars[1].bot, true);
    assert.equal(world.options.cupRound, round);
    cup.status = 'playing';
    assert.equal(
      finishCupRound(cup, 2, 1, () => 0.5),
      true,
    );
    assert.ok(restoreCup(cup));
  }
  assert.deepEqual(levels, ['rookie', 'pro', 'allstar']);
  assert.equal(cup.status, 'champion');
  assert.equal(finishCupRound(cup, 2, 1), false);
  const elite = createCup({tier: 'elite'});
  assert.equal(cupFixture(elite).difficulty, 'pro');
  elite.round = 2;
  elite.rounds[2] = [{a: elite.teams[0], b: 'VOLT'}];
  assert.equal(cupFixture(elite).difficulty, 'expert');
});
test('Cup loss eliminates, ties and invalid scores cannot advance, interrupted fixtures restart cleanly', () => {
  const c = make();
  assert.equal(finishCupRound(c, 1, 0), false);
  c.status = 'playing';
  assert.equal(finishCupRound(c, 1, 1), false);
  assert.equal(finishCupRound(c, NaN, 0), false);
  assert.equal(restoreCup(c).status, 'ready');
  assert.equal(finishCupRound(c, 0, 2), true);
  assert.equal(c.status, 'eliminated');
  assert.equal(restoreCup(c).status, 'eliminated');
  for (const change of [
    (c) => (c.arenas[1] = c.arenas[0]),
    (c) => (c.rounds[0][0].winner = 'MISSING'),
    (c) => (c.round = 1),
    (c) => (c.teams = []),
    (c) => (c.status = 'champion'),
  ]) {
    const broken = structuredClone(c);
    change(broken);
    assert.equal(restoreCup(broken), null);
  }
});
test('Career migrates existing totals, records every mode and rewards each milestone once', () => {
  const career = new Career({}, {matches: 4, wins: 2, goals: 9, xp: 100}),
    reward = career.recordMatch(game('match-one'));
  assert.equal(career.data.totals.matches, 5);
  assert.equal(career.data.totals.goals, 12);
  assert.ok(career.data.earned.includes('finisher'));
  assert.ok(reward.xp > 0);
  assert.equal(career.data.modes.duel.matches, 1);
  assert.deepEqual(career.recordMatch(game('match-one')), {
    xp: 0,
    unlocked: [],
  });
  const reloaded = new Career(career.data);
  assert.equal(reloaded.award().xp, 0);
  reloaded.recordMatch(game('match-two', {mode: 'doubles', won: false}));
  reloaded.recordMatch(game('match-three', {mode: 'custom'}));
  assert.equal(reloaded.data.modes.doubles.matches, 1);
  assert.equal(reloaded.data.modes.custom.matches, 1);
  assert.equal(reloaded.data.totals.streak, 1);
  assert.equal(ACHIEVEMENTS.length, 20);
});
test('Daily challenges rotate deterministically at local midnight, cap progress and never pay twice', () => {
  let clock = new Date(2026, 10, 27, 23, 59);
  const c = new Career({}, {}, () => clock),
    day = localDay(clock);
  assert.deepEqual(dailyTasks(day), dailyTasks(day));
  assert.equal(dailyTasks(day).length, 3);
  assert.equal(new Set(dailyTasks(day).map((t) => t.id)).size, 3);
  for (let i = 0; i < 3; i++) c.recordMatch(game('daily-' + i));
  assert.ok(c.data.daily.claimed.includes('matches'));
  const claimed = [...c.data.daily.claimed];
  assert.equal(c.award().xp, 0);
  assert.deepEqual(c.data.daily.claimed, claimed);
  clock = new Date(2026, 10, 28, 0, 1);
  c.refreshDay();
  assert.notEqual(c.data.daily.day, day);
  assert.deepEqual(c.data.daily.progress, {});
  assert.deepEqual(c.data.daily.claimed, []);
  assert.equal(c.data.totals.matches, 3);
});
test('Cup and Academy milestones are bounded, persisted and cannot be claimed repeatedly', () => {
  const c = new Career(),
    p = Object.fromEntries(
      ACADEMY_DRILLS.map((d) => [d.key, {medal: 3, completions: 1}]),
    );
  assert.ok(c.syncAcademy(p).xp > 0);
  assert.equal(c.data.totals.drills, 24);
  assert.equal(c.data.totals.golds, 24);
  assert.equal(c.syncAcademy(p).xp, 0);
  assert.ok(c.data.earned.includes('graduate'));
  assert.ok(c.recordCup('cup-test-12345').xp > 0);
  assert.equal(c.recordCup('cup-test-12345').xp, 0);
  assert.equal(c.data.totals.cups, 1);
  assert.equal(new Career(c.data).award().xp, 0);
  const other = new Career();
  other.syncAcademy({unknown: {medal: 3, completions: 1}});
  assert.equal(other.data.totals.drills, 0);
});
test('Malformed career saves are sanitized and identity or untrusted metadata is not retained', () => {
  const data = careerSave({
    totals: {matches: -5, goals: Infinity, saves: 4},
    earned: ['fake', 'debut', 'debut'],
    seen: ['valid', '<script>'],
    daily: {day: 'broken'},
    secret: 'do-not-save',
    modes: {duel: {wins: NaN}},
  });
  assert.equal(data.totals.matches, 0);
  assert.equal(data.totals.goals, 0);
  assert.equal(data.totals.saves, 4);
  assert.deepEqual(data.earned, ['debut']);
  assert.deepEqual(data.seen, ['valid']);
  assert.equal(data.daily, null);
  assert.equal(data.secret, undefined);
  assert.deepEqual(
    clubStyle({boost: 'fast', goal: '<img>', banner: 'unknown', title: null}),
    {boost: 'classic', goal: 'classic', banner: 'slate', title: 'driver'},
  );
});
test('Cosmetic goal bursts reuse the bounded particle path and respect reduced motion', () => {
  const calls = [],
    sim = new Simulation(),
    view = {
      cars: new Map(),
      animations: {reduced: false},
      burst: (...args) => calls.push(args),
    },
    fx = new ClubEffects(view);
  fx.goal({scorer: 0}, sim, 0, {goal: 'nova'});
  assert.equal(calls.length, 1);
  assert.ok(calls[0][2] <= 48);
  view.animations.reduced = true;
  fx.goal({scorer: 0}, sim, 0, {goal: 'nova'});
  assert.equal(calls.length, 1);
  view.animations.reduced = false;
  fx.goal({scorer: 1}, sim, 0, {goal: 'nova'});
  assert.equal(calls.length, 1);
});
test('The original Blender trophy is small, texture-free and renders in four mesh draws', () => {
  const b = readFileSync(
      new URL('../dist/assets/club/circuit-cup.glb', import.meta.url),
    ),
    g = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
  assert.ok(b.length < 100000);
  assert.equal(g.meshes.length, 4);
  assert.equal(g.images, undefined);
  assert.ok(
    g.nodes
      .filter((n) => n.mesh !== undefined)
      .every((n) => n.extras.originalArtwork),
  );
  assert.ok(
    readFileSync(new URL('../art/circuit-cup.blend', import.meta.url)).length >
      1000,
  );
});
