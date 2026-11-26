import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {
  cloudflareServer,
  until,
  twoPlayers,
  config,
} from './helpers/cloudflare-server.mjs';
import {TrustedSocket} from './helpers/secure-server.mjs';
import {NET_BUILD} from '../dist/network-protocol.js';
import {randomBytes, randomUUID} from 'node:crypto';

test('Cloudflare serves authenticated friends, duplicate-name IDs and presence over HTTPS with strict origins', async (t) => {
  const h = await cloudflareServer(t),
    one = randomBytes(32).toString('hex'),
    two = randomBytes(32).toString('hex');
  const call = async (secret, body) => {
    const r = await h.request('/api/social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + secret,
      },
      body: JSON.stringify(body),
    });
    return {status: r.status, value: await r.json()};
  };
  const a = await call(one, {
      op: 'sync',
      name: 'Test Driver',
      tab: randomUUID(),
    }),
    b = await call(two, {op: 'sync', name: 'Test Driver', tab: randomUUID()});
  assert.equal(a.status, 200);
  assert.equal(b.value.online, 2);
  assert.notEqual(a.value.self.id, b.value.self.id);
  await call(one, {op: 'request', peer: b.value.self.id});
  const accepted = await call(two, {op: 'accept', peer: a.value.self.id});
  assert.equal(accepted.value.friends[0].id, a.value.self.id);
  assert.ok(!JSON.stringify(accepted.value).includes(one));
  assert.equal(
    (await call('guessed', {op: 'search', query: 'Test'})).status,
    401,
  );
  assert.equal(
    (
      await h.request('/api/social', {
        method: 'POST',
        headers: {
          Origin: 'https://unrelated.example',
          Authorization: 'Bearer ' + one,
        },
        body: '{}',
      })
    ).status,
    403,
  );
});

test('the no-card configuration uses Free-compatible SQLite Durable Objects and an HTTPS game on the same origin', async (t) => {
  assert.deepEqual(config.migrations, [
    {tag: 'v1', new_sqlite_classes: ['ArenaService']},
  ]);
  assert.equal(config.vars.MAX_ROOMS, '1');
  assert.equal(config.workers_dev, true);
  assert.equal(config.observability.enabled, false);
  const h = await cloudflareServer(t),
    health = await h.request('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).build, NET_BUILD);
  const home = await h.request('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /CUSTOM PRIVATE LOBBY/);
  const client = await h.request('/server-config.json');
  assert.equal((await client.json()).server, h.base);
  const plain = await h.mf.dispatchFetch('http://localhost/api/session', {
    method: 'POST',
  });
  assert.equal(plain.status, 426);
  assert.equal((await h.request('/package.json')).status, 404);
});
for (const mode of ['duel', 'doubles', 'free', 'training', 'custom', 'hoops'])
  test(
    'Cloudflare runs ' + mode + ' on the shared authority with late spectators',
    async (t) => {
      const h = await cloudflareServer(t),
        owner = h.client('Owner');
      owner.create({mode, maxPeople: 4, arena: 'festival'}, owner.testLook);
      await until(() => owner.admitted, 'owner');
      owner.chooseTeam(0);
      owner.setReady(true);
      await until(() => owner.self.team === 0 && owner.self.ready, 'ready');
      owner.startMatch();
      await until(() => owner.active, 'match');
      assert.equal(owner.sim.options.mode, mode);
      assert.equal(
        owner.sim.options.arena,
        mode === 'hoops' ? 'skyline' : 'festival',
      );
      assert.equal(
        owner.sim.cars.length,
        ['doubles', 'hoops'].includes(mode) ? 4 : mode === 'duel' ? 2 : 1,
      );
      assert.equal(
        owner.sim.cars.filter((car) => car.bot).length,
        ['doubles', 'hoops'].includes(mode) ? 3 : mode === 'duel' ? 1 : 0,
      );
      const watcher = h.client('Spectator');
      watcher.join(owner.invite, watcher.testLook);
      await until(() => watcher.active, 'watcher');
      assert.equal(watcher.sim.localPlayerId, null);
      assert.equal(watcher.sim.options.mode, mode);
      assert.equal(
        watcher.sim.options.arena,
        mode === 'hoops' ? 'skyline' : 'festival',
      );
      if (mode === 'training') {
        owner.practice('next');
        await until(
          () =>
            owner.sim.trainingIndex === 1 && watcher.sim.trainingIndex === 1,
          'authoritative next drill',
        );
        assert.equal(owner.sim.drillName, watcher.sim.drillName);
      }
      assert.deepEqual(h.errors, []);
    },
  );
test('Cloudflare guests drive and chat over verified WSS, then reconnect to the same car while the owner continues', async (t) => {
  const h = await cloudflareServer(t),
    {owner, guest} = await twoPlayers(h),
    match = guest.matchId;
  await until(
    () => owner.sim.phase === 'playing' && guest.sim.phase === 'playing',
    'kickoff',
  );
  const initial = guest.sim.cars[1].p.clone();
  for (let n = 0; n < 100; n++) {
    owner.guestStep({throttle: 1});
    guest.guestStep({throttle: 1});
    owner.sendInputs(true);
    guest.sendInputs(true);
    await delay(1000 / 120);
  }
  await until(
    () => guest.sim.cars[1].p.distanceTo(initial) > 0.3,
    'authoritative movement',
  );
  assert.ok(guest.replica.lastSequence > 20);
  assert.ok(Number.isFinite(guest.replica.diagnostics().serverInputQueueMs));
  assert.ok(guest.replica.diagnostics().serverInputQueueMs <= 34);
  assert.ok(guest.replica.diagnostics().serverInputTick > 50);
  guest.sendChat('Hello from the Worker');
  await until(() => h.messages.length === 2, 'chat reaches both');
  const elapsed = owner.sim.elapsed;
  guest.link.socket.terminate();
  await until(() => guest.recovering, 'socket loss');
  await until(
    () => guest.active && !guest.recovering,
    'authenticated recovery',
  );
  assert.equal(guest.matchId, match);
  assert.equal(guest.sim.localPlayerId, guest.id);
  assert.ok(owner.sim.elapsed > elapsed + 0.25);
  assert.deepEqual(h.errors, []);
});
test('Cloudflare matchmaking connects two humans through its single Oceania authority', async (t) => {
  const h = await cloudflareServer(t),
    a = h.client('A'),
    b = h.client('B');
  a.matchmake(a.testLook, {mode: 'duel'}, {region: 'oceania'});
  await until(() => a.queueState?.phase === 'searching', 'queue');
  b.matchmake(b.testLook, {mode: 'duel'}, {region: 'oceania'});
  await until(() => a.active && b.active, 'matched');
  assert.equal(a.code, b.code);
  assert.equal(a.matchId, b.matchId);
  assert.equal(a.canManage, false);
  assert.equal(b.canManage, false);
  assert.deepEqual([a.sim.localPlayerId, b.sim.localPlayerId], [0, 1]);
  assert.ok(a.sim.cars.every((car) => !car.bot));
});
test('Cloudflare rejects unauthenticated upgrades, forbidden origins and oversized authentication bodies', async (t) => {
  const h = await cloudflareServer(t);
  const forbidden = await h.request('/api/session', {
    method: 'POST',
    headers: {Origin: 'https://unrelated.invalid'},
  });
  assert.equal(forbidden.status, 403);
  const tooLarge = await h.request('/api/session', {
    method: 'POST',
    body: 'x'.repeat(5000),
  });
  assert.equal(tooLarge.status, 413);
  const socket = new TrustedSocket(h.url);
  t.after(() => socket.terminate());
  await new Promise((resolve) => socket.once('open', resolve));
  const reply = new Promise((resolve) =>
    socket.once('message', (raw) => resolve(JSON.parse(String(raw)))),
  );
  socket.send(JSON.stringify({t: 'server-create', build: NET_BUILD}));
  assert.match((await reply).message, /fresh authenticated/);
  assert.equal((await (await h.request('/health')).json()).rooms, 0);
});
test('Cloudflare allows lightweight lobbies but reserves only one active free arena', async (t) => {
  const h = await cloudflareServer(t),
    a = h.client('A'),
    b = h.client('B');
  a.create({mode: 'custom'}, a.testLook);
  await until(() => a.admitted, 'first lobby');
  b.create({mode: 'custom'}, b.testLook);
  await until(() => b.admitted, 'second lightweight lobby');
  a.chooseTeam(0);
  a.setReady(true);
  await until(() => a.self?.team === 0, 'first team');
  a.startMatch();
  await until(() => a.active, 'first arena');
  b.chooseTeam(0);
  b.setReady(true);
  await until(() => b.self?.team === 0, 'second team');
  b.startMatch();
  await until(() => /arena is in use/.test(b.notice || ''), 'active arena cap');
  assert.equal(b.active, false);
  a.close();
  await until(async () => true, 'departure');
  for (let n = 0; n < 50; n++) {
    if ((await (await h.request('/health')).json()).rooms === 1) break;
    await delay(20);
  }
  b.startMatch();
  await until(() => b.active, 'released arena reused');
  b.close();
  for (let n = 0; n < 50; n++) {
    if ((await (await h.request('/health')).json()).rooms === 0) return;
    await delay(20);
  }
  assert.fail('Empty lobbies were not released.');
});
