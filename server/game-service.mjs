import {randomArena} from '../dist/arenas.js';
import {randomBytes} from 'node:crypto';
import {NET_BUILD, decodePacket} from '../dist/network-protocol.js';
import {C} from '../dist/physics.js';
import {GuestAuth} from './auth.mjs';
import {ServerSession} from './session.mjs';
import {ServerMatchQueue} from './matchmaking.mjs';

// Transport-independent authority. Node and Cloudflare use the exact same room,
// input, authentication, matchmaking and recovery implementation.
export class GameService {
  constructor({
    maxRooms = 8,
    region = 'oceania',
    queueClock,
    clock = () => performance.now(),
    autostart = true,
    arenaRandom = Math.random,
    setIntervalFn = (callback,ms) => setInterval(callback,ms),
    clearIntervalFn = timer => clearInterval(timer)
  } = {}) {
    Object.assign(this, {maxRooms, region, clock, autostart, setIntervalFn, clearIntervalFn});
    this.rooms = new Map();
    this.bindings = new Map();
    this.sockets = new Set();
    this.connections = new Map();
    this.auth = new GuestAuth();
    this.closed = false;
    this.timer = null;
    this.physicsRooms = [];
    this.arenaRandom = arenaRandom;
    this.queue = new ServerMatchQueue({
      clock: queueClock,
      onMatch: (players, options, bots) => this.matched(players, options, bots)
    });
  }
  makeRoom(options, matchmade = false) {
    if (this.rooms.size >= this.maxRooms) throw Error('This server has no free rooms.');
    const code = 'BCS-' + randomBytes(16).toString('base64url');
    const room = new ServerSession({
      code,
      options,
      matchmade,
      chooseArena: previous => {
        const arena=randomArena(previous||this.lastOnlineArena,this.arenaRandom);
        this.lastOnlineArena=arena;
        return arena;
      },
      onEmpty: (session) => {
        this.rooms.delete(session.code);
        session.close(false);
        this.stopIfIdle();
      }
    });
    this.rooms.set(code, room);
    return room;
  }
  matched(players, options, bots) {
    const room = this.makeRoom(options, options.mode !== 'custom');
    for (const [index, player] of players.entries()) {
      player.socket.send(
        JSON.stringify({
          t: 'server-queue',
          phase: 'preparing',
          remaining: 0,
          reason: bots
            ? 'Search finished after 60 seconds. Empty driving slots will use bots.'
            : 'Players found. Preparing a random arena…'
        })
      );
      const attached = room.attach(player.socket, player.packet, player.identity);
      this.bindings.set(player.socket, {room, ...attached});
      const perTeam = options.mode === 'doubles' ? 2 : 1;
      attached.entry.member.team =
        options.mode === 'custom'
          ? null
          : ['free', 'training'].includes(options.mode)
            ? 0
            : index < perTeam
              ? 0
              : 1;
      attached.entry.member.ready = true;
    }
    room.sendLobby();
    if (options.mode !== 'custom') room.startMatch();
  }
  reject(socket, message) {
    if (socket.readyState === 1) socket.send(JSON.stringify({t: 'server-error', message}));
    socket.close(1008);
  }
  accept(socket, origin = '') {
    if (this.closed || this.sockets.size >= 128) {
      this.reject(socket, 'The server is full. Try again later.');
      return false;
    }
    const connection = {
      origin,
      identity: null,
      messages: 0,
      bucket: this.clock(),
      handshake: setTimeout(() => this.reject(socket, 'Authenticate within ten seconds.'), 10000)
    };
    connection.handshake.unref?.();
    this.sockets.add(socket);
    this.connections.set(socket, connection);
    socket.addEventListener('message', (event) => this.receive(socket, event.data));
    socket.addEventListener('error', () => {});
    socket.addEventListener('close', () => this.disconnect(socket));
    if (this.autostart) this.start();
    return true;
  }
  receive(socket, raw) {
    const connection = this.connections.get(socket);
    if (!connection || this.closed) return;
    if (typeof raw !== 'string') {
      this.reject(socket, 'Use JSON text packets.');
      return;
    }
    const packet = decodePacket(raw);
    if (!packet) {
      this.reject(socket, 'Invalid game packet.');
      return;
    }
    const now = this.clock();
    if (now - connection.bucket > 1000) {
      connection.bucket = now;
      connection.messages = 0;
    }
    if (++connection.messages > 240) {
      this.reject(socket, 'Too many game packets.');
      return;
    }
    const current = this.bindings.get(socket);
    if (current) {
      try {
        current.room.receiveClient(current.entry, packet);
      } catch {
        this.reject(socket, 'The game packet could not be applied.');
      }
      if (packet.t !== 'input') this.updateCadence();
      return;
    }
    if (!connection.identity) {
      if (packet.build !== NET_BUILD) {
        this.reject(socket, 'Game versions differ. Reload all clients.');
        return;
      }
      const identity =
        packet.t === 'server-auth' && this.auth.consume(packet.ticket, connection.origin);
      if (!identity) {
        this.reject(socket, 'A fresh authenticated guest ticket is required.');
        return;
      }
      connection.identity = identity;
      clearTimeout(connection.handshake);
      connection.handshake = null;
      connection.joinTimer = setTimeout(() => {
        if (!this.bindings.has(socket) && !this.queue.waiting.has(socket))
          this.reject(socket, 'Choose a lobby or search for a match.');
      }, 15000);
      connection.joinTimer.unref?.();
      socket.send(
        JSON.stringify({t: 'server-authenticated', build: NET_BUILD, region: this.region})
      );
      return;
    }
    if (packet.t === 'server-measure' && Number.isSafeInteger(packet.id)) {
      socket.send(JSON.stringify({t: 'server-measured', id: packet.id}));
      return;
    }
    if (packet.t === 'server-cancel') {
      this.queue.remove(socket);
      socket.close();
      return;
    }
    if (
      !['server-create', 'server-join', 'server-resume', 'server-queue'].includes(packet.t) ||
      packet.build !== NET_BUILD
    ) {
      this.reject(socket, 'Invalid room request or game version.');
      return;
    }
    if (this.queue.waiting.has(socket)) {
      this.reject(socket, 'This connection is already searching.');
      return;
    }
    try {
      const identity = connection.identity;
      if (
        [...this.bindings.values()].some(
          (value) =>
            value.entry.member.authId === identity.id && value.link.open && !value.link.closed
        )
      )
        throw Error('This guest session is already in a room.');
      if (packet.t === 'server-queue') {
        this.queue.add(socket, identity, packet);
        return;
      }
      const room =
        packet.t === 'server-create' ? this.makeRoom(packet.options) : this.rooms.get(packet.code);
      if (!room)
        throw Error('That lobby does not exist on this server. Check the URL and BCS invite.');
      const attached = room.attach(socket, packet, identity);
      this.bindings.set(socket, {room, ...attached});
    } catch (error) {
      this.reject(socket, error.message || 'The room could not be joined.');
    }
  }
  disconnect(socket) {
    const connection = this.connections.get(socket);
    if (!connection) return;
    clearTimeout(connection.handshake);
    clearTimeout(connection.joinTimer);
    this.connections.delete(socket);
    this.sockets.delete(socket);
    this.queue.remove(socket);
    const current = this.bindings.get(socket);
    this.bindings.delete(socket);
    if (current && current.entry.link === current.link) current.room.lostPeer(current.entry);
    this.stopIfIdle();
    this.updateCadence();
  }
  start() {
    if (this.timer || this.closed) return;
    this.last = this.clock();
    this.accumulator = 0;
    this.lastQueue = -Infinity;
    this.updateCadence(true);
  }
  simulating(room) {
    return room.active && !room.closed && !room.recovering && !room.hostPaused &&
      !room.pendingMatch && room.sim?.phase !== 'ended';
  }
  updateCadence(start = false) {
    if (!this.autostart || this.closed || (!start && !this.timer)) return;
    let running = false;
    for (const room of this.rooms.values()) {
      if (this.simulating(room)) { running = true; break; }
    }
    const interval = running ? 1000 / 120 : 100;
    if (this.timer && this.tickInterval === interval) return;
    this.clearIntervalFn(this.timer);
    // A newly started match must not catch up time spent waiting in its lobby.
    this.last = this.clock();
    this.accumulator = 0;
    this.tickInterval = interval;
    this.timer = this.setIntervalFn(() => this.pump(), interval);
    this.timer.unref?.();
  }
  pump() {
    if (this.closed) return;
    const now = this.clock();
    this.accumulator = Math.min(
      0.15,
      (this.accumulator || 0) + Math.max(0, (now - (this.last ?? now)) / 1000)
    );
    this.last = now;
    this.physicsRooms.length = 0;
    for (const room of this.rooms.values()) {
      if (this.simulating(room)) this.physicsRooms.push(room);
    }
    if (!this.physicsRooms.length) this.accumulator = 0;
    let steps = 0;
    while (this.accumulator >= C.step && steps++ < 18) {
      for (const room of this.physicsRooms) room.pump(C.step,true);
      this.accumulator -= C.step;
    }
    // Catch up fixed physics first, then send the freshest world once. Sending
    // during the first catch-up step added avoidable snapshot age after a hitch.
    if(steps)for(const room of this.physicsRooms)room.publish?.();
    if (now - (this.lastQueue ?? -Infinity) >= 100) {
      this.lastQueue = now;
      this.queue.pump();
    }
    if (now - (this.lastMaintenance ?? -Infinity) >= 1000) {
      this.lastMaintenance = now;
      this.auth.prune();
    }
    this.updateCadence();
  }
  stopIfIdle() {
    if (this.sockets.size || this.rooms.size || this.queue.waiting.size) return;
    this.clearIntervalFn(this.timer);
    this.timer = null;
    this.physicsRooms.length = 0;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.clearIntervalFn(this.timer);
    this.timer = null;
    for (const socket of this.sockets)
      if (socket.readyState === 1)
        socket.send(
          JSON.stringify({
            t: 'server-error',
            message: 'The server is restarting. Please find a new match shortly.'
          })
        );
    for (const room of this.rooms.values()) room.close(false);
    this.rooms.clear();
    this.queue.waiting.clear();
    for (const [socket, connection] of this.connections) {
      clearTimeout(connection.handshake);
      clearTimeout(connection.joinTimer);
      if (socket.terminate) socket.terminate();
      else socket.close();
    }
    this.sockets.clear();
    this.connections.clear();
    this.bindings.clear();
    this.physicsRooms.length = 0;
  }
}
