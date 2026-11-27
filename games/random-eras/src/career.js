const KEY = 'random-eras.career.v1';
const fields = ['matches', 'hits', 'kills', 'longestCombo'];
const eras = ['flintwake', 'sunscar', 'ironwood', 'redcanopy', 'frostfall', 'ashline', 'glassreach'];

export function readCareer(storage = globalThis.localStorage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(KEY)); } catch { /* Storage can be disabled. */ }
  const count = (value) => Number.isSafeInteger(value) && value > 0 ? value : 0;
  return {
    ...Object.fromEntries(fields.map((key) => [key, count(saved?.[key])])),
    visits: Object.fromEntries(eras.map((id) => [id, count(saved?.visits?.[id])])),
  };
}

export function recordCareer(stats, era, storage = globalThis.localStorage) {
  const career = readCareer(storage);
  career.matches++;
  career.hits += stats.hits;
  career.kills += stats.kills;
  career.longestCombo = Math.max(career.longestCombo, stats.longestCombo);
  if (Object.hasOwn(career.visits, era)) career.visits[era]++;
  try { storage.setItem(KEY, JSON.stringify(career)); } catch { /* This round still has a recap. */ }
  return career;
}
