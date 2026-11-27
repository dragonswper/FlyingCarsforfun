import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGameServer } from '../scripts/serve.mjs';

test('serves the game and local engine while denying files outside the game and non-read methods', async t => {
  const server = createGameServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /id="ready-button"/);
  const engine = await fetch(`${base}/vendor/babylon.js`, { method: 'HEAD' });
  assert.equal(engine.status, 200);
  assert.ok(Number(engine.headers.get('content-length')) > 1000000);
  assert.equal(await engine.text(), '');
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST', body: 'not a server command' })).status, 405);
  const raw = pathname => new Promise((resolve, reject) => {
    const req = http.get(base + pathname, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(await raw('/%2e%2e%2fpackage.json'), 403);
  assert.equal(await raw('/%00'), 400);
  assert.equal(await raw('/%E0%A4%A'), 400);
  assert.equal(await raw('/%5c..%5cpackage.json'), 400);
});
