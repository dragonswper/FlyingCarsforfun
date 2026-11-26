import {ARENAS} from '../arenas.js';
const rivals = ['VOLT', 'NOVA', 'KITE', 'FLUX', 'AXLE', 'COMET', 'RUSH'];
const stages = ['QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'];
const randomInt = (random, max) =>
  Math.max(0, Math.min(max - 1, Math.floor(random() * max)));
export function createCup({
  name = 'DRIVER',
  duration = 120,
  tier = 'club',
  random = Math.random,
  id = globalThis.crypto.randomUUID(),
} = {}) {
  const maps = Object.keys(ARENAS),
    arenas = [];
  for (let i = 0; i < 3; i++)
    arenas.push(maps.splice(randomInt(random, maps.length), 1)[0]);
  const teams = ['YOU · ' + String(name).slice(0, 18), ...rivals],
    rounds = [[], [], []];
  for (let i = 0; i < 4; i++)
    rounds[0].push({
      a: teams[i * 2],
      b: teams[i * 2 + 1],
      blue: null,
      orange: null,
      winner: null,
    });
  return {
    id,
    duration: duration === 300 ? 300 : 120,
    tier: tier === 'elite' ? 'elite' : 'club',
    round: 0,
    status: 'ready',
    teams,
    arenas,
    rounds,
  };
}
export function restoreCup(raw) {
  if (
    !raw ||
    !/^[-\w]{8,64}$/.test(raw.id || '') ||
    !['club', 'elite'].includes(raw.tier) ||
    ![120, 300].includes(raw.duration) ||
    !Number.isInteger(raw.round) ||
    raw.round < 0 ||
    raw.round > 2 ||
    !['ready', 'playing', 'eliminated', 'champion'].includes(raw.status)
  )
    return null;
  if (
    !Array.isArray(raw.teams) ||
    raw.teams.length !== 8 ||
    raw.teams.some(
      (t) => typeof t !== 'string' || !t.length || t.length > 24,
    ) ||
    !Array.isArray(raw.arenas) ||
    raw.arenas.length !== 3 ||
    raw.arenas.some((a) => !Object.hasOwn(ARENAS, a)) ||
    new Set(raw.arenas).size !== 3 ||
    !Array.isArray(raw.rounds) ||
    raw.rounds.length !== 3
  )
    return null;
  const copy = structuredClone(raw);
  for (let r = 0; r < 3; r++) {
    const games = copy.rounds[r];
    if (!Array.isArray(games) || games.length > 4 >> r) return null;
    for (const m of games) {
      if (
        !m ||
        ![m.a, m.b].every((t) => copy.teams.includes(t)) ||
        m.a === m.b ||
        (m.winner !== null && ![m.a, m.b].includes(m.winner))
      )
        return null;
      if (m.winner === null) {
        if (m.blue !== null || m.orange !== null) return null;
      } else if (
        !Number.isSafeInteger(m.blue) ||
        !Number.isSafeInteger(m.orange) ||
        m.blue < 0 ||
        m.orange < 0 ||
        m.blue > 999 ||
        m.orange > 999 ||
        m.blue === m.orange ||
        m.winner !== (m.blue > m.orange ? m.a : m.b)
      )
        return null;
    }
    if (r <= copy.round && games.length !== 4 >> r) return null;
    if (r < copy.round && games.some((g) => g.winner === null)) return null;
    if (r > 0 && games.length) {
      const prior = copy.rounds[r - 1];
      if (prior.length !== 8 >> r || prior.some((g) => !g.winner)) return null;
      for (let i = 0; i < games.length; i++)
        if (
          games[i].a !== prior[2 * i].winner ||
          games[i].b !== prior[2 * i + 1].winner
        )
          return null;
    }
  }
  const fixture = copy.rounds[copy.round][0];
  if (!fixture || fixture.a !== copy.teams[0]) return null;
  if (['ready', 'playing'].includes(copy.status) && fixture.winner !== null)
    return null;
  if (
    copy.status === 'champion' &&
    (copy.round !== 2 || fixture.winner !== copy.teams[0])
  )
    return null;
  if (copy.status === 'eliminated' && fixture.winner !== fixture.b) return null;
  // A browser close during a match restarts that fixture. It does not restore
  // half a physics world or retain a private network session.
  if (copy.status === 'playing') copy.status = 'ready';
  return copy;
}
export function cupFixture(cup) {
  const levels =
    cup.tier === 'elite'
      ? ['pro', 'allstar', 'expert']
      : ['rookie', 'pro', 'allstar'];
  return {
    mode: 'duel',
    duration: cup.duration,
    difficulty: levels[cup.round],
    arena: cup.arenas[cup.round],
    cupId: cup.id,
    cupRound: cup.round,
    opponent: cup.rounds[cup.round][0].b,
    stage: stages[cup.round],
  };
}
export function finishCupRound(cup, blue, orange, random = Math.random) {
  if (
    cup.status !== 'playing' ||
    !Number.isSafeInteger(blue) ||
    !Number.isSafeInteger(orange) ||
    blue < 0 ||
    orange < 0 ||
    blue > 999 ||
    orange > 999 ||
    blue === orange
  )
    return false;
  const games = cup.rounds[cup.round],
    player = games[0];
  if (player.winner !== null) return false;
  Object.assign(player, {
    blue,
    orange,
    winner: blue > orange ? player.a : player.b,
  });
  for (let i = 1; i < games.length; i++) {
    const a = randomInt(random, 5),
      b = (a + 1 + randomInt(random, 4)) % 6;
    Object.assign(games[i], {
      blue: a,
      orange: b,
      winner: a > b ? games[i].a : games[i].b,
    });
  }
  if (player.winner !== cup.teams[0]) cup.status = 'eliminated';
  else if (cup.round === 2) cup.status = 'champion';
  else {
    cup.round++;
    cup.rounds[cup.round] = [];
    for (let i = 0; i < games.length; i += 2)
      cup.rounds[cup.round].push({
        a: games[i].winner,
        b: games[i + 1].winner,
        blue: null,
        orange: null,
        winner: null,
      });
    cup.status = 'ready';
  }
  return true;
}
export const CUP_STAGES = stages;
