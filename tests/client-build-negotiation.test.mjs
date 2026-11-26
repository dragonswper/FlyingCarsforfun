import test from 'node:test';
import assert from 'node:assert/strict';
import {ServerCredentials} from '../dist/server-auth.js';
import {ServerLink} from '../dist/server-link.js';
import {NET_BUILD} from '../dist/network-protocol.js';
test('new physics rejects pre-v1.31 servers before requesting credentials', async () => {
  const credentials = new ServerCredentials('wss://old.example/multiplayer', {
    fetcher: async () => ({
      ok: true,
      json: async () => ({build: 'boost-circuit-1.28.1'}),
    }),
  });
  await assert.rejects(credentials.checkVersion(),error=>error.code==='VERSION_MISMATCH');
  credentials.fetcher = async () => ({
    ok: true,
    json: async () => ({build: 'boost-circuit-1.20.0'}),
  });
  await assert.rejects(
    credentials.checkVersion(),
    (error) => error.code === 'VERSION_MISMATCH',
  );
});
test('only the current physics build is selected; unverified packet tags stay unmodified', () => {
  const sent = [],
    received = [];
  class Socket {
    constructor() {
      this.readyState = 1;
      this.bufferedAmount = 0;
    }
    send(raw) {
      sent.push(JSON.parse(raw));
    }
    close() {
      this.readyState = 3;
    }
  }
  const link = new ServerLink('wss://old.example/multiplayer', {
    build: 'boost-circuit-1.28.1',
    WebSocketClass: Socket,
    onPacket: (packet) => received.push(packet),
  });
  link.socket.onopen();
  const packet = {
    t: 'server-create',
    build: NET_BUILD,
    options: {mode: 'custom'},
  };
  link.send(packet);
  assert.equal(sent[0].build, NET_BUILD);
  assert.equal(packet.build, NET_BUILD);
  link.socket.onmessage({
    data: JSON.stringify({
      t: 'party-lobby',
      build: 'boost-circuit-1.28.1',
      roster: [],
    }),
  });
  assert.equal(received[0].build, 'boost-circuit-1.28.1');
  assert.equal(received[0].serverBuild, undefined);
  link.socket.onmessage({
    data: JSON.stringify({t: 'server-authenticated', build: 'unverified'}),
  });
  assert.equal(received[1].build, 'unverified');
  link.close();
});
