import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  AdminAuth,
  MemoryAdminStore,
  hashAdminPin,
} from '../server/admin/auth.mjs';
import {adminMailer} from '../server/admin/mail.mjs';
import {createGameServer} from '../server/index.mjs';
import {tls, secureFetch} from './helpers/secure-server.mjs';
import {cloudflareServer} from './helpers/cloudflare-server.mjs';
const testPin = '708193',
  secret = 's'.repeat(43),
  email = 'admin@example.test',
  hash = await hashAdminPin(testPin),
  origin = 'https://game.example';
const cookie = (result, name = '__Host-bc_admin_login') =>
  result.setCookies.find((v) => v.startsWith(name + '=')).split(';')[0];
const context = {
  method: 'POST',
  origin,
  serverOrigin: origin,
  address: '192.0.2.1',
};
function fixture(options = {}) {
  let now = 1000000;
  const mail = [],
    store = options.store || new MemoryAdminStore(),
    admin = new AdminAuth({
      pinHash: hash,
      email,
      secret,
      store,
      clock: () => now,
      sendMail: async (message) => mail.push(message),
      ...options,
    });
  return {admin, mail, store, time: (v) => (now += v)};
}
async function login(f) {
  const start = await f.admin.handle({
    ...context,
    path: '/api/admin/request-code',
    body: {pin: testPin},
  });
  assert.equal(start.status, 202);
  const verified = await f.admin.handle({
    ...context,
    path: '/api/admin/verify-code',
    cookieHeader: cookie(start),
    body: {code: f.mail.at(-1).code},
  });
  assert.equal(verified.status, 200);
  return {start, verified, session: cookie(verified, '__Host-bc_admin')};
}
test('admin needs both PIN and a browser-bound email code; only keyed hashes are persisted', async () => {
  const f = fixture();
  assert.equal(
    (
      await f.admin.handle({
        ...context,
        path: '/api/admin/request-code',
        body: {pin: '0000'},
      })
    ).status,
    401,
  );
  assert.equal(f.mail.length, 0);
  const {start, verified, session} = await login(f);
  assert.ok(await f.admin.authenticated(session));
  assert.match(verified.setCookies[0], /Secure; HttpOnly; SameSite=Strict/);
  assert.match(verified.setCookies[0], /Max-Age=900/);
  const stored = JSON.stringify(f.store.value);
  for (const value of [testPin, email, f.mail[0].code, session.split('=')[1]])
    assert.ok(!stored.includes(value));
  assert.equal(
    (
      await f.admin.handle({
        ...context,
        path: '/api/admin/verify-code',
        cookieHeader: cookie(start),
        body: {code: f.mail[0].code},
      })
    ).status,
    401,
  );
});
test('expired codes, codes in a different browser, and five wrong guesses never create an admin session', async () => {
  const f = fixture(),
    start = await f.admin.handle({
      ...context,
      path: '/api/admin/request-code',
      body: {pin: testPin},
    }),
    otp = f.mail[0].code;
  assert.equal(
    (
      await f.admin.handle({
        ...context,
        path: '/api/admin/verify-code',
        body: {code: otp},
      })
    ).status,
    401,
  );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await f.admin.handle({
          ...context,
          path: '/api/admin/verify-code',
          cookieHeader: cookie(start),
          body: {code: 'wrong'},
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await f.admin.handle({
        ...context,
        path: '/api/admin/verify-code',
        cookieHeader: cookie(start),
        body: {code: otp},
      })
    ).status,
    401,
  );
  f.time(60001);
  const next = await f.admin.handle({
    ...context,
    path: '/api/admin/request-code',
    body: {pin: testPin},
  });
  f.time(300001);
  assert.equal(
    (
      await f.admin.handle({
        ...context,
        path: '/api/admin/verify-code',
        cookieHeader: cookie(next),
        body: {code: f.mail.at(-1).code},
      })
    ).status,
    401,
  );
});
test('PIN rate limits survive an auth-service restart and email requests are globally cooled down', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++)
    await f.admin.handle({
      ...context,
      path: '/api/admin/request-code',
      body: {pin: '1111'},
    });
  const again = fixture({store: f.store});
  assert.equal(
    (
      await again.admin.handle({
        ...context,
        path: '/api/admin/request-code',
        body: {pin: testPin},
      })
    ).status,
    429,
  );
  const g = fixture();
  await g.admin.handle({
    ...context,
    path: '/api/admin/request-code',
    body: {pin: testPin},
  });
  assert.equal(
    (
      await g.admin.handle({
        ...context,
        address: '192.0.2.2',
        path: '/api/admin/request-code',
        body: {pin: testPin},
      })
    ).status,
    429,
  );
  assert.equal(g.mail.length, 1);
});
test('one-time verification is atomic, logout revokes the session, and missing configuration fails closed', async () => {
  const f = fixture(),
    start = await f.admin.handle({
      ...context,
      path: '/api/admin/request-code',
      body: {pin: testPin},
    }),
    packet = {
      ...context,
      path: '/api/admin/verify-code',
      cookieHeader: cookie(start),
      body: {code: f.mail[0].code},
    },
    results = await Promise.all([
      f.admin.handle(packet),
      f.admin.handle(packet),
    ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  const session = cookie(
    results.find((r) => r.status === 200),
    '__Host-bc_admin',
  );
  await f.admin.handle({
    ...context,
    path: '/api/admin/logout',
    cookieHeader: session,
  });
  assert.equal(await f.admin.authenticated(session), false);
  const disabled = new AdminAuth();
  assert.equal(
    (
      await disabled.handle({
        ...context,
        path: '/api/admin/request-code',
        body: {pin: testPin},
      })
    ).status,
    503,
  );
});
test('email delivery failure does not reveal a code or create an authenticated session', async () => {
  const f = fixture({
      sendMail: async () => {
        throw Error('provider detail must stay private');
      },
    }),
    r = await f.admin.handle({
      ...context,
      path: '/api/admin/request-code',
      body: {pin: testPin},
    });
  assert.equal(r.status, 503);
  assert.equal(r.setCookies.length, 0);
  assert.ok(!JSON.stringify(r).includes('provider detail'));
  assert.equal(Object.keys(f.store.value.challenges).length, 0);
});
test('admin mail uses a fixed encrypted provider endpoint and a server-selected recipient', async () => {
  let sent;
  const deliver = adminMailer(
    {RESEND_API_KEY: 're_fixture_only_1234567890123456'},
    async (url, options) => {
      sent = {url, options};
      return Response.json({id: 'fixture'});
    },
  );
  await deliver({to: email, code: '12345678', expiresMinutes: 5});
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.equal(
    sent.options.headers.Authorization,
    'Bearer re_fixture_only_1234567890123456',
  );
  assert.deepEqual(JSON.parse(sent.options.body).to, [email]);
  assert.match(JSON.parse(sent.options.body).text, /12345678/);
});
for (const adapter of ['node', 'cloudflare'])
  test(
    adapter +
      ' admin APIs protect metrics, reject cross-origin requests, set secure cookies and retain public game access',
    async (t) => {
      const mail = [];
      let base, call;
      if (adapter === 'node') {
        const app = createGameServer({
          tls,
          tick: false,
          adminConfig: {
            ADMIN_PIN_HASH: hash,
            ADMIN_EMAIL: email,
            ADMIN_SECRET: secret,
            sendMail: async (m) => mail.push(m),
          },
        });
        t.after(() => app.close());
        const a = await app.listen(0);
        base = 'https://127.0.0.1:' + a.port;
        call = (path, options) => secureFetch(base + path, options);
      } else {
        const h = await cloudflareServer(t, {
          bindings: {
            ADMIN_PIN_HASH: hash,
            ADMIN_EMAIL: email,
            ADMIN_SECRET: secret,
            RESEND_API_KEY: 're_fixture_only_1234567890123456',
          },
          outboundService: async (request) => {
            assert.equal(new URL(request.url).origin, 'https://api.resend.com');
            mail.push(await request.json());
            return Response.json({id: 'fixture'});
          },
        });
        base = h.base;
        call = (path, options = {}) =>
          h.request(path, {
            ...options,
            headers: {...options.headers, Connection: 'close'},
          });
      }
      const post = (path, body, cookieHeader = '', extra = {}) =>
        call('/api/admin/' + path, {
          method: 'POST',
          headers: {
            Origin: base,
            'Content-Type': 'application/json',
            ...(cookieHeader ? {Cookie: cookieHeader} : {}),
            ...extra,
          },
          body: JSON.stringify(body),
        });
      assert.equal((await call('/api/admin/overview')).status, 401);
      assert.equal(
        (
          await call('/api/admin/overview', {
            headers: {Origin: 'https://unrelated.example'},
          })
        ).status,
        403,
      );
      const health = await call('/health');
      assert.equal(health.status, 200);
      assert.equal((await health.json()).runtime, undefined);
      assert.match(health.headers['strict-transport-security'], /max-age/);
      assert.match(
        health.headers['content-security-policy'],
        /object-src 'none'/,
      );
      for (const path of ['/.env', '/.git/config', '/server/admin/auth.mjs'])
        assert.equal((await call(path)).status, 404);
      const start = await post('request-code', {pin: testPin});
      assert.equal(start.status, 202);
      const first = Array.isArray(start.headers['set-cookie'])
          ? start.headers['set-cookie'][0]
          : start.headers['set-cookie'],
        bind = first.split(';')[0];
      assert.ok(!JSON.stringify(await start.json()).includes(email));
      const otp =
        adapter === 'node'
          ? mail.at(-1).code
          : mail.at(-1).text.match(/code is (\d{8})/)[1];
      const verify = await post('verify-code', {code: otp}, bind);
      assert.equal(verify.status, 200);
      const lines = verify.headers['set-cookie'],
        session = (Array.isArray(lines) ? lines[0] : lines).split(';')[0];
      const overview = await call('/api/admin/overview', {
        headers: {Cookie: session},
      });
      assert.equal(overview.status, 200);
      assert.ok((await overview.json()).runtime);
      assert.equal(overview.headers['cache-control'], 'no-store');
      await post('logout', {}, session);
      assert.equal(
        (await call('/api/admin/overview', {headers: {Cookie: session}}))
          .status,
        401,
      );
    },
  );

test('admin mutations reject cross-origin, missing origin, non-JSON and oversized bodies before issuing any email', async () => {
  const {handleAdmin} = await import('../server/admin/http.mjs'),
    f = fixture(),
    service = {auth: {permit: () => true}};
  const base = {
    method: 'POST',
    path: '/api/admin/request-code',
    origin,
    serverOrigin: origin,
    address: '192.0.2.1',
    contentType: 'application/json',
    body: new Blob([JSON.stringify({pin: testPin})]).stream(),
    admin: f.admin,
    service,
  };
  for (const change of [
    {origin: 'https://attacker.example'},
    {origin: ''},
    {contentType: 'text/plain'},
  ])
    assert.equal((await handleAdmin({...base, ...change})).status, 403);
  assert.equal(
    (await handleAdmin({...base, body: new Blob(['x'.repeat(1025)]).stream()}))
      .status,
    413,
  );
  assert.equal(f.mail.length, 0);
});

test('private setup and server files cannot be served even if they exist under a misconfigured public root', async (t) => {
  const {mkdtemp, mkdir, writeFile, rm} = await import('node:fs/promises'),
    {tmpdir} = await import('node:os'),
    {join} = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'bc-private-path-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, '.admin-setup'));
  await mkdir(join(root, 'server'));
  await writeFile(join(root, '.admin-setup', 'secrets.json'), 'private-canary');
  await writeFile(join(root, 'server', 'auth.mjs'), 'private-canary');
  await writeFile(join(root, 'index.html'), 'public-canary');
  const app = createGameServer({tls, root, tick: false});
  t.after(() => app.close());
  const address = await app.listen(0),
    base = 'https://127.0.0.1:' + address.port;
  assert.equal(await (await secureFetch(base + '/')).text(), 'public-canary');
  for (const path of ['/.admin-setup/secrets.json', '/server/auth.mjs']) {
    const r = await secureFetch(base + path);
    assert.equal(r.status, 404);
    assert.ok(!(await r.text()).includes('private-canary'));
  }
});
