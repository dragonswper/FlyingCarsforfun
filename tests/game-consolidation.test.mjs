import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {GAMES} from '../dist/hub/library.js';
import {
  SECURITY_HEADERS,
  securityHeadersForPath,
} from '../server/http/security.mjs';
import {createGameServer as createStaticServer} from '../scripts/serve.mjs';
import {createGameServer as createDedicatedServer} from '../server/adapters/node.mjs';
import {tls, secureFetch} from './helpers/secure-server.mjs';
import {cloudflareServer} from './helpers/cloudflare-server.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('games/runtime-manifest.json', root)),
);
const hash = (data) => createHash('sha256').update(data).digest('hex');

test('the bundled decoder opens every compressed Random Eras model', async () => {
  await MeshoptDecoder.ready;
  let decoded = 0;
  for (const name of ['knight', 'weapons', 'map-kit', 'era-props']) {
    const file = readFileSync(
      new URL(`dist/games/random-eras/${name}.glb`, root),
    );
    const jsonLength = file.readUInt32LE(12);
    const doc = JSON.parse(file.subarray(20, 20 + jsonLength));
    const bin = file.subarray(28 + jsonLength);
    for (const view of doc.bufferViews) {
      const ext = view.extensions?.EXT_meshopt_compression;
      if (!ext) continue;
      assert.equal(ext.buffer, 0);
      const target = new Uint8Array(ext.count * ext.byteStride);
      const source = bin.subarray(
        ext.byteOffset || 0,
        (ext.byteOffset || 0) + ext.byteLength,
      );
      MeshoptDecoder.decodeGltfBuffer(
        target,
        ext.count,
        ext.byteStride,
        source,
        ext.mode,
        ext.filter,
      );
      decoded++;
    }
  }
  assert.ok(decoded > 0);
});

test('every hub game is served by the shared checkout and generated assets match their manifest', () => {
  for (const game of GAMES) {
    const index = new URL(`dist${game.url}index.html`, root);
    assert.ok(existsSync(index), game.title + ' has no local game page');
  }
  for (const game of manifest.games)
    for (const file of game.files) {
      const bytes = readFileSync(
        new URL(`dist${game.route}${file.path}`, root),
      );
      assert.equal(bytes.length, file.bytes);
      assert.equal(hash(bytes), file.sha256, game.id + '/' + file.path);
    }
  const shared = readFileSync(
    new URL('dist' + manifest.sharedEngine.path, root),
  );
  assert.equal(hash(shared), manifest.sharedEngine.sha256);
  for (const id of ['riftfall', 'skybreak']) {
    const html = readFileSync(
      new URL(`dist/games/${id}/index.html`, root),
      'utf8',
    );
    assert.match(html, /src="\.\.\/shared\/babylon8\/babylon.js"/);
    assert.ok(!existsSync(new URL(`dist/games/${id}/vendor/babylon.js`, root)));
  }
});

test('mounts keep game saves separate and the Vite build resolves fonts, workers and models within its game', () => {
  const keys = ['riftfall', 'skybreak'].map(
    (id) =>
      readFileSync(new URL(`dist/games/${id}/app.js`, root), 'utf8').match(
        /STORAGE_KEY\s*=\s*'([^']+)'/,
      )[1],
  );
  assert.equal(new Set(keys).size, 2);
  assert.ok(keys.every((key) => key.startsWith('flyingcars.')));
  const game = manifest.games.find((g) => g.id === 'random-eras');
  assert.ok(game.files.some((f) => /world-worker.*\.js$/.test(f.path)));
  assert.ok(game.files.some((f) => /fonts\/dm-sans.woff2$/.test(f.path)));
  assert.ok(game.files.some((f) => f.path === 'knight.glb'));
  const html = readFileSync(
    new URL('dist/games/random-eras/index.html', root),
    'utf8',
  );
  assert.ok(!html.includes('/src/main.js'));
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^(https?:|data:)/.test(match[1])) continue;
    assert.ok(
      existsSync(new URL(match[1], new URL('dist/games/random-eras/', root))),
      match[1],
    );
  }
});

test('only Random Eras permits WebAssembly decoding while JavaScript eval and insecure traffic remain blocked', () => {
  const normal = SECURITY_HEADERS['Content-Security-Policy'];
  assert.equal(
    securityHeadersForPath('/admin')['Content-Security-Policy'],
    normal,
  );
  assert.equal(
    securityHeadersForPath('/games/random-eras-unknown/')[
      'Content-Security-Policy'
    ],
    normal,
  );
  const decoder = securityHeadersForPath('/games/random-eras/')[
    'Content-Security-Policy'
  ];
  assert.ok(decoder.includes("'wasm-unsafe-eval'"));
  assert.ok(!decoder.includes("'unsafe-eval'"));
  assert.match(decoder, /connect-src 'self' blob: https: wss:/);
});

test('the shared Babylon engine starts without JavaScript eval', () => {
  const module = {exports: {}};
  const context = vm.createContext(
    {
      module,
      exports: module.exports,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      performance,
      TextEncoder,
      TextDecoder,
      URL,
    },
    {codeGeneration: {strings: false, wasm: false}},
  );
  vm.runInContext(
    readFileSync(
      new URL('dist/games/shared/babylon8/babylon.js', root),
      'utf8',
    ),
    context,
  );
  const engine = new module.exports.NullEngine();
  const scene = new module.exports.Scene(engine);
  assert.ok(module.exports.MeshBuilder.CreateBox('box', {}, scene));
  scene.dispose();
  engine.dispose();
});

test('the simple server resolves hub and game directories with canonical slashes', async (t) => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const route of ['/hub/', ...manifest.games.map((g) => g.route)]) {
    assert.equal((await fetch(base + route)).status, 200, route);
    const response = await fetch(base + route.slice(0, -1), {
      redirect: 'manual',
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), route);
  }
});

test('the authoritative HTTPS server hosts all games while keeping admin and source files private', async (t) => {
  const app = createDedicatedServer({tls, tick: false});
  t.after(() => app.close());
  const address = await app.listen(0),
    base = 'https://127.0.0.1:' + address.port;
  for (const route of ['/hub/', ...manifest.games.map((g) => g.route)]) {
    const response = await secureFetch(base + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers['content-type'], /text\/html/);
    if (route.includes('random-eras'))
      assert.match(
        response.headers['content-security-policy'],
        /wasm-unsafe-eval/,
      );
  }
  const redirect = await secureFetch(base + '/games/riftfall?test=1');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.location, '/games/riftfall/?test=1');
  assert.equal(
    (await secureFetch(base + '/games/random-eras/package.json')).status,
    404,
  );
  assert.equal(
    (await secureFetch(base + '/.admin-setup/secrets.json')).status,
    404,
  );
  assert.ok(
    [401, 503].includes(
      (await secureFetch(base + '/api/admin/overview')).status,
    ),
  );
});

test('Cloudflare serves every local game and its assets with the right security policy', async (t) => {
  const h = await cloudflareServer(t);
  for (const route of ['/hub/', ...manifest.games.map((g) => g.route)]) {
    const page = await h.request(route);
    assert.equal(page.status, 200, route);
    assert.match(page.headers['content-type'], /text\/html/);
    if (route.includes('random-eras'))
      assert.match(page.headers['content-security-policy'], /wasm-unsafe-eval/);
  }
  for (const game of manifest.games)
    for (const file of game.files) {
      const response = await h.request(game.route + file.path, {
        method: 'HEAD',
      });
      if (file.path === 'index.html') {
        assert.equal(response.status, 307);
        assert.equal(
          new URL(response.headers.location, h.base).pathname,
          game.route,
        );
      } else assert.equal(response.status, 200, game.id + '/' + file.path);
      if (/\.woff2?$/.test(file.path))
        assert.match(response.headers['content-type'], /font\//);
    }
  assert.equal(
    (await h.request(manifest.sharedEngine.path, {method: 'HEAD'})).status,
    200,
  );
  assert.equal(
    (await h.request('/games/random-eras/package.json')).status,
    404,
  );
  assert.equal((await h.request('/games/random-eras/.env')).status, 404);
});
