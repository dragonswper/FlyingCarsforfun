import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createGameServer} from '../server/index.mjs';
import {GuestAuth} from '../server/auth.mjs';
import {ServerInputs} from '../server/inputs.mjs';
import {GuestReplica, makeState, applyCar} from '../dist/network-state.js';
import {Simulation, C} from '../dist/physics.js';
import {DedicatedRoom} from '../dist/dedicated-room.js';
import {NET_BUILD} from '../dist/network-protocol.js';
import {
  tls,
  TrustedLink as Link,
  TrustedSocket,
  secureFetch,
  credentials
} from './helpers/secure-server.mjs';
const until = async (check, label) => {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > 6000) throw Error('Timed out: ' + label);
    await delay(10);
  }
};
async function harness(t) {
  let clock = 0;
  const app = createGameServer({tls, queueClock: () => clock}),
    address = await app.listen(0),
    url = 'wss://127.0.0.1:' + address.port + '/multiplayer',
    clients = [];
  t.after(async () => {
    for (const client of clients) client.close();
    await app.close();
  });
  return {
    app,
    url,
    advance(ms) {
      clock += ms;
      app.queue.pump();
    },
    client(name, auth = credentials(url), options = {}) {
      const client = new DedicatedRoom({...options, address: url, Link, credentials: auth});
      client.testLook = {name};
      clients.push(client);
      return client;
    }
  };
}

test('guest credentials expire, tickets are one-use and origin-bound, and authentication is bounded', () => {
  let now = 0;
  const auth = new GuestAuth({clock: () => now, maxSessions: 2}),
    session = auth.issue(),
    ticket = auth.ticket(session.token, 'https://game.example');
  assert.equal(auth.consume(ticket.ticket, 'https://other.example'), null);
  assert.equal(auth.consume(ticket.ticket, 'https://game.example'), null);
  const good = auth.ticket(session.token, 'https://game.example');
  assert.ok(auth.consume(good.ticket, 'https://game.example').id);
  assert.equal(auth.consume(good.ticket, 'https://game.example'), null);
  const expired = auth.ticket(session.token, '');
  now = 30001;
  assert.equal(auth.consume(expired.ticket, ''), null);
  auth.issue();
  assert.throws(() => auth.issue(), /full/);
  now = 4 * 60 * 60 * 1000 + 30002;
  assert.equal(auth.ticket(session.token, ''), null);
  for (let n = 0; n < 60; n++) assert.equal(auth.permit('test'), true);
  assert.equal(auth.permit('test'), false);
});
test('plaintext startup is disabled and TLS certificate validation remains enabled', async (t) => {
  assert.throws(() => createGameServer(), /TLS is required/);
  assert.throws(() => createGameServer({tlsProxy: true}), /HTTPS PUBLIC_ORIGIN/);
  const h = await harness(t);
  const untrusted = new (await import('ws')).default(h.url);
  t.after(() => untrusted.terminate());
  await new Promise((resolve) =>
    untrusted.on('error', (error) => {
      assert.match(error.code, /SELF_SIGNED|UNABLE_TO_VERIFY/);
      resolve();
    })
  );
});
test('fresh tickets are required before any lobby request and cannot be replayed', async (t) => {
  const h = await harness(t),
    base = h.url.replace('wss:', 'https:').replace('/multiplayer', ''),
    session = await (await secureFetch(base + '/api/session', {method: 'POST'})).json(),
    ticket = await (
      await secureFetch(base + '/api/ticket', {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + session.token}
      })
    ).json();
  async function exchange(packet) {
    const socket = new TrustedSocket(h.url);
    t.after(() => socket.terminate());
    await new Promise((resolve) => socket.once('open', resolve));
    const reply = new Promise((resolve) =>
      socket.once('message', (data) => resolve(JSON.parse(String(data))))
    );
    socket.send(JSON.stringify(packet));
    return {socket, packet: await reply};
  }
  const first = await exchange({t: 'server-auth', ticket: ticket.ticket, build: NET_BUILD});
  assert.equal(first.packet.t, 'server-authenticated');
  const replay = await exchange({t: 'server-auth', ticket: ticket.ticket, build: NET_BUILD});
  assert.match(replay.packet.message, /fresh authenticated/);
  const noAuth = await exchange({t: 'server-create', build: NET_BUILD, token: 'a'.repeat(32)});
  assert.equal(noAuth.packet.t, 'server-error');
  assert.equal(h.app.rooms.size, 0);
});
test('only the authenticated guest can resume its seat, even with the old room token', async (t) => {
  const h = await harness(t),
    owner = h.client('Owner');
  owner.create({mode: 'custom'}, owner.testLook);
  await until(() => owner.admitted, 'owner');
  const attacker = h.client('Different session');
  attacker.code = owner.code;
  attacker.token = owner.token;
  attacker.look = attacker.testLook;
  attacker.startConnection({t: 'server-resume', code: owner.code});
  await until(() => attacker.closed, 'rejected');
  assert.match(attacker.error, /recovery slot/);
  assert.equal(h.app.rooms.get(owner.code).members.length, 1);
});
for (const mode of ['duel', 'doubles', 'free', 'training', 'custom'])
  test(
    'secure private sessions support ' +
      mode +
      ' with authoritative practice controls and spectators',
    async (t) => {
      const h = await harness(t),
        owner = h.client('Owner');
      owner.create({mode, maxPeople: 4}, owner.testLook);
      await until(() => owner.admitted, 'owner');
      owner.chooseTeam(0);
      owner.setReady(true);
      await until(() => owner.self.team === 0 && owner.self.ready, 'ready');
      owner.startMatch();
      await until(() => owner.active, 'active');
      const session = h.app.rooms.get(owner.code);
      assert.equal(owner.sim.options.mode, mode);
      assert.equal(session.sim.options.mode, mode);
      assert.equal(session.sim.localPlayerId, null);
      assert.equal(session.sim.cars.length, mode === 'doubles' ? 4 : mode === 'duel' ? 2 : 1);
      const spectator = h.client('Spectator');
      spectator.join(owner.invite, spectator.testLook);
      await until(() => spectator.active, 'spectator');
      assert.equal(spectator.sim.localPlayerId, null);
      assert.equal(spectator.sim.options.mode, mode);
      assert.equal(
        session.sim.cars.filter((car) => car.bot).length,
        mode === 'doubles' ? 3 : mode === 'duel' ? 1 : 0
      );
      if (['free', 'training'].includes(mode)) {
        const before = session.sim.cars[0].p.clone();
        session.sim.cars[0].p.x = 20;
        owner.practice('reset');
        await until(() => session.sim.cars[0].p.x !== 20, 'reset');
        assert.ok(
          mode === 'free'
            ? Math.abs(session.sim.cars[0].p.x) < 0.01
            : session.sim.cars[0].p.distanceTo(before) < 1
        );
        if (mode === 'training') {
          owner.practice('next');
          await until(() => owner.sim.trainingIndex === 1, 'next drill replicated');
          assert.equal(owner.sim.drillName, session.sim.drillName);
        }
      }
      const before = session.sim.cars[0].p.clone();
      owner.link.send({
        t: 'state',
        matchId: owner.matchId,
        cars: [{p: [999, 999, 999]}],
        score: [999, 0],
        dt: 10000
      });
      await delay(15);
      assert.ok(session.sim.cars[0].p.distanceTo(before) < 2);
      assert.deepEqual(session.sim.score, [0, 0]);
      assert.ok(owner.members.every((member) => !('token' in member) && !('authId' in member)));
    }
  );
test('two players find the same dedicated 1v1 without a browser host', async (t) => {
  const h = await harness(t),
    a = h.client('A'),
    b = h.client('B');
  a.matchmake(a.testLook, {mode: 'duel'}, {region: 'oceania'});
  await until(() => a.queueState?.phase === 'searching', 'queue');
  b.matchmake(b.testLook, {mode: 'duel'}, {region: 'oceania'});
  await until(() => a.active && b.active, 'match');
  assert.equal(a.code, b.code);
  assert.equal(a.canManage, false);
  assert.equal(b.canManage, false);
  assert.deepEqual([a.sim.localPlayerId, b.sim.localPlayerId], [0, 1]);
  assert.ok([...h.app.rooms.values()].every((room) => room.sim.cars.every((car) => !car.bot)));
});
test('2v2 uses a separate queue and fills missing players with server bots only after 60 seconds', async (t) => {
  const h = await harness(t),
    duel = h.client('Duel'),
    a = h.client('A'),
    b = h.client('B');
  duel.matchmake(duel.testLook, {mode: 'duel'}, {region: 'oceania'});
  a.matchmake(a.testLook, {mode: 'doubles'}, {region: 'oceania'});
  b.matchmake(b.testLook, {mode: 'doubles'}, {region: 'oceania'});
  await until(() => h.app.queue.waiting.size === 3, 'three queued');
  h.advance(59999);
  assert.equal(h.app.rooms.size, 0);
  h.advance(1);
  await until(() => duel.active && a.active && b.active, 'bot matches');
  assert.equal(a.code, b.code);
  assert.notEqual(a.code, duel.code);
  const doubles = h.app.rooms.get(a.code);
  assert.equal(doubles.sim.cars.length, 4);
  assert.equal(doubles.sim.cars.filter((car) => car.bot).length, 2);
  assert.equal(h.app.rooms.get(duel.code).sim.cars.filter((car) => car.bot).length, 1);
});
test('cancelling a server search removes it, and practice modes immediately create server sessions', async (t) => {
  const h = await harness(t),
    a = h.client('Cancel');
  a.matchmake(a.testLook, {mode: 'duel'});
  await until(() => h.app.queue.waiting.size === 1, 'queued');
  a.close();
  await until(() => h.app.queue.waiting.size === 0, 'cancel');
  h.advance(60001);
  assert.equal(h.app.rooms.size, 0);
  for (const mode of ['free', 'training']) {
    const player = h.client(mode);
    player.matchmake(player.testLook, {mode});
    await until(() => player.active, 'practice ' + mode);
    assert.equal(h.app.rooms.get(player.code).sim.options.mode, mode);
  }
});
test('custom matchmaking creates a manageable private lobby without auto-starting it', async (t) => {
  const h = await harness(t),
    a = h.client('Custom');
  a.matchmake(a.testLook, {mode: 'custom'});
  await until(() => a.admitted, 'lobby');
  assert.equal(a.canManage, true);
  assert.equal(a.matchmade, false);
  assert.equal(a.self.team, null);
  assert.equal(h.app.rooms.get(a.code).sim, undefined);
});
test('server input acknowledgements advance only when a fixed-step input is consumed', () => {
  const inputs = new ServerInputs();
  inputs.receive(
    [
      {n: 1, i: {throttle: 4, boost: true, dt: 999}},
      {n: 2, i: {throttle: -1}}
    ],
    0
  );
  assert.equal(inputs.ack, 0);
  assert.equal(inputs.next(1).throttle, 1);
  assert.equal(inputs.ack, 1);
  assert.equal(inputs.next(2).throttle, -1);
  assert.equal(inputs.ack, 2);
  assert.equal(
    inputs.receive(
      [
        {n: 1, i: {throttle: 1}},
        {n: 2 ** 32, i: {throttle: 1}}
      ],
      3
    ),
    false
  );
  assert.equal(inputs.next(1000).throttle, 0);
  assert.ok(inputs.queue.length <= 120);
});
test('tiny acknowledged prediction differences do not replay or displace the local car', () => {
  const sim = new Simulation({humanIds: [0, 1]});
  sim.phase = 'playing';
  sim.cars[1].p.set(0, C.carHeight, -20);
  sim.cars[1].q.identity();
  sim.cars[0].p.set(25, C.carHeight, 25);
  sim.ball.p.set(20, 8, 0);
  const replica = new GuestReplica(sim, 1);
  replica.receive(makeState(sim, 1, 0, 'test'), 0);
  for (let n = 0; n < 60; n++) replica.step({throttle: 0.5});
  const pose = replica.predicted.p.clone();
  applyCar(sim.cars[1], replica.history.get(30));
  const packet = makeState(sim, 2, 30, 'test');
  packet.cars[1].p[0] += 0.001;
  packet.cars[1].score = 50;
  replica.receive(packet, 500);
  assert.equal(replica.lastReplay, 0);
  assert.equal(replica.ignoredCorrections, 1);
  assert.equal(replica.predicted.score, 50);
  assert.ok(replica.predicted.p.distanceTo(pose) < 1e-9);
  const large = makeState(sim, 3, 31, 'test');
  large.cars[1] = structuredClone(replica.history.get(31));
  large.cars[1].p[0] += 0.5;
  const before = replica.sample(510, 0).cars[1].p.slice();
  replica.receive(large, 510);
  assert.ok(replica.lastReplay > 0);
  assert.deepEqual(replica.sample(510, 0).cars[1].p, before);
  assert.equal(replica.receive(packet, 511), false);
});

for (const rtt of [50, 100, 150])
  test(`prediction stays continuous at ${rtt}ms with 3% loss, jitter and reordered updates`, async () => {
    const {trial} = await import('./helpers/network-trial.mjs');
    for (const changing of [false, true]) {
      const metrics = trial(rtt, 0.03, changing);
      assert.ok(metrics.received > 210);
      assert.ok(metrics.maxInstant < 1e-8, 'a snapshot visibly moved the own car');
      assert.ok(metrics.maxStep < 0.29, JSON.stringify(metrics));
      assert.ok(metrics.maxCorrection < 1, JSON.stringify(metrics));
      assert.ok(metrics.pendingInputs < 40);
      if (!changing) assert.ok(metrics.ignoredCorrections > 200, JSON.stringify(metrics));
    }
  });

test('the actual matchmaking menu adapter carries a custom lobby through to a playable server match', async (t) => {
  const h = await harness(t),
    {DedicatedMatchmaker} = await import('../dist/server-matchmaking.js');
  let lobby, playing;
  class Room {
    constructor(options) {
      return h.client('Adapter', credentials(h.url), options);
    }
  }
  const maker = new DedicatedMatchmaker({
    address: h.url,
    Room,
    onLobby: (room) => (lobby = room),
    onMatch: (sim) => (playing = sim)
  });
  maker.start({name: 'Adapter'}, {mode: 'custom'});
  await until(() => lobby?.admitted, 'adapter lobby');
  assert.equal(lobby.canManage, true);
  lobby.chooseTeam(0);
  lobby.setReady(true);
  await until(() => lobby.self.team === 0 && lobby.self.ready, 'adapter ready');
  lobby.startMatch();
  await until(() => playing && lobby.active, 'adapter match');
  assert.equal(playing, lobby.sim);
  assert.equal(playing.localPlayerId, lobby.id);
});
test('the real server matchmaking adapter gives both players the same match and keeps it alive after search ends', async (t) => {
  const h = await harness(t),
    {DedicatedMatchmaker} = await import('../dist/server-matchmaking.js'),
    matches = [];
  class Room {
    constructor(options) {
      return h.client('Adapter', credentials(h.url), options);
    }
  }
  const a = new DedicatedMatchmaker({
      address: h.url,
      Room,
      onMatch: (sim, room) => matches.push(room)
    }),
    b = new DedicatedMatchmaker({address: h.url, Room, onMatch: (sim, room) => matches.push(room)});
  a.start({name: 'First'}, {mode: 'duel'});
  b.start({name: 'Second'}, {mode: 'duel'});
  await until(() => matches.length === 2, 'adapter duel');
  assert.equal(matches[0].matchId, matches[1].matchId);
  a.cancel();
  b.cancel();
  assert.ok(matches.every((room) => room.active));
  const oldMatch = matches[0].matchId,
    session = h.app.rooms.get(matches[0].code);
  session.sim.phase = 'ended';
  session.events([{type: 'end'}]);
  await until(
    () => matches.slice(0, 2).every((room) => room.sim.phase === 'ended'),
    'adapter results'
  );
  for (const room of matches.slice(0, 2)) room.requestRematch();
  await until(() => matches.length === 4, 'rematch callbacks');
  assert.ok(matches.every((room) => room.active && room.matchId !== oldMatch));
});

test('a four-second input outage resumes at fresh controls without FIFO delay or permanent sequence rejection', () => {
  const inputs = new ServerInputs();
  inputs.receive([{n: 1, i: {throttle: 1}}], 0);
  inputs.next(0);
  assert.equal(inputs.ack, 1);
  assert.equal(inputs.next(4000).throttle, 0);
  assert.equal(
    inputs.receive(
      [
        {n: 500, i: {throttle: -1}},
        {n: 501, i: {throttle: -1}}
      ],
      4001
    ),
    true
  );
  assert.equal(inputs.ack, 1);
  assert.equal(inputs.next(4002).throttle, -1);
  assert.equal(inputs.ack, 501);
  assert.equal(inputs.queue.length, 0);
  inputs.receive([{n: 502, i: {steer: 1}}], 4003);
  assert.equal(inputs.next(4004).steer, 1);
  assert.equal(inputs.ack, 502);
});
