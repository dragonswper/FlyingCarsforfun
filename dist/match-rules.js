import {C} from './constants.js';
// Only these presets cross the trusted match configuration boundary. Per-match
// values never mutate the global regulation constants or accept arbitrary code.
export const RULE_CHOICES = Object.freeze({
  gravity: {normal: 'STANDARD', low: 'LOW GRAVITY', heavy: 'HEAVY GRAVITY'},
  ball: {normal: 'STANDARD', small: 'SMALL', large: 'OVERSIZED'},
  boost: {normal: 'STANDARD', unlimited: 'UNLIMITED'},
  bounce: {normal: 'STANDARD', lively: 'LIVELY', soft: 'SOFT'},
  scoreLimit: {
    0: 'TIME LIMIT',
    1: 'FIRST TO 1',
    3: 'FIRST TO 3',
    5: 'FIRST TO 5',
    7: 'FIRST TO 7',
  },
});
export function matchRules(raw = {}) {
  raw ||= {};
  const clean = {};
  for (const key of ['gravity', 'ball', 'boost', 'bounce'])
    clean[key] = Object.hasOwn(RULE_CHOICES[key], raw[key])
      ? raw[key]
      : 'normal';
  clean.scoreLimit = [0, 1, 3, 5, 7].includes(Number(raw.scoreLimit))
    ? Number(raw.scoreLimit)
    : 0;
  return clean;
}
export function physicalRules(raw) {
  const r = matchRules(raw);
  return {
    gravity: C.gravity * ({low: 0.5, heavy: 1.5}[r.gravity] || 1),
    radius: C.ballRadius * ({small: 0.7, large: 1.5}[r.ball] || 1),
    restitution: {lively: 0.85, soft: 0.35}[r.bounce] ?? C.ballRestitution,
    unlimited: r.boost === 'unlimited',
    scoreLimit: r.scoreLimit,
  };
}
export const standardRules = (raw) => {
  const r = matchRules(raw);
  return (
    ['gravity', 'ball', 'boost', 'bounce'].every((k) => r[k] === 'normal') &&
    !r.scoreLimit
  );
};
export const botStyle = (style) =>
  ['balanced', 'attacker', 'keeper'].includes(style) ? style : 'balanced';
