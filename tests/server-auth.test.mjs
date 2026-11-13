import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerCredentials} from '../dist/server-auth.js';

test('authentication calls native-style fetch with its global receiver for both requests', async () => {
  const requests = [];
  async function nativeFetch(url, options) {
    // Browser Window.fetch performs this receiver check; Node fetch does not.
    assert.equal(this, globalThis, 'Native fetch received the credentials object');
    requests.push({url, options});
    const session = url.endsWith('/session');
    return {
      ok: true,
      status: session ? 201 : 200,
      json: async () =>
        session
          ? {token: 'test-session', expires: Date.now() + 3600000}
          : {ticket: 'test-ticket', expires: Date.now() + 30000}
    };
  }
  const credentials = new ServerCredentials('wss://arena.example/multiplayer', {
    fetcher: nativeFetch
  });
  assert.equal(await credentials.ticket(), 'test-ticket');
  assert.deepEqual(
    requests.map((request) => request.url),
    ['https://arena.example/api/session', 'https://arena.example/api/ticket']
  );
  assert.equal(requests[1].options.headers.Authorization, 'Bearer test-session');
  assert.ok(requests.every((request) => request.options.credentials === 'omit'));
  assert.ok(requests.every((request) => !request.url.includes('test-session')));
});
