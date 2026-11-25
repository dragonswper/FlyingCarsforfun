import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import {SocialService} from '../server/social/service.mjs';
import {ServerSession} from '../server/session.mjs';
async function party() {
  const rooms = new Map(),
    service = new SocialService({room: (code) => rooms.get(code)}),
    clients = [];
  for (const name of ['Host', 'Member', 'Invited Friend']) {
    const secret = randomBytes(32).toString('hex'),
      tab = randomUUID(),
      call = (op, body = {}) =>
        service.handle({op, name, tab, ...body}, secret);
    const id = (await call('sync')).data.self.id;
    clients.push({id, call});
  }
  const [host, member, friend] = clients;
  await member.call('request', {peer: friend.id});
  await friend.call('accept', {peer: member.id});
  const code = 'BCS-' + randomBytes(16).toString('base64url'),
    ownerProof = randomBytes(16).toString('hex'),
    memberProof = randomBytes(16).toString('hex');
  const room = {
    code,
    ownerId: 0,
    options: {maxPeople: 8, mode: 'custom', arena: 'coast'},
    members: [{}, {}],
    entries: new Map([
      [
        0,
        {
          member: {
            id: 0,
            authId: randomUUID(),
            token: ownerProof,
            connected: true,
          },
        },
      ],
      [
        1,
        {
          member: {
            id: 1,
            authId: randomUUID(),
            token: memberProof,
            connected: true,
          },
        },
      ],
    ]),
  };
  rooms.set(code, room);
  assert.equal(
    (
      await host.call('publish', {
        code,
        proof: ownerProof,
        visibility: 'private',
      })
    ).status,
    200,
  );
  return {host, member, friend, code, memberProof, room};
}
test('a connected member can invite a mutual friend to the existing lobby without sharing its private capability in listings', async () => {
  const {host, member, friend, code, memberProof} = await party();
  assert.equal((await friend.call('join', {lobby: host.id})).status, 403);
  assert.equal(
    (await member.call('invite', {peer: friend.id, code, proof: 'guessed'}))
      .status,
    403,
  );
  assert.equal(
    (await member.call('invite', {peer: friend.id, code, proof: memberProof}))
      .status,
    200,
  );
  const state = (await friend.call('sync')).data;
  assert.equal(state.invites.length, 1);
  assert.equal(state.invites[0].from.id, member.id);
  assert.equal(state.invites[0].lobby.id, host.id);
  assert.ok(!JSON.stringify(state).includes(memberProof));
  assert.ok(!JSON.stringify(state).includes(code));
  assert.equal((await friend.call('join', {lobby: host.id})).data.code, code);
});
test('member departure, friendship removal and host blocking revoke guest-created invitations', async () => {
  for (const reason of ['leave', 'remove', 'block', 'block-sender']) {
    const {host, member, friend, code, memberProof, room} = await party();
    await member.call('invite', {peer: friend.id, code, proof: memberProof});
    if (reason === 'leave') room.entries.delete(1);
    else if (reason === 'remove')
      await member.call('remove', {peer: friend.id});
    else
      await host.call('block', {
        peer: reason === 'block-sender' ? member.id : friend.id,
      });
    assert.equal(
      (await friend.call('join', {lobby: host.id})).status,
      403,
      reason,
    );
    assert.equal((await friend.call('sync')).data.invites.length, 0, reason);
  }
});
test('appearance changes are sanitized, broadcast in the lobby and ignored during an active match', (t) => {
  const packets = [],
    room = new ServerSession({
      code: 'appearance',
      options: {mode: 'custom', maxPeople: 4},
      setTimer: () => ({unref() {}}),
      clearTimer() {},
    });
  t.after(() => room.close(false));
  const {entry} = room.attach(
    {
      readyState: 1,
      bufferedAmount: 0,
      send: (raw) => packets.push(JSON.parse(raw)),
      close() {},
    },
    {look: {body: 'striker', name: 'Driver'}},
    {id: 'test'},
  );
  room.receiveClient(entry, {
    t: 'party-appearance',
    look: {body: 'rally', paint: 'mint', name: 'Updated'},
  });
  assert.equal(entry.member.look.body, 'rally');
  assert.equal(packets.at(-1).roster[0].look.paint, 'mint');
  room.receiveClient(entry, {
    t: 'party-appearance',
    look: {body: 'https://outside.invalid/model.glb'},
  });
  assert.equal(entry.member.look.body, 'fennec');
  room.matchId = 'active';
  room.sim = {phase: 'playing'};
  room.receiveClient(entry, {t: 'party-appearance', look: {body: 'striker'}});
  assert.equal(entry.member.look.body, 'fennec');
});
