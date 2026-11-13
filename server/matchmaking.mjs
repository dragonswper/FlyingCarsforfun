import {serverOptions, modePlayers} from '../dist/server-options.js';
import {networkPreferences} from '../dist/network-quality.js';
export const SEARCH_MS = 60000;
export class ServerMatchQueue {
  constructor({clock = () => performance.now(), onMatch = () => {}, maxQueued = 64} = {}) {
    Object.assign(this, {clock, onMatch, maxQueued});
    this.waiting = new Map();
  }
  add(socket, identity, packet) {
    if (this.waiting.size >= this.maxQueued)
      throw Error('The matchmaking queue is full. Try again later.');
    if ([...this.waiting.values()].some((item) => item.identity.id === identity.id))
      throw Error('This guest session is already searching.');
    const options = serverOptions({...packet.options, maxPeople: 8}),
      network = networkPreferences(packet.network),
      now = this.clock();
    const item = {
      socket,
      identity,
      packet,
      options,
      key: [options.mode, options.duration, options.difficulty, network.region].join(':'),
      at: now,
      deadline: now + SEARCH_MS,
      lastStatus: -Infinity
    };
    this.waiting.set(socket, item);
    this.pump();
  }
  remove(socket) {
    this.waiting.delete(socket);
  }
  pump() {
    const now = this.clock(),
      groups = new Map();
    for (const item of this.waiting.values()) {
      if (item.socket.readyState !== 1) {
        this.remove(item.socket);
        continue;
      }
      const group = groups.get(item.key) || [];
      group.push(item);
      groups.set(item.key, group);
    }
    for (const group of groups.values()) {
      const capacity = modePlayers(group[0].options.mode),
        practice = ['free', 'training', 'custom'].includes(group[0].options.mode);
      while (group.length && (practice || group.length >= capacity || group[0].deadline <= now)) {
        const players = group.splice(0, practice ? 1 : capacity),
          bots = !practice && players.length < capacity;
        for (const player of players) this.remove(player.socket);
        try {
          this.onMatch(players, players[0].options, bots);
        } catch {
          for (const player of players) {
            player.socket.send(
              JSON.stringify({
                t: 'server-error',
                message: 'This server has no free match slots. Try again shortly.'
              })
            );
            player.socket.close(1013);
          }
        }
      }
      for (const item of group)
        if (now - item.lastStatus >= 1000) {
          item.lastStatus = now;
          const remaining = Math.max(0, Math.ceil((item.deadline - now) / 1000));
          item.socket.send(
            JSON.stringify({
              t: 'server-queue',
              phase: 'searching',
              remaining,
              elapsed: (now - item.at) / 1000,
              mode: item.options.mode,
              players: group.length,
              needed: capacity
            })
          );
        }
    }
  }
}
