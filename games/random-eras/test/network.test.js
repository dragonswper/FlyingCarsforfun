import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeDescription, encodeDescription, parseMessage, smoothRemoteMovement } from '../src/network.js';

const id = '315eac9ddc1a3a11ee1e650a';
const sdp = 'v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
  'a=candidate:copy 1 udp 123 192.0.2.1 4999 typ host\r\n'.repeat(18);

test('direct codes compress and round trip the exact description', async () => {
  const code = await encodeDescription({ type: 'offer', sdp }, id);
  assert.ok(code.length < sdp.length);
  assert.deepEqual(await decodeDescription(code, 'offer'), { description: { type: 'offer', sdp }, sessionId: id });
  await assert.rejects(decodeDescription(code, 'answer'), /complete Arena response/);
  await assert.rejects(decodeDescription(code.replace('RE4', 'RE2'), 'offer'), /another build/);
  await assert.rejects(decodeDescription(`RE4.offer.${id}.gc29tZSBub25zZW5zZQ`, 'offer'), /complete Arena invite/);
  const large = await encodeDescription({ type: 'offer', sdp: sdp.repeat(40) }, id);
  await assert.rejects(decodeDescription(large, 'offer'), /complete Arena invite/);
});

test('the transport drops malformed and oversized messages', () => {
  for (const value of ['{', 'null', '[]', '{}', '{"type":0}', 'x'.repeat(32001), 42]) {
    assert.equal(parseMessage(value), null);
  }
  assert.deepEqual(parseMessage('{"type":"ready","ready":true}'), { type: 'ready', ready: true });
});

test('late movement packets fade toward rest and invalid axes cannot move a fighter', () => {
  const axes = { moveX: 0, moveZ: 0 };
  smoothRemoteMovement(axes, { moveX: 100, moveZ: NaN }, 50, 1 / 60);
  assert.ok(axes.moveX > 0 && axes.moveX < 1);
  const before = axes.moveX;
  smoothRemoteMovement(axes, { moveX: 100 }, 500, 1 / 60);
  assert.ok(axes.moveX < before);
  assert.equal(axes.moveZ, 0);
});
