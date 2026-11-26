import test from 'node:test';
import assert from 'node:assert/strict';
import {FixedStepScheduler} from '../server/runtime/scheduler.mjs';
import {RuntimeMetrics} from '../server/runtime/metrics.mjs';
import {decodeInputFrame} from '../dist/network-protocol.js';
import {ServerInputs} from '../server/input/player-inputs.mjs';
import {handleAPI} from '../server/http/api.mjs';
import {createGameServer} from '../server/index.mjs';
import {tls,secureFetch} from './helpers/secure-server.mjs';

test('Node HTTPS returns bounded API errors without dropping the response connection',async t=>{
 const app=createGameServer({tls,tick:false});t.after(()=>app.close());const address=await app.listen(0),base='https://127.0.0.1:'+address.port;
 const response=await secureFetch(base+'/api/session',{method:'POST',body:'x'.repeat(5000)});
 assert.equal(response.status,413);assert.equal((await response.json()).error,'Request too large.');
 assert.equal((await secureFetch(base+'/api/session',{method:'POST'})).status,201);
 const config=await (await secureFetch(base+'/server-config.json')).json();assert.equal(config.capabilities.physicsHz,120);assert.deepEqual(config.capabilities.modes,['duel','doubles','free','training','custom','hoops']);
});
test('long scheduling stalls have bounded work, fresh publishes and recover short debt', () => {
  const scheduler = new FixedStepScheduler(),
    events = [];
  scheduler.reset(0);
  const simulate = (dt) => {
      assert.equal(dt, 1 / 120);
      events.push('tick');
    },
    publish = () => events.push('publish');
  const first = scheduler.advance(140, true, simulate, publish);
  assert.equal(first.steps, 12);
  assert.equal(first.discarded, 0);
  assert.equal(events.at(-1), 'publish');
  assert.equal(events.filter((x) => x === 'publish').length, 1);
  const second = scheduler.advance(148.333333, true, simulate, publish);
  assert.equal(second.steps, 5);
  assert.ok(second.debt < 1 / 120);
  const stalled = scheduler.advance(2000, true, simulate, publish);
  assert.equal(stalled.steps, 12);
  assert.ok(stalled.discarded > 1);
  scheduler.advance(10000, false, simulate, publish);
  scheduler.reset(10000);
  assert.equal(scheduler.advance(10000, true, simulate, publish).steps, 0);
});
test('metrics use a bounded window and expose aggregate timings only', () => {
  const metrics = new RuntimeMetrics();
  for (let i = 0; i < 1000; i++)
    metrics.record({steps: 1, discarded: 0, debt: 0.002}, i % 10);
  const snapshot = metrics.snapshot();
  assert.equal(metrics.costs.length, 120);
  assert.equal(metrics.count, 120);
  assert.equal(snapshot.physicsSteps, 1000);
  assert.equal(snapshot.debtMs, 2);
  assert.equal(snapshot.callbackP95Ms, 9);
  assert.ok(!/name|token|address|secret|room/i.test(JSON.stringify(snapshot)));
});
test('shared input decoder rejects malformed packed data without poisoning subsequent controls', () => {
  for (const frame of [
    null,
    false,
    1,
    {},
    [1, 0, 0, 0, 0, 8, 0.5],
    [1, 0, Infinity, 0, 0, 0, 0.5],
    [1, 0, 0, 0, 0, 0.5, 0.5],
  ]) {
    if (frame && Object.keys(frame).length === 0) continue;
    assert.equal(decodeInputFrame(frame), null);
  }
  const remote = new ServerInputs();
  assert.equal(remote.receive([[1, 1, 0, 0, 0, 8, 0.5]], 0), false);
  assert.equal(remote.receive([[2, 2, -2, 0, 0, 3, 0.5]], 0), true);
  const controls = remote.next(1);
  assert.equal(controls.throttle, 1);
  assert.equal(controls.steer, -1);
  assert.equal(controls.jump, true);
  assert.equal(controls.boost, true);
});
test('shared API bounds streamed bodies, handles split UTF-8 and binds tickets to the origin', async () => {
  const base = {
    method: 'POST',
    origin: 'https://game.test',
    serverOrigin: 'https://server.test',
    address: 'test',
    authorization: 'Bearer credential',
    service: {
      auth: {
        permit: () => true,
        ticket: (token, origin) => ({
          ticket:
            token === 'credential' && origin === 'https://game.test'
              ? 'safe'
              : 'wrong',
        }),
      },
    },
  };
  const ticket = await handleAPI({...base, path: '/api/ticket'});
  assert.equal(ticket.status, 200);
  assert.equal(ticket.data.ticket, 'safe');
  assert.equal(ticket.headers['Cache-Control'], 'no-store');
  async function* oversized() {
    yield new Uint8Array(3000);
    yield new Uint8Array(2000);
  }
  assert.equal(
    (await handleAPI({...base, path: '/api/session', body: oversized()}))
      .status,
    413,
  );
  const bytes = new TextEncoder().encode('{"name":"🎮 Driver"}');
  async function* split() {
    for (const value of bytes) yield new Uint8Array([value]);
  }
  const social = await handleAPI({
    ...base,
    path: '/api/social',
    body: split(),
    social: {handle: async (body) => ({status: 200, data: body})},
  });
  assert.equal(social.data.name, '🎮 Driver');
  assert.equal(
    (await handleAPI({...base, method: 'GET', path: '/api/ticket'})).status,
    405,
  );
});
