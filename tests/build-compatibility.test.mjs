import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {
  COMPATIBLE_BUILDS,
  compatibleBuild,
  reloadGame,
} from '../dist/build-compatibility.js';
import {NET_BUILD} from '../dist/network-protocol.js';
import {ServerCredentials} from '../dist/server-auth.js';
import {SocketLink} from '../server/transport/socket-link.mjs';
import {GameService} from '../server/runtime/game-service.mjs';
import {DedicatedRoom} from '../dist/dedicated-room.js';
import {DedicatedMatchmaker} from '../dist/server-matchmaking.js';
import {createGameServer} from '../server/index.mjs';
import {cloudflareServer} from './helpers/cloudflare-server.mjs';
import {
  TrustedLink,
  tls,
  credentials,
  secureFetch,
} from './helpers/secure-server.mjs';

// Enforce each legacy client's strict build-tag contract on the actual wire.
// Shared physics is pinned above; unmodified archived clients also have a
// release check for driving, reconnect and rematch against this implementation.
function legacyLink(Base, build) {
  return class extends Base {
    constructor(url, options) {
      super(url, {
        ...options,
        onPacket: (packet) => {
          if (packet.build) {
            assert.equal(packet.build, build);
            if (build !== NET_BUILD)
              assert.equal(packet.serverBuild, NET_BUILD);
            packet = {...packet, build: NET_BUILD};
          }
          options.onPacket(packet);
        },
      });
    }
    send(packet, realtime) {
      return super.send(packet.build ? {...packet, build} : packet, realtime);
    }
  };
}
const until = async (check, label) => {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > 7000) throw Error(label);
    await delay(10);
  }
};
for (const adapter of ['node', 'cloudflare'])
  test(
    adapter +
      ' current clients share the authoritative v1.31 rules',
    async (t) => {
      let endpoint;
      if (adapter === 'node') {
        const app = createGameServer({tls});
        t.after(() => app.close());
        const address = await app.listen(0);
        endpoint = 'wss://127.0.0.1:' + address.port + '/multiplayer';
      } else endpoint = (await cloudflareServer(t)).url;
      const origin = new URL(endpoint).origin.replace('wss:', 'https:');
      const discovery = await secureFetch(origin + '/server-config.json', {
        headers: {Origin: origin},
      });
      assert.equal(discovery.headers['access-control-allow-origin'], origin);
      assert.deepEqual(
        (await discovery.json()).compatibleBuilds,
        COMPATIBLE_BUILDS,
      );
      const unrelated = await secureFetch(origin + '/server-config.json', {
        headers: {Origin: 'https://unrelated.example'},
      });
      assert.equal(unrelated.headers['access-control-allow-origin'], undefined);
      const errors = [],
        owner = new DedicatedRoom({
          address: endpoint,
          Link: legacyLink(TrustedLink, NET_BUILD),
          credentials: credentials(endpoint),
          onDisconnect: (reason) => errors.push(reason),
        }),
        guest = new DedicatedRoom({
          address: endpoint,
          Link: TrustedLink,
          credentials: credentials(endpoint),
          onDisconnect: (reason) => errors.push(reason),
        });
      t.after(() => {
        owner.close();
        guest.close();
      });
      owner.create(
        {mode: 'custom', maxPeople: 4, duration: 60},
        {name: 'Current Owner'},
      );
      await until(() => owner.admitted, 'legacy admission');
      guest.join(owner.invite, {name: 'Current Client'});
      await until(() => guest.admitted, 'current admission');
      owner.chooseTeam(0);
      guest.chooseTeam(1);
      owner.setReady(true);
      guest.setReady(true);
      await until(
        () =>
          owner.members.every((member) => member.team !== null && member.ready),
        'mixed teams',
      );
      assert.ok(owner.startMatch());
      await until(() => owner.active && guest.active, 'mixed game');
      assert.equal(owner.matchId, guest.matchId);
      assert.equal(owner.sim.options.arena, guest.sim.options.arena);
      assert.equal(owner.sim.cars.length, 2);
      assert.deepEqual(errors, []);
    },
  );

test('legacy compatibility stays pinned to unchanged gameplay and binary rules', () => {
  const legacy = JSON.parse(
    readFileSync(
      new URL('./fixtures/compatibility-1.27.json', import.meta.url),
    ),
  );
  assert.ok(compatibleBuild(NET_BUILD));
  assert.equal(compatibleBuild('old'), false);
  assert.equal(compatibleBuild('boost-circuit-1.26.0'), false);
  if (!compatibleBuild(legacy.build)) return;
  for (const [path, hash] of Object.entries(legacy.sha256))
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL('../' + path, import.meta.url)))
        .digest('hex'),
      hash,
      path + ' changed: remove/revalidate legacy compatibility',
    );
});
test('preflight uses the server advertised compatibility and rejects an outdated endpoint before authentication', async () => {
  const seen = [];
  const credentials = new ServerCredentials('wss://server.test/multiplayer', {
    fetcher: async function (url, options) {
      assert.equal(this, globalThis);
      seen.push({url, options});
      return {ok: true, json: async () => ({build: 'boost-circuit-1.20.0'})};
    },
  });
  await assert.rejects(
    credentials.checkVersion(),
    (error) =>
      error.code === 'VERSION_MISMATCH' &&
      /v1.20.0/.test(error.message) &&
      /Connection/.test(error.message),
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://server.test/server-config.json');
  assert.equal(seen[0].options.cache, 'no-store');
  assert.equal(seen[0].options.credentials, 'omit');
  assert.equal(seen[0].options.headers, undefined);
  credentials.fetcher = async () => ({
    ok: true,
    json: async () => ({
      build: 'boost-circuit-1.27.0',
      compatibleBuilds: [NET_BUILD],
    }),
  });
  await credentials.checkVersion();
  credentials.fetcher = async () => ({ok: false, status: 404});
  await credentials.checkVersion();
});
test('version mismatch produces a recoverable queue state and creates no WebSocket or guest token', async () => {
  let sockets = 0,
    tickets = 0;
  const states = [];
  const credentials = new ServerCredentials(
    'wss://old-server.test/multiplayer',
    {
      fetcher: async () => ({
        ok: true,
        json: async () => ({build: 'boost-circuit-1.20.0'}),
      }),
    },
  );
  credentials.ticket = async () => {
    tickets++;
  };
  class Room extends DedicatedRoom {
    constructor(options) {
      super({
        ...options,
        credentials,
        Link: class {
          constructor() {
            sockets++;
            throw Error('Unexpected socket creation');
          }
        },
      });
    }
  }
  const queue = new DedicatedMatchmaker({
    address: 'https://old-server.test',
    Room,
    onChange: (state) => states.push(state),
  });
  queue.start({name: 'Test'});
  for (
    let i = 0;
    i < 20 && !states.some((state) => state.phase === 'update');
    i++
  )
    await delay(1);
  assert.equal(states.at(-1).phase, 'update');
  assert.match(states.at(-1).reason, /v1.20.0/);
  assert.equal(sockets, 0);
  assert.equal(tickets, 0);
  queue.cancel();
});
test('compatible build negotiation keeps each reliable header isolated without mutating shared packets', () => {
  const one = [],
    two = [],
    a = new SocketLink(
      {
        readyState: 1,
        bufferedAmount: 0,
        send: (raw) => one.push(JSON.parse(raw)),
      },
      {build: 'boost-circuit-1.27.0'},
    ),
    b = new SocketLink({
      readyState: 1,
      bufferedAmount: 0,
      send: (raw) => two.push(JSON.parse(raw)),
    });
  const shared = {t: 'party-config', build: NET_BUILD, options: {mode: 'duel'}};
  a.send(shared);
  b.send(shared);
  assert.equal(one[0].build, 'boost-circuit-1.27.0');
  assert.equal(one[0].serverBuild, NET_BUILD);
  assert.equal(two[0].build, NET_BUILD);
  assert.equal(shared.build, NET_BUILD);
  assert.equal(shared.serverBuild, undefined);
});
test('build authentication rejects unknown versions and changing builds within an authenticated connection', () => {
  const service = new GameService({autostart: false}),
    out = [],
    socket = {
      readyState: 1,
      addEventListener() {},
      send: (raw) => out.push(JSON.parse(raw)),
      close() {
        this.readyState = 3;
      },
    };
  service.accept(socket);
  const session = service.auth.issue(),
    ticket = service.auth.ticket(session.token, '');
  service.receive(
    socket,
    JSON.stringify({
      t: 'server-auth',
      build: NET_BUILD,
      ticket: ticket.ticket,
    }),
  );
  assert.equal(out.at(-1).build, NET_BUILD);
  assert.equal(out.at(-1).serverBuild, NET_BUILD);
  service.receive(
    socket,
    JSON.stringify({
      t: 'server-create',
      build: 'boost-circuit-1.30.0',
      options: {mode: 'duel'},
    }),
  );
  assert.equal(out.at(-1).t, 'server-error');
  assert.equal(service.rooms.size, 0);
  service.close();
  const denied = new GameService({autostart: false}),
    messages = [],
    bad = {
      readyState: 1,
      addEventListener() {},
      send: (raw) => messages.push(JSON.parse(raw)),
      close() {
        this.readyState = 3;
      },
    };
  denied.accept(bad);
  denied.receive(
    bad,
    JSON.stringify({t: 'server-auth', build: 'future-unverified'}),
  );
  assert.equal(messages.at(-1).code, 'version-mismatch');
  assert.equal(messages.at(-1).build, NET_BUILD);
  denied.close();
});
test('reload preserves route, invite and unrelated preferences without clearing browser storage', () => {
  let next;
  const location = {
    href: 'https://game.test/play?invite=example#garage',
    replace: (url) => (next = url),
  };
  reloadGame(location);
  const url = new URL(next);
  assert.equal(url.pathname, '/play');
  assert.equal(url.searchParams.get('invite'), 'example');
  assert.equal(url.searchParams.get('_update'), NET_BUILD);
  assert.equal(url.hash, '#garage');
});
