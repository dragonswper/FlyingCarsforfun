// This contract is shared by the headless server and the browser. Private
// rooms may contain spectators; competitive/practice modes cap active drivers.
export const SERVER_MODES = Object.freeze(['duel', 'doubles', 'free', 'training', 'custom']);
export const modePlayers = (mode) =>
  ({duel: 2, doubles: 4, free: 1, training: 1, custom: 8})[mode] || 2;
export function serverOptions(value = {}) {
  value ||= {};
  const mode = SERVER_MODES.includes(value.mode) ? value.mode : 'custom';
  return {
    dedicated: true,
    mode,
    duration: Math.max(60, Math.min(1800, Math.round(Number(value.duration) || 300))),
    maxPeople: Math.max(2, Math.min(8, Math.round(Number(value.maxPeople) || 4))),
    difficulty: ['rookie', 'pro', 'allstar', 'expert'].includes(value.difficulty)
      ? value.difficulty
      : 'pro'
  };
}
export function serverPlayers(options, humans) {
  const players = humans.map((player) => ({...player, bot: false}));
  if (!['duel', 'doubles'].includes(options.mode)) return players;
  const perTeam = modePlayers(options.mode) / 2,
    used = new Set(players.map((player) => player.id));
  for (const team of [0, 1])
    for (let n = players.filter((player) => player.team === team).length; n < perTeam; n++) {
      const id = Array.from({length: 8}, (_, i) => i).find((id) => !used.has(id));
      used.add(id);
      players.push({
        id,
        team,
        bot: true,
        look: {body: 'fennec', paint: 'blue', name: 'Circuit Bot ' + (id + 1)}
      });
    }
  return players.sort((a, b) => a.id - b.id);
}
