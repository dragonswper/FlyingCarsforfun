import test from 'node:test';
import assert from 'node:assert/strict';
import {edgePing} from '../server/http/edge-ping.mjs';
import {
  diagnosticOrigin,
  median,
  runNetworkDiagnostics,
  routeAdvice,
} from '../dist/network-diagnostics.js';
import {cloudflareServer} from './helpers/cloudflare-server.mjs';
import {NET_BUILD} from '../dist/network-protocol.js';
test('edge probe returns only an entry-point label, never IP or profile data, and respects origins/methods', async () => {
  const request = new Request('https://game.example/edge-ping', {
    headers: {Origin: 'https://game.example', 'CF-Connecting-IP': '192.0.2.1'},
  });
  Object.defineProperty(request, 'cf', {value: {colo: 'SIN', country: 'AU'}});
  const response = edgePing(request);
  assert.deepEqual(await response.json(), {scope: 'edge', colo: 'SIN'});
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://game.example',
  );
  assert.equal(
    edgePing(
      new Request(request, {headers: {Origin: 'https://unrelated.example'}}),
    ).status,
    403,
  );
  assert.equal(edgePing(new Request(request, {method: 'POST'})).status, 405);
});
test('route probes discard connection warm-up, report bounded medians, and send no credentials', async () => {
  const calls = [],
    seen = {},
    now = (() => {
      let n = 0;
      return {get: () => n, add: (v) => (n += v)};
    })();
  const fetcher = async (url, options) => {
    calls.push({url, options});
    const path = new URL(url).pathname;
    now.add(seen[path] ? 10 : 500);
    seen[path] = true;
    return Response.json(
      path === '/edge-ping' ? {scope: 'edge', colo: 'SIN'} : {build: NET_BUILD},
    );
  };
  const result = await runNetworkDiagnostics('https://game.example', {
    fetcher,
    now: now.get,
  });
  assert.equal(result.edge.samples, 5);
  assert.equal(result.server.samples, 5);
  assert.ok(result.edge.maxMs < 100 && result.server.maxMs < 100);
  assert.equal(calls.length, 12);
  assert.ok(
    calls.every(
      (c) =>
        c.options.credentials === 'omit' &&
        c.options.redirect === 'error' &&
        !c.options.headers,
    ),
  );
  assert.deepEqual(result.edge.colos, ['SIN']);
  assert.equal(median([100, 20, 10, 30, 40]), 30);
});
test('route advice separates entry-point latency, extra server delay and game scheduling without claiming an authority location', async () => {
  assert.match(
    routeAdvice({edge: {ms: 100}, server: {ms: 299}}),
    /entry point already exceeds/,
  );
  assert.match(
    routeAdvice({edge: {ms: 20}, server: {ms: 250}}),
    /does not prove/,
  );
  assert.match(
    routeAdvice({edge: {ms: 20}, server: {ms: 35}}),
    /Compare them with the in-game/,
  );
  assert.equal(
    diagnosticOrigin('https://game.example/multiplayer'),
    'https://game.example',
  );
  assert.throws(() => diagnosticOrigin('http://game.example'));
  assert.throws(() => diagnosticOrigin('https://secret@game.example'));
  assert.throws(() => diagnosticOrigin('https://game.example/?token=x'));
  const c = new AbortController();
  c.abort();
  await assert.rejects(
    runNetworkDiagnostics('https://game.example', {signal: c.signal}),
    {name: 'AbortError'},
  );
});
test('Cloudflare serves the stateless HTTPS edge probe and diagnostic page without creating a game room', async (t) => {
  const h = await cloudflareServer(t),
    r = await h.request('/edge-ping');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).scope, 'edge');
  assert.equal((await h.request('/health')).status, 200);
  assert.equal((await (await h.request('/health')).json()).rooms, 0);
  assert.equal((await h.request('/edge-ping', {method: 'POST'})).status, 405);
  assert.equal(
    (
      await h.request('/edge-ping', {
        headers: {Origin: 'https://unrelated.example'},
      })
    ).status,
    403,
  );
  const page = await h.request('/connection-test');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /GAME SERVER ROUTE/);
});
