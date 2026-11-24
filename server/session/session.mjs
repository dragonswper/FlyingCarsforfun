import {SocketLink} from '../transport/socket-link.mjs';
import {randomBytes} from 'node:crypto';
import {randomArena} from '../../dist/arenas.js';
import {PartyRoom} from '../../dist/party-room.js';
import {partySecret} from '../../dist/party-transport.js';
import {NET_BUILD, appearance} from '../../dist/network-protocol.js';
import {ConnectionQuality} from '../../dist/network-quality.js';
import {
  serverOptions,
  serverPlayers,
  modePlayers,
} from '../../dist/server-options.js';
import {ServerInputs} from '../input/player-inputs.mjs';
import {C} from '../../dist/physics.js';
import {makeState} from '../../dist/network-state.js';
import {encodeSnapshotWorld} from '../../dist/snapshot-wire.js';

export class ServerSession extends PartyRoom {
  constructor({
    code,
    options,
    matchmade = false,
    onEmpty = () => {},
    chooseArena = randomArena,
    ...callbacks
  } = {}) {
    super(callbacks);
    this.role = 'host';
    this.id = -1;
    this.key = partySecret();
    this.code = code;
    this.options = serverOptions(options);
    this.matchmade = matchmade;
    this.look = appearance({name: 'Dedicated Server'});
    this.signaler = {id: 'dedicated', close() {}};
    this.status = 'lobby';
    this.ownerId = null;
    this.onEmpty = onEmpty;
    this.chooseArena = chooseArena;
    this.beat();
  }
  normalizeOptions(value) {
    return serverOptions(value);
  }
  attach(socket, packet, identity) {
    let entry = [...this.entries.values()].find(
      (item) => item.member.authId === identity.id,
    );
    if (packet.t === 'server-resume' && !entry)
      throw Error(
        'This player’s recovery slot has expired. Join again with the invite.',
      );
    if (entry?.link?.open && !entry.link.closed)
      throw Error('That player is already connected.');
    if (!entry) {
      if (this.members.length >= this.options.maxPeople)
        throw Error('This lobby is full.');
      const used = new Set(this.members.map((member) => member.id)),
        id = Array.from({length: 8}, (_, n) => n).find((n) => !used.has(n)),
        member = {
          id,
          authId: identity.id,
          token: randomBytes(16).toString('hex'),
          look: appearance(packet.look),
          team: null,
          ready: true,
          connected: true,
        };
      entry = {
        id,
        member,
        remote: new ServerInputs(),
        quality: new ConnectionQuality(),
        lastReceive: this.clock(),
        lastRealtimeAt: this.clock(),
        pings: new Map(),
        chatAt: -Infinity,
      };
      this.members.push(member);
      this.entries.set(id, entry);
      if (this.ownerId === null) this.ownerId = id;
    }
    const resuming =
        !!entry.recovering && !!this.matchId && packet.matchId === this.matchId,
      link = new SocketLink(socket);
    entry.link = link;
    entry.lastReceive = entry.lastRealtimeAt = this.clock();
    entry.remote = new ServerInputs();
    entry.member.connected = !resuming;
    entry.recovering = resuming;
    entry.resumeSent = resuming;
    link.send({
      t: 'server-welcome',
      build: NET_BUILD,
      key: this.key,
      code: this.code,
      selfId: entry.id,
      ownerId: this.ownerId,
      token: entry.member.token,
      matchId: this.matchId || null,
      matchmade: this.matchmade,
    });
    if (resuming)
      link.send({
        ...this.config(entry, true),
        t: 'party-resume-state',
        key: this.key,
        token: entry.member.token,
      });
    else {
      entry.member.connected = true;
      entry.recovering = false;
      this.sendLobby();
      if (this.matchId) this.sendConfig(entry, true);
    }
    this.recovering =
      !!this.matchId &&
      [...this.entries.values()].every((item) => item.recovering);
    return {entry, link};
  }
  chooseFor(member, team) {
    if (this.matchmade && this.matchId && this.sim?.phase !== 'ended')
      return false;
    const capacity = modePlayers(this.options.mode),
      perTeam = capacity === 1 ? 1 : capacity / 2;
    if (team !== null && team !== undefined && this.options.mode !== 'custom') {
      if (capacity === 1) team = 0;
      if (
        this.members.filter(
          (other) => other.id !== member.id && other.team !== null,
        ).length >= capacity ||
        this.members.filter(
          (other) => other.id !== member.id && other.team === team,
        ).length >= perTeam
      ) {
        this.notice = 'That mode’s driving slots are full. You can spectate.';
        this.sendLobby();
        return false;
      }
    }
    return super.chooseFor(member, team);
  }
  configure(options) {
    if (
      this.pendingMatch ||
      (this.matchId && this.sim?.phase !== 'ended') ||
      this.matchmade
    )
      return false;
    const next = serverOptions({
      ...options,
      ...(this.options.randomArena ? {randomArena: true} : {}),
    });
    if (
      this.members.filter((member) => member.team !== null).length >
      modePlayers(next.mode)
    ) {
      this.notice =
        'Select Spectate before switching to a mode with fewer driving slots.';
      this.sendLobby();
      return false;
    }
    const modeChanged = this.options.mode !== next.mode;
    this.options = next;
    this.options.maxPeople = Math.max(
      this.options.maxPeople,
      this.members.length,
    );
    for (const member of this.members) {
      if (modeChanged) {
        member.team = null;
        member.ready = true;
      }
      // New host settings require fresh rematch consent, while an arena or
      // duration change alone should preserve everyone's chosen team.
      member.rematch = false;
    }
    this.sendLobby();
    return true;
  }
  selectMatchArena() {
    if (this.options.randomArena)
      this.options = {
        ...this.options,
        arena: this.chooseArena(this.sim?.options.arena),
      };
  }
  makeSimulation(id, players) {
    super.makeSimulation(id, serverPlayers(this.options, players));
    // Clients build their visible replay from received states. The headless
    // authority never consumes its own camera replay or needs those copies.
    this.sim.recordReplay = false;
    for (const entry of this.entries.values())
      entry.remote = new ServerInputs();
  }
  stateFor(entry, world = null) {
    return {
      ...super.stateFor(entry, world),
      net: {
        inputQueueMs: Math.round(entry.remote.queue.length * C.step * 1000),
        inputTick: entry.remote.inputTick ?? entry.remote.ack,
      },
    };
  }
  config(entry, join = false) {
    return {...super.config(entry, join), matchmade: this.matchmade};
  }
  receiveClient(entry, packet) {
    if (packet.t === 'server-configure' || packet.t === 'server-start') {
      if (entry.id !== this.ownerId || this.matchmade) {
        entry.link?.send({
          t: 'party-notice',
          message: 'Only the lobby owner can change settings or start.',
        });
        return;
      }
      if (packet.t === 'server-configure') this.configure(packet.options);
      else this.startMatch();
      return;
    }
    if (
      packet.t === 'practice' &&
      packet.matchId === this.matchId &&
      this.active &&
      this.matchOwners?.get(entry.id) === entry.member.token &&
      this.sim.cars[0]?.id === entry.id
    ) {
      if (packet.action === 'reset') this.sim.resetPractice();
      else if (packet.action === 'next') this.sim.nextDrill();
      this.publish(true);
      return;
    }
    // Position, velocity, score and time fields from clients are never applied.
    this.receiveHost(entry, packet);
  }
  lostPeer(entry) {
    if (this.closed || this.entries.get(entry.id) !== entry || entry.recovering)
      return;
    entry.recovering = true;
    entry.resumeSent = false;
    entry.deadline = this.clock() + 20000;
    entry.member.connected = false;
    entry.remote = new ServerInputs();
    const old = entry.link;
    entry.link = null;
    old?.close();
    this.recovering =
      !!this.matchId &&
      [...this.entries.values()].every((item) => item.recovering);
    if (this.recovering) this.recoveryDeadline = entry.deadline;
    this.sendLobby();
  }
  recoverLink() {} // Browsers reconnect to the same public server, not a peer queue.
  retryRecovery(entry) {
    const old = entry.link;
    entry.link = null;
    entry.resumeSent = false;
    old?.close();
  }
  remove(id, reason) {
    if (!this.entries.has(id)) return;
    super.remove(id, reason);
    if (this.ownerId === id) {
      this.ownerId =
        this.members.find((member) => member.connected)?.id ??
        this.members[0]?.id ??
        null;
      this.broadcast({t: 'server-owner', ownerId: this.ownerId});
    }
    if (!this.entries.size) this.onEmpty(this);
  }
  publish(force = false) {
    const now = this.clock();
    if (
      !this.active ||
      (!force &&
        (this.hostPaused ||
          this.sim.phase === 'ended' ||
          now - this.lastPublish < 1000 / 30))
    )
      return;
    this.lastPublish = now;
    let world, encoded;
    for (const entry of this.entries.values())
      if (entry.link?.open && !entry.recovering) {
        world ??= makeState(this.sim, 0, 0, this.matchId);
        encoded ??= encodeSnapshotWorld(world);
        entry.link.sendSnapshot(encoded, this.stateFor(entry, world));
      }
  }
  pump(dt, deferPublish = false) {
    if (!this.matchId || this.pendingMatch || this.recovering || this.closed)
      return;
    this.hostStep({}, dt);
    const events = this.sim.events.splice(0);
    if (events.length) this.events(events);
    if (!deferPublish) this.publish();
  }
}
