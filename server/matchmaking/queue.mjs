import {serverOptions, modePlayers} from '../../dist/server-options.js';
import {networkPreferences} from '../../dist/network-quality.js';
export const SEARCH_MS = 60000;
// Pack whole parties into teams. A party is never split to fill the last slot.
export function packTeams(items, capacity) {
  const perTeam = capacity / 2,
    teams = [[], []],
    selected = [];
  for (const item of items) {
    const count = item.players.length;
    let team = teams[0].length <= teams[1].length ? 0 : 1;
    if (teams[team].length + count > perTeam) team = 1 - team;
    if (count > perTeam || teams[team].length + count > perTeam) continue;
    selected.push(item);
    for (const p of item.players) teams[team].push({...p, team});
    if (teams[0].length + teams[1].length === capacity) break;
  }
  return {items: selected, players: teams.flat()};
}
export class ServerMatchQueue {
  constructor({
    clock = () => performance.now(),
    onMatch = () => {},
    maxQueued = 64,
  } = {}) {
    Object.assign(this, {clock, onMatch, maxQueued});
    this.waiting = new Map();
  }
  add(socket, identity, packet) {
    this.addGroup(socket, [{socket, identity, packet}], packet);
  }
  addParty(room, players, packet) {
    this.addGroup(room, players, packet, true);
  }
  addGroup(key, players, packet, party = false) {
    const queued = [...this.waiting.values()].flatMap((i) => i.players);
    if (queued.length + players.length > this.maxQueued)
      throw Error('The matchmaking queue is full. Try again later.');
    if (
      players.some((p) => queued.some((q) => q.identity.id === p.identity.id))
    )
      throw Error('This guest session is already searching.');
    const options = serverOptions({
        ...packet.options,
        maxPeople: 8,
        randomArena: true,
        rules: undefined,
      }),
      network = networkPreferences(packet.network),
      now = this.clock();
    if (
      party &&
      (players.length > 2 ||
        !['duel', 'doubles', 'hoops'].includes(options.mode) ||
        players.length > modePlayers(options.mode) / 2)
    )
      throw Error(
        'Parties can queue with up to two drivers on one team. Use a private match for larger groups.',
      );
    this.waiting.set(key, {
      socket: key,
      identity: players[0].identity,
      packet,
      players,
      options,
      party,
      key: [
        options.mode,
        options.duration,
        options.difficulty,
        network.region,
      ].join(':'),
      at: now,
      deadline: now + SEARCH_MS,
      lastStatus: -Infinity,
    });
    this.pump();
  }
  remove(key, reason = 'Search cancelled.') {
    for (const [id, item] of this.waiting)
      if (id === key || item.players.some((p) => p.socket === key)) {
        this.waiting.delete(id);
        if (item.party)
          for (const p of item.players)
            if (p.socket.readyState === 1)
              p.socket.send(
                JSON.stringify({
                  t: 'party-queue',
                  phase: 'cancelled',
                  reason,
                  remaining: 0,
                }),
              );
      }
  }
  status(item, packet) {
    for (const p of item.players)
      if (p.socket.readyState === 1)
        p.socket.send(
          JSON.stringify({
            ...packet,
            t: item.party ? 'party-queue' : 'server-queue',
          }),
        );
  }
  pump() {
    const now = this.clock(),
      groups = new Map();
    for (const [id, item] of this.waiting) {
      if (item.players.some((p) => p.socket.readyState !== 1)) {
        this.remove(
          id,
          'A party member disconnected. Search again once everyone is back.',
        );
        continue;
      }
      const group = groups.get(item.key) || [];
      group.push(item);
      groups.set(item.key, group);
    }
    for (const group of groups.values()) {
      const capacity = modePlayers(group[0].options.mode),
        practice = ['free', 'training', 'custom'].includes(
          group[0].options.mode,
        );
      let blocked = false;
      while (group.length) {
        const packed = practice
            ? {
                items: [group[0]],
                players: group[0].players.map((p) => ({...p, team: group[0].options.mode === 'custom' ? null : 0})),
              }
            : packTeams(group, capacity),
          full = packed.players.length >= capacity,
          expired = group[0].deadline <= now;
        if (!practice && !full && !expired) break;
        if (!packed.items.length) break;
        const bots = !practice && !full;
        try {
          if (
            this.onMatch(packed.players, packed.items[0].options, bots) ===
            false
          ) {
            blocked = true;
            break;
          }
        } catch {
          for (const item of packed.items) {
            this.status(item, {
              t: 'server-error',
              phase: 'error',
              reason: 'The match could not start. Please search again.',
            });
            for (const p of item.players) if (!item.party) p.socket.close(1013);
          }
        }
        for (const item of packed.items) {
          this.waiting.delete(item.socket);
          group.splice(group.indexOf(item), 1);
        }
      }
      for (const item of group)
        if (now - item.lastStatus >= 1000) {
          item.lastStatus = now;
          this.status(item, {
            phase: 'searching',
            remaining: Math.max(0, Math.ceil((item.deadline - now) / 1000)),
            elapsed: (now - item.at) / 1000,
            mode: item.options.mode,
            players: group.reduce((n, g) => n + g.players.length, 0),
            needed: capacity,
            reason: blocked
              ? 'The free arena is in use. Your party keeps its place in the queue.'
              : 'Searching for opponents. Your party stays together.',
          });
        }
    }
  }
}
