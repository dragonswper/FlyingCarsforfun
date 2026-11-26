import {ARENA_IDS} from '../arenas.js';
import {BODY_TYPES} from '../bodies.js';
import {matchRules, botStyle} from '../match-rules.js';
import {garageStyle} from '../garage-style.js';
export const REPLAY_LIMIT = 9000,
  REPLAY_BYTES = 16 * 1024 * 1024;
const finite = (v, max = 1000) => Number.isFinite(v) && Math.abs(v) <= max;
const vector = (v, n, max = 1000) =>
  Array.isArray(v) && v.length === n && v.every((x) => finite(x, max));
const rotation = (q) =>
  vector(q, 4, 1.01) && q.reduce((s, n) => s + n * n, 0) > 0.5;
const name = (value) =>
  [...String(value || 'DRIVER')]
    .filter((c) => c.charCodeAt(0) >= 32 && !['<', '>'].includes(c))
    .slice(0, 24)
    .join('');
export function validateReplay(raw) {
  if (
    !raw ||
    raw.format !== 'boost-circuit-replay' ||
    raw.version !== 1 ||
    !ARENA_IDS.includes(raw.arena) ||
    !['duel', 'doubles', 'custom', 'hoops'].includes(raw.mode) ||
    !Array.isArray(raw.roster) ||
    !raw.roster.length ||
    raw.roster.length > 8 ||
    !Array.isArray(raw.frames) ||
    raw.frames.length < 2 ||
    raw.frames.length > REPLAY_LIMIT
  )
    throw Error('This is not a supported Boost Circuit replay.');
  const ids = new Set(),
    roster = raw.roster.map((p) => {
      if (
        !p ||
        !Number.isInteger(p.id) ||
        p.id < 0 ||
        p.id > 7 ||
        ids.has(p.id) ||
        ![0, 1].includes(p.team) ||
        !BODY_TYPES.includes(p.body) ||
        !/^#[0-9a-fA-F]{6}$/.test(p.color)
      )
        throw Error('The replay roster is invalid.');
      ids.add(p.id);
      return {
        id: p.id,
        team: p.team,
        body: p.body,
        color: p.color,
        name: name(p.name),
        style: garageStyle(p.style),
      };
    });
  let previous = -1;
  const frames = raw.frames.map((f) => {
    if (
      !f ||
      !finite(f.time, 86400) ||
      f.time < 0 ||
      f.time <= previous ||
      !vector(f.ball?.p, 3) ||
      !rotation(f.ball?.q) ||
      !Array.isArray(f.cars) ||
      f.cars.length !== roster.length
    )
      throw Error('The replay contains invalid or unordered frames.');
    previous = f.time;
    return {
      time: f.time,
      ball: {p: [...f.ball.p], q: [...f.ball.q]},
      cars: f.cars.map((c, i) => {
        if (
          c.id !== roster[i].id ||
          !vector(c.p, 3) ||
          !rotation(c.q) ||
          !finite(c.speed ?? 0, 60) ||
          !finite(c.steer ?? 0, 1) ||
          typeof c.boosting !== 'boolean' ||
          typeof c.demo !== 'boolean'
        )
          throw Error('A replay vehicle pose is invalid.');
        return {
          id: c.id,
          team: roster[i].team,
          p: [...c.p],
          q: [...c.q],
          speed: c.speed || 0,
          steer: c.steer || 0,
          boosting: c.boosting,
          demo: c.demo,
          grounded: c.grounded !== false,
        };
      }),
    };
  });
  const start = frames[0].time,
    end = frames.at(-1).time,
    score =
      vector(raw.score, 2, 999) &&
      raw.score.every((n) => Number.isInteger(n) && n >= 0)
        ? raw.score
        : [0, 0];
  const bookmarks = Array.isArray(raw.bookmarks)
    ? raw.bookmarks
        .slice(-100)
        .filter(
          (b) => finite(b?.time, 86400) && b.time >= start && b.time <= end,
        )
        .map((b) => ({time: b.time, label: name(b.label)}))
    : [];
  return {
    format: 'boost-circuit-replay',
    version: 1,
    id:
      typeof raw.id === 'string' && /^[\w-]{8,64}$/.test(raw.id)
        ? raw.id
        : crypto.randomUUID(),
    recordedAt:
      finite(raw.recordedAt, 1e14) && raw.recordedAt > 0
        ? raw.recordedAt
        : Date.now(),
    arena: raw.arena,
    mode: raw.mode,
    rules: matchRules(raw.rules),
    botStyle: botStyle(raw.botStyle),
    roster,
    score,
    frames,
    bookmarks,
    truncated: raw.truncated === true,
  };
}
const round = (n) => Math.round(n * 1000) / 1000;
export class ReplayRecorder {
  constructor() {
    this.frames = new Array(REPLAY_LIMIT);
    this.clear();
  }
  clear() {
    this.active = false;
    this.cursor = 0;
    this.count = 0;
    this.last = -Infinity;
    this.bookmarks = [];
    this.meta = null;
  }
  start(sim, roster) {
    this.clear();
    if (
      !['duel', 'doubles', 'custom', 'hoops'].includes(sim.options.mode) ||
      sim.options.replay
    )
      return;
    this.active = true;
    this.meta = {
      format: 'boost-circuit-replay',
      version: 1,
      id: crypto.randomUUID(),
      recordedAt: Date.now(),
      arena: sim.options.arena,
      mode: sim.options.mode,
      rules: sim.options.rules,
      botStyle: sim.options.botStyle,
      roster,
    };
  }
  capture(snapshot, time) {
    if (!this.active || time - this.last < 0.099 || time <= this.last) return;
    this.last = time;
    const pose = (p) => ({p: p.p.map(round), q: p.q.map(round)});
    this.frames[this.cursor] = {
      time: round(time),
      ball: pose(snapshot.ball),
      cars: snapshot.cars.map((c) => ({
        ...pose(c),
        id: c.id,
        team: c.team,
        speed: round(c.speed || 0),
        steer: round(c.steer || 0),
        boosting: !!c.boosting,
        demo: !!c.demo,
        grounded: c.grounded !== false,
      })),
    };
    this.cursor = (this.cursor + 1) % REPLAY_LIMIT;
    this.count = Math.min(REPLAY_LIMIT, this.count + 1);
  }
  bookmark(time, label) {
    if (this.active) {
      this.bookmarks.push({time, label});
      if (this.bookmarks.length > 100) this.bookmarks.shift();
    }
  }
  finish(score) {
    if (!this.active) return null;
    this.active = false;
    if (this.count < 2) return null;
    const frames = Array.from(
      {length: this.count},
      (_, i) =>
        this.frames[
          (this.cursor - this.count + i + REPLAY_LIMIT) % REPLAY_LIMIT
        ],
    );
    return validateReplay({
      ...this.meta,
      frames,
      score,
      bookmarks: this.bookmarks,
      truncated: this.count === REPLAY_LIMIT,
    });
  }
}
