import {networkPreferences} from '../../dist/network-quality.js';
import {randomUUID} from 'node:crypto';
import {NET_BUILD} from '../../dist/network-protocol.js';
import {serverOptions} from '../../dist/server-options.js';
export class SquadService {
  constructor(service) {
    this.service = service;
    this.groups = new Map();
  }
  create(entries, owner) {
    const group = {
      id: randomUUID(),
      owner: owner.member.authId,
      members: new Set(entries.map((e) => e.member.authId)),
    };
    this.groups.set(group.id, group);
    for (const e of entries) e.member.squadId = group.id;
    return group;
  }
  admit(room, entry) {
    if (room.matchmade) {
      if (!this.groups.has(entry.member.squadId)) this.create([entry], entry);
      return;
    }
    const entries = [...room.entries.values()],
      existing = entries
        .map((e) => this.groups.get(e.member.squadId))
        .find(Boolean);
    if (existing) {
      existing.members.add(entry.member.authId);
      entry.member.squadId = existing.id;
    } else this.create(entries, room.entries.get(room.ownerId) || entry);
  }
  info(room) {
    for (const e of room.entries.values()) {
      const group = this.groups.get(e.member.squadId);
      e.link?.send({
        t: 'party-squad',
        squad: group
          ? {
              id: group.id,
              owner: e.member.authId === group.owner,
              size: group.members.size,
            }
          : null,
      });
    }
  }
  removed(member, room) {
    const group = this.groups.get(member?.squadId);
    if (!group) return;
    group.members.delete(member.authId);
    if (group.owner === member.authId)
      group.owner = group.members.values().next().value;
    if (!group.members.size) this.groups.delete(group.id);
    this.service.queue.remove(
      room,
      'Party membership changed. Search again when everyone is ready.',
    );
    this.info(room);
  }
  detach(room, entry) {
    room.entries.delete(entry.id);
    room.members = room.members.filter((m) => m.id !== entry.id);
    room.matchOwners?.delete(entry.id);
    entry.link = null;
    if (room.ownerId === entry.id) room.ownerId = room.members[0]?.id ?? null;
    if (!room.members.length) room.onEmpty(room);
    else {
      room.sendLobby();
      for (const e of room.entries.values())
        e.link?.send({t: 'server-owner', ownerId: room.ownerId});
    }
  }
  transfer(players, room) {
    const service = this.service;
    for (const player of players) {
      const prior = service.bindings.get(player.socket),
        look = prior?.entry.member.look || player.packet.look,
        squadId = prior?.entry.member.squadId || player.squadId;
      if (prior) {
        this.detach(prior.room, prior.entry);
        service.bindings.delete(player.socket);
      }
      player.socket.send(
        JSON.stringify({t: 'server-transfer', build: NET_BUILD}),
      );
      const attached = room.attach(
        player.socket,
        {
          t: 'server-join',
          look,
          build: service.connections.get(player.socket)?.build || NET_BUILD,
        },
        player.identity,
      );
      attached.entry.member.squadId = squadId;
      attached.entry.member.team = Object.hasOwn(player, 'team')
        ? player.team
        : 0;
      attached.entry.member.ready = true;
      service.bindings.set(player.socket, {room, ...attached});
    }
    room.sendLobby();
    this.info(room);
  }
  returnAll(room) {
    const ids = [
      ...new Set([...room.entries.values()].map((e) => e.member.squadId)),
    ];
    for (const id of ids) {
      const group = this.groups.get(id),
        entry = [...room.entries.values()].find(
          (e) =>
            e.member.authId === group?.owner && e.link?.open && !e.recovering,
        );
      if (entry) this.returnParty(room, entry);
    }
  }
  returnParty(room, entry) {
    if (room.matchId && room.sim?.phase !== 'ended')
      throw Error('Finish this match before returning the party to its lobby.');
    let group = this.groups.get(entry.member.squadId);
    if (!group) group = this.create([entry], entry);
    if (group.owner !== entry.member.authId)
      throw Error(
        'Your party leader chooses the next match. Leave the party to search alone.',
      );
    const players = [...room.entries.values()]
      .filter(
        (e) => e.member.squadId === group.id && !e.recovering && e.link?.open,
      )
      .map((e) => ({
        socket: e.link.socket,
        identity: serviceIdentity(this.service, e.member.authId),
        packet: {look: e.member.look},
        team: e.member.team,
      }));
    if (!players.length) throw Error('The party is not connected.');
    players.sort(
      (a, b) =>
        Number(b.identity.id === group.owner) -
        Number(a.identity.id === group.owner),
    );
    const home = this.service.makeRoom(
      {
        mode: 'custom',
        maxPeople: 8,
        duration: room.options.duration,
        arena: room.options.arena,
      },
      false,
      true,
    );
    this.transfer(players, home);
    return home;
  }
  search(room, entry, packet) {
    if (room.matchmade) {
      room = this.returnParty(room, entry);
      entry = [...room.entries.values()].find(
        (e) => e.member.authId === entry.member.authId,
      );
    }
    if (entry.id !== room.ownerId)
      throw Error('Only the party leader can start a search.');
    if (room.pendingMatch || (room.matchId && room.sim?.phase !== 'ended'))
      throw Error('Finish this match before searching.');
    const entries = [...room.entries.values()];
    if (!entries.length || entries.length > 2)
      throw Error(
        'Queue with one or two drivers. Larger parties can start a private match.',
      );
    if (
      entries.some(
        (e) =>
          e.recovering ||
          !e.link?.open ||
          e.member.team === null ||
          !e.member.ready,
      )
    )
      throw Error(
        'Everyone must choose a team, connect and select Ready before searching.',
      );
    if (this.service.queue.waiting.has(room))
      throw Error('The party is already searching.');
    let group = this.groups.get(entry.member.squadId);
    if (!group || entries.some((e) => e.member.squadId !== group.id))
      group = this.create(entries, entry);
    const mode = ['doubles', 'hoops'].includes(packet.options?.mode)
        ? packet.options.mode
        : entries.length > 1
          ? 'doubles'
          : 'duel',
      options = serverOptions({...packet.options, mode, rules: undefined});
    const players = entries.map((e) => ({
      socket: e.link.socket,
      identity: serviceIdentity(this.service, e.member.authId),
      packet: {look: e.member.look},
      squadId: group.id,
    }));
    group.network = networkPreferences(packet.network || group.network);
    this.service.queue.addParty(room, players, {
      ...packet,
      options,
      network: group.network,
    });
    this.info(room);
  }
  single(player) {
    if (player.squadId) return;
    const id = randomUUID();
    this.groups.set(id, {
      id,
      owner: player.identity.id,
      members: new Set([player.identity.id]),
      network: networkPreferences(player.packet.network),
    });
    player.squadId = id;
  }
}
function serviceIdentity(service, id) {
  for (const connection of service.connections.values())
    if (connection.identity?.id === id) return connection.identity;
  throw Error('A party member must reconnect before searching.');
}
