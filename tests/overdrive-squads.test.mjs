import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createGameServer} from '../server/index.mjs';
import {DedicatedRoom} from '../dist/dedicated-room.js';
import {
  TrustedLink as Link,
  tls,
  credentials,
} from './helpers/secure-server.mjs';
import {cloudflareServer} from './helpers/cloudflare-server.mjs';
import {ServerMatchQueue, packTeams} from '../server/matchmaking/queue.mjs';
const until = async (check, label) => {
  const at = performance.now();
  while (!check()) {
    if (performance.now() - at > 7000) throw Error(label);
    await delay(10);
  }
};
async function fixture(t, adapter) {
  if (adapter === 'cloudflare') {
    const h = await cloudflareServer(t);
    return {make: (name) => h.client(name), errors: h.errors};
  }
  const app = createGameServer({tls, maxRooms: 1}),
    address = await app.listen(0),
    url = 'wss://127.0.0.1:' + address.port + '/multiplayer',
    clients = [],
    errors = [];
  t.after(async () => {
    clients.forEach((c) => c.close());
    await app.close();
  });
  return {
    app,
    errors,
    make: (name) => {
      const c = new DedicatedRoom({
        address: url,
        Link,
        credentials: credentials(url),
        onDisconnect: (e) => errors.push(e),
      });
      c.testLook = {name};
      clients.push(c);
      return c;
    },
  };
}
async function pair(h, label) {
  const a = h.make(label + ' Lead'),
    b = h.make(label + ' Friend');
  a.create({mode: 'custom', maxPeople: 8}, a.testLook);
  await until(() => a.admitted, 'party admission');
  b.join(a.invite, b.testLook);
  await until(() => a.members.length === 2 && b.admitted, 'party join');
  for (const c of [a, b]) {
    c.chooseTeam(0);
    c.setReady(true);
  }
  await until(
    () => a.members.every((m) => m.ready && m.team === 0),
    'ready squad',
  );
  return [a, b];
}
for (const adapter of ['node', 'cloudflare'])
  test(
    adapter +
      ' keeps two parties together through matchmaking, authority, reconnect and returning to their lobby',
    async (t) => {
      const h = await fixture(t, adapter),
        a = await pair(h, 'Alpha'),
        b = await pair(h, 'Beta');
      a[0].queueParty({mode: 'doubles'}, {region: 'oceania'});
      await until(
        () => a[0].squadQueue?.phase === 'searching',
        'party searching',
      );
      b[0].queueParty({mode: 'doubles'}, {region: 'oceania'});
      await until(
        () => [...a, ...b].every((c) => c.active),
        'two squads in one arena',
      );
      assert.ok([...a, ...b].every((c) => c.code === a[0].code));
      assert.equal(a[0].self.team, a[1].self.team);
      assert.equal(b[0].self.team, b[1].self.team);
      assert.notEqual(a[0].self.team, b[0].self.team);
      assert.ok(a[0].sim.cars.every((c) => !c.bot));
      const match = a[1].matchId;
      a[1].link.socket.terminate();
      await until(() => a[1].recovering, 'recovery starts');
      await until(() => a[1].active && !a[1].recovering, 'recovery succeeds');
      assert.equal(a[1].matchId, match);
      assert.equal(a[1].squad.id, a[0].squad.id);
      // Attempting to move a live party or to lead someone else's party is denied.
      a[1].returnParty();
      await until(
        () => /Finish this match|party leader/.test(a[1].notice || ''),
        'live return denied',
      );
      assert.equal(a[1].matchId, match);
      // A normal goal/time result is already covered by physics. End the fixture
      // on its actual authority so this integration test need not wait five minutes.
      if (adapter === 'node') {
        const session = h.app.rooms.get(a[0].code);
        session.sim.end();
        session.publish(true);
        session.events([{type: 'end'}]);
        await until(
          () => a.every((c) => c.sim.phase === 'ended'),
          'end received',
        );
        const old = a[0].code;
        a[0].returnParty();
        await until(
          () => a.every((c) => c.admitted && !c.matchId && c.code !== old),
          'party returned',
        );
        assert.equal(a[0].code, a[1].code);
        assert.equal(a[0].members.length, 2);
        assert.equal(a[0].squad.id, a[1].squad.id);
        assert.notEqual(a[0].code, b[0].code);
        a[0].queueParty({mode: 'doubles'}, {region: 'oceania'});
        b[0].nextPartyMatch();
        await until(
          () => [...a, ...b].every((c) => c.active),
          'parties play next match',
        );
        assert.ok(a[0].sim.cars.every((c) => !c.bot));
        assert.equal(a[0].code, b[0].code);
      }
      assert.deepEqual(h.errors, []);
    },
  );
test('party queues never split a duo, retain their place while the free arena is busy and fall back only after 60 seconds', () => {
  let now = 0,
    available = false;
  const matches = [],
    q = new ServerMatchQueue({
      clock: () => now,
      onMatch: (p, o, bots) => {
        if (!available) return false;
        matches.push({p, o, bots});
      },
    }),
    socket = () => ({
      readyState: 1,
      messages: [],
      send(raw) {
        this.messages.push(JSON.parse(raw));
      },
    }),
    duo = [0, 1].map((i) => ({
      socket: socket(),
      identity: {id: 'duo' + i},
      packet: {look: {name: 'Duo'}},
    })),
    home = {};
  q.addParty(home, duo, {
    options: {mode: 'doubles'},
    network: {region: 'oceania'},
  });
  now = 60001;
  q.pump();
  assert.equal(matches.length, 0);
  assert.equal(q.waiting.size, 1);
  assert.match(duo[0].socket.messages.at(-1).reason, /arena is in use/);
  available = true;
  q.pump();
  assert.equal(matches.length, 1);
  assert.equal(matches[0].bots, true);
  assert.equal(matches[0].p.length, 2);
  assert.equal(matches[0].p[0].team, matches[0].p[1].team);
  assert.equal(q.waiting.size, 0);
});
test('a party disconnect cancels the whole search without disconnecting its remaining friend', () => {
  const q = new ServerMatchQueue(),
    sockets = [0, 1].map(() => ({readyState: 1, send() {}})),
    room = {};
  q.addParty(
    room,
    sockets.map((socket, i) => ({
      socket,
      identity: {id: String(i)},
      packet: {},
    })),
    {options: {mode: 'doubles'}},
  );
  q.remove(sockets[1]);
  assert.equal(q.waiting.size, 0);
  assert.equal(sockets[0].readyState, 1);
});

test('a joining friend cancels a queued party instead of leaving anyone behind, and a departing leader promotes its friend', async (t) => {
  const h = await fixture(t, 'node'),
    [a, b] = await pair(h, 'Roster');
  a.queueParty({mode: 'doubles'}, {region: 'oceania'});
  await until(() => a.squadQueue?.phase === 'searching', 'search');
  const c = h.make('New Friend');
  c.join(a.invite, c.testLook);
  await until(
    () => a.members.length === 3 && a.squadQueue?.phase === 'cancelled',
    'joined friend cancels queue',
  );
  assert.equal(h.app.queue.waiting.size, 0);
  assert.equal(a.squad.size, 3);
  a.close();
  await until(() => b.canManage && b.squad?.owner, 'friend promoted');
  assert.equal(b.squad.size, 2);
});

test('a disconnect during asset preparation rejoins the pending load instead of failing an old send', async (t) => {
  const h = await fixture(t, 'node'),
    [a, b] = await pair(h, 'Loading');
  let calls = 0,
    loading = false,
    release;
  b.prepare = async () => {
    if (++calls === 1) {
      loading = true;
      await new Promise((resolve) => (release = resolve));
    }
  };
  a.startMatch();
  await until(() => loading, 'guest loading');
  b.link.socket.terminate();
  await until(() => b.recovering, 'reconnecting while loading');
  release();
  await until(
    () => a.active && b.active && !b.recovering,
    'both loaded after reconnect',
  );
  assert.equal(a.matchId, b.matchId);
  assert.equal(b.preparationError, undefined);
  assert.ok(calls >= 2);
  assert.deepEqual(h.errors, []);
});

test('an interrupted match load returns both squads home and releases the active arena', async (t) => {
  const h = await fixture(t, 'node'),
    a = await pair(h, 'Abort A'),
    b = await pair(h, 'Abort B');
  let release,
    loading = false;
  a[1].prepare = async () => {
    loading = true;
    await new Promise((resolve) => (release = resolve));
  };
  a[0].queueParty({mode: 'doubles'}, {region: 'oceania'});
  b[0].queueParty({mode: 'doubles'}, {region: 'oceania'});
  await until(
    () => loading && h.app.rooms.get(a[0].code)?.pendingMatch,
    'pending arena',
  );
  const old = a[0].code;
  h.app.rooms.get(old).abortLoading('Fixture interrupted preparation.');
  await until(
    () => [...a, ...b].every((c) => c.admitted && !c.matchId && c.code !== old),
    'squads returned',
  );
  release();
  await delay(30);
  assert.equal(a[0].code, a[1].code);
  assert.equal(b[0].code, b[1].code);
  assert.notEqual(a[0].code, b[0].code);
  assert.ok(!h.app.rooms.get(a[0].code).sim);
  a[1].prepare = async () => {};
  a[0].startMatch();
  await until(
    () => a.every((c) => c.active),
    'arena available for a new match',
  );
  assert.deepEqual(h.errors, []);
});
