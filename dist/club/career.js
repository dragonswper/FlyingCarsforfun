import {ACADEMY_DRILLS} from '../academy/catalog.js';
// Local career progression. This is a browser save, never a verified ranking.
const n = (v, max = 1e9) =>
  Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0;
export const ACHIEVEMENTS = Object.freeze(
  [
    ['debut', 'On the grid', 'Finish your first match', 'matches', 1, 100],
    ['five', 'Finding rhythm', 'Finish five matches', 'matches', 5, 200],
    ['regular', 'Club regular', 'Finish 25 matches', 'matches', 25, 400],
    ['winner', 'First victory', 'Win a match', 'wins', 1, 150],
    ['ten-wins', 'Double figures', 'Win ten matches', 'wins', 10, 400],
    ['finisher', 'Goal getter', 'Score ten goals', 'goals', 10, 250],
    ['century', 'Century striker', 'Score 100 goals', 'goals', 100, 750],
    ['touch', 'Ball magnet', 'Make 100 touches', 'touches', 100, 200],
    ['keeper', 'Safe hands', 'Make ten saves', 'saves', 10, 300],
    ['shooter', 'On target', 'Take 50 shots', 'shots', 50, 300],
    ['assist', 'Better together', 'Make five assists', 'assists', 5, 300],
    ['demo', 'Bumper club', 'Make ten demolitions', 'demos', 10, 250],
    [
      'hattrick',
      'Hat trick',
      'Score three goals in one match',
      'bestGoals',
      3,
      300,
    ],
    [
      'clean-sheet',
      'Locked down',
      'Win without conceding',
      'cleanSheets',
      1,
      250,
    ],
    ['overtime', 'Extra time', 'Win an overtime match', 'overtimeWins', 1, 300],
    [
      'streak',
      'Three in a row',
      'Win three consecutive matches',
      'bestStreak',
      3,
      400,
    ],
    ['cup', 'Cup champion', 'Win a Circuit Cup', 'cups', 1, 750],
    [
      'student',
      'Doing the work',
      'Complete six Academy drills',
      'drills',
      6,
      250,
    ],
    [
      'graduate',
      'Academy graduate',
      'Complete all 24 Academy drills',
      'drills',
      24,
      750,
    ],
    ['gold', 'Gold standard', 'Earn six Academy gold medals', 'golds', 6, 500],
  ].map(([id, name, description, stat, target, xp]) =>
    Object.freeze({id, name, description, stat, target, xp}),
  ),
);
const fields = [
  'matches',
  'wins',
  'goals',
  'touches',
  'saves',
  'shots',
  'assists',
  'demos',
  'points',
  'bestGoals',
  'cleanSheets',
  'overtimeWins',
  'streak',
  'bestStreak',
  'cups',
  'drills',
  'golds',
];
const challengePool = [
  {id: 'goals', name: 'Score 4 goals', stat: 'goals', target: 4},
  {id: 'touches', name: 'Make 20 touches', stat: 'touches', target: 20},
  {id: 'shots', name: 'Take 6 shots', stat: 'shots', target: 6},
  {id: 'wins', name: 'Win 2 matches', stat: 'wins', target: 2},
  {id: 'saves', name: 'Make 3 saves', stat: 'saves', target: 3},
];
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dailyTasks(day) {
  let seed = 2166136261;
  for (const c of day) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const pool = [...challengePool],
    selected = [
      {id: 'matches', name: 'Finish 3 matches', stat: 'matches', target: 3},
    ];
  for (let i = 0; i < 2; i++) {
    const index = seed % pool.length;
    selected.push(pool.splice(index, 1)[0]);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  }
  return selected.map((t) => ({...t, xp: 200}));
}
export function careerSave(raw = {}, baseline = {}) {
  const totals = {};
  for (const key of fields)
    totals[key] = n(raw?.totals?.[key] ?? baseline[key]);
  const modes = {};
  for (const key of ['duel', 'doubles', 'custom','hoops']) {
    const source = raw?.modes?.[key];
    modes[key] = {
      matches: n(source?.matches),
      wins: n(source?.wins),
      goals: n(source?.goals),
      points: n(source?.points),
    };
  }
  const earned = Array.isArray(raw?.earned)
    ? raw.earned.filter((id) => ACHIEVEMENTS.some((a) => a.id === id))
    : [];
  const daily =
    raw?.daily && /^\d{4}-\d{2}-\d{2}$/.test(raw.daily.day)
      ? {day: raw.daily.day, progress: {}, claimed: []}
      : null;
  if (daily)
    for (const t of dailyTasks(daily.day)) {
      daily.progress[t.id] = n(raw.daily.progress?.[t.id], t.target);
      if (Array.isArray(raw.daily.claimed) && raw.daily.claimed.includes(t.id))
        daily.claimed.push(t.id);
    }
  const seen = Array.isArray(raw?.seen)
    ? raw.seen
        .filter((id) => typeof id === 'string' && /^[-\w:]{1,100}$/.test(id))
        .slice(-64)
    : [];
  return {totals, modes, earned: [...new Set(earned)], daily, seen};
}
export class Career {
  constructor(raw = {}, baseline = {}, now = () => new Date()) {
    this.data = careerSave(raw, baseline);
    this.now = now;
    this.refreshDay();
  }
  refreshDay() {
    const day = localDay(this.now());
    if (this.data.daily?.day !== day)
      this.data.daily = {day, progress: {}, claimed: []};
  }
  award() {
    let xp = 0;
    const unlocked = [];
    for (const a of ACHIEVEMENTS)
      if (
        this.data.totals[a.stat] >= a.target &&
        !this.data.earned.includes(a.id)
      ) {
        this.data.earned.push(a.id);
        xp += a.xp;
        unlocked.push(a.name);
      }
    for (const t of dailyTasks(this.data.daily.day))
      if (
        (this.data.daily.progress[t.id] || 0) >= t.target &&
        !this.data.daily.claimed.includes(t.id)
      ) {
        this.data.daily.claimed.push(t.id);
        xp += t.xp;
        unlocked.push(t.name);
      }
    return {xp, unlocked};
  }
  recordMatch(match) {
    this.refreshDay();
    if (
      !match ||
      !/^[-\w:]{1,100}$/.test(match.id || '') ||
      this.data.seen.includes(match.id) ||
      !['duel', 'doubles', 'custom','hoops'].includes(match.mode) ||
      typeof match.won !== 'boolean'
    )
      return {xp: 0, unlocked: []};
    this.data.seen.push(match.id);
    this.data.seen = this.data.seen.slice(-64);
    const t = this.data.totals,
      delta = {matches: 1, wins: match.won ? 1 : 0};
    for (const key of [
      'goals',
      'touches',
      'shots',
      'saves',
      'assists',
      'demos',
      'points',
    ])
      delta[key] = n(match[key], 10000);
    for (const [key, value] of Object.entries(delta))
      t[key] = n(t[key] + value);
    t.bestGoals = Math.max(t.bestGoals, delta.goals);
    t.streak = match.won ? n(t.streak + 1) : 0;
    t.bestStreak = Math.max(t.bestStreak, t.streak);
    if (match.won && match.conceded === 0) t.cleanSheets = n(t.cleanSheets + 1);
    if (match.won && match.overtime) t.overtimeWins = n(t.overtimeWins + 1);
    const m = this.data.modes[match.mode];
    for (const key of ['matches', 'wins', 'goals', 'points'])
      m[key] = n(m[key] + delta[key]);
    for (const task of dailyTasks(this.data.daily.day))
      this.data.daily.progress[task.id] = Math.min(
        task.target,
        (this.data.daily.progress[task.id] || 0) + (delta[task.stat] || 0),
      );
    return this.award();
  }
  recordCup(id) {
    if (!/^[-\w]{8,64}$/.test(id || '') || this.data.seen.includes('cup:' + id))
      return {xp: 0, unlocked: []};
    this.refreshDay();
    this.data.seen.push('cup:' + id);
    this.data.seen = this.data.seen.slice(-64);
    this.data.totals.cups = n(this.data.totals.cups + 1);
    return this.award();
  }
  syncAcademy(progress) {
    this.refreshDay();
    let drills = 0,
      golds = 0;
    for (const drill of ACADEMY_DRILLS) {
      const d = progress?.[drill.key];
      if (d?.completions > 0 && d?.medal > 0) drills++;
      if (d?.medal === 3) golds++;
    }
    this.data.totals.drills = Math.max(
      this.data.totals.drills,
      Math.min(24, drills),
    );
    this.data.totals.golds = Math.max(
      this.data.totals.golds,
      Math.min(24, golds),
    );
    return this.award();
  }
}
