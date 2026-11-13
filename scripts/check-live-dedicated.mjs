// A bounded public-server check. Creates only isolated test sessions, logs no
// credentials/invites/packets, and stops if the one-room service is already busy.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import WebSocket from 'ws';
import {DedicatedRoom} from '../dist/dedicated-room.js';
import {ServerLink, serverEndpoint} from '../dist/server-link.js';
import {ServerCredentials} from '../dist/server-auth.js';
import {NET_BUILD} from '../dist/network-protocol.js';
import {C} from '../dist/physics.js';

const endpoint = serverEndpoint(process.argv[2] || process.env.BOOST_CIRCUIT_SERVER_URL);
const address = new URL(endpoint);
address.protocol = 'https:';
const base = address.origin;
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
let agent;
if (proxy) {
  const directory = process.env.BOOST_CIRCUIT_RTC_TEST_DEPS;
  const require = directory
    ? createRequire(pathToFileURL(resolve(directory, 'package.json')))
    : createRequire(import.meta.url);
  const {HttpsProxyAgent} = require('https-proxy-agent');
  agent = new HttpsProxyAgent(proxy);
}
class Socket extends WebSocket {
  constructor(url) {
    super(url, {agent, origin: base, handshakeTimeout: 15000});
  }
}
class Link extends ServerLink {
  constructor(url, options) {
    super(url, {...options, WebSocketClass: Socket});
  }
}
const fetcher = (url, options = {}) =>
  fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: {...options.headers, Origin: base}
  });
const health = async () => {
  const response = await fetcher(base + '/health');
  assert.equal(response.status, 200, 'Health endpoint failed');
  return response.json();
};
const clients = [],
  errors = [],
  messages = [],
  checks = [];
let closing = false;
async function until(check, label, timeout = 25000) {
  const start = performance.now();
  while (!check()) {
    if (errors.length) throw Error(errors[0]);
    if (performance.now() - start > timeout) throw Error('Timed out: ' + label);
    await delay(20);
  }
}
function client(name) {
  const room = new DedicatedRoom({
    address: endpoint,
    Link,
    credentials: new ServerCredentials(endpoint, {fetcher}),
    onDisconnect: (reason) => {
      if (!closing) errors.push(reason);
    },
    onChat: (message) => messages.push({recipient: name, ...message})
  });
  room.testLook = {name};
  clients.push(room);
  return room;
}
async function release() {
  closing = true;
  for (const room of clients.splice(0)) room.close();
  for (let n = 0; n < 15; n++) {
    const state = await health();
    if (state.rooms === 0 && state.queued === 0) {
      closing = false;
      return true;
    }
    await delay(300);
  }
  closing = false;
  return false;
}
async function drive(rooms, seconds) {
  let previous = performance.now(),
    accumulator = 0;
  const end = previous + seconds * 1000;
  while (performance.now() < end) {
    const now = performance.now();
    accumulator = Math.min(0.1, accumulator + (now - previous) / 1000);
    previous = now;
    while (accumulator >= C.step) {
      for (const room of rooms) room.guestStep({throttle: 1});
      accumulator -= C.step;
    }
    for (const room of rooms) {
      room.sendInputs();
      room.replica.sample(now, 1 / 120);
    }
    await delay(4);
  }
  for (const room of rooms) {
    room.guestStep({});
    room.sendInputs(true);
  }
}

try {
  const initial = await health();
  assert.equal(initial.build, NET_BUILD, 'Deploy matching client/server source before testing');
  if (initial.rooms || initial.queued)
    throw Error('Server is busy. No test room was created; try again when players finish.');
  const config = await (await fetcher(base + '/server-config.json')).json();
  assert.equal(config.server, base);
  assert.equal(config.build, NET_BUILD);
  const home = await fetcher(base + '/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /CUSTOM PRIVATE LOBBY/);
  for (const path of [
    '/assets/models/champions-field-performance.glb',
    '/assets/models/fennec.glb',
    '/assets/models/rocket-ball.glb'
  ]) {
    const response = await fetcher(base + path, {method: 'HEAD'});
    assert.equal(response.status, 200, 'Required model unavailable');
  }
  checks.push('HTTPS game, matching build, automatic endpoint configuration and essential models');
  const owner = client('Server Check A'),
    guest = client('Server Check B');
  owner.create({mode: 'custom', maxPeople: 4, duration: 60}, owner.testLook);
  await until(() => owner.admitted, 'owner admission');
  guest.join(owner.invite, guest.testLook);
  await until(() => guest.admitted, 'guest admission');
  for (const [team, room] of [owner, guest].entries()) {
    room.chooseTeam(team);
    room.setReady(true);
  }
  await until(
    () => owner.members.every((member) => member.team !== null && member.ready),
    'team readiness'
  );
  owner.startMatch();
  await until(
    () =>
      owner.active &&
      guest.active &&
      owner.sim.phase === 'playing' &&
      guest.sim.phase === 'playing',
    'authoritative kickoff'
  );
  assert.deepEqual([owner.sim.localPlayerId, guest.sim.localPlayerId], [0, 1]);
  assert.equal(owner.role, 'guest');
  assert.equal(guest.role, 'guest');
  const watcher = client('Server Check Spectator');
  watcher.join(owner.invite, watcher.testLook);
  await until(() => watcher.active, 'late spectator');
  assert.equal(watcher.sim.localPlayerId, null);
  const initialPositions = [owner.sim.cars[0].p.clone(), guest.sim.cars[1].p.clone()];
  await drive([owner, guest], 1.5);
  await until(
    () =>
      owner.sim.cars[0].p.distanceTo(initialPositions[0]) > 0.25 &&
      guest.sim.cars[1].p.distanceTo(initialPositions[1]) > 0.25,
    'both authoritative cars move'
  );
  assert.ok(owner.replica.lastSequence > 10 && guest.replica.lastSequence > 10);
  assert.ok(owner.replica.inputSequence > 60 && guest.replica.inputSequence > 60);
  checks.push(
    'private BCS join, ready/start, two client-owned cars, authoritative driving and spectator'
  );
  assert.equal(guest.sendChat('Secure server connection check'), true);
  await until(
    () =>
      new Set(
        messages
          .filter((message) => message.text === 'Secure server connection check')
          .map((message) => message.recipient)
      ).size === 3,
    'shared chat'
  );
  checks.push('chat reaches both players and spectator');
  const match = guest.matchId,
    sim = guest.sim,
    elapsed = owner.sim.elapsed;
  guest.link.socket.terminate();
  await until(() => guest.recovering, 'guest connection loss');
  await until(() => guest.active && !guest.recovering, 'guest recovery');
  assert.equal(guest.matchId, match);
  assert.equal(guest.sim, sim);
  assert.ok(owner.sim.elapsed > elapsed, 'Other players stopped during recovery');
  checks.push('authenticated same-car/same-match reconnect while owner continues');
  const responsePing = [owner, guest].map(
    (room) => room.quality.summary(performance.now(), room.lastRealtimeAt).ping
  );
  if (!(await release())) throw Error('Other server activity appeared; remaining checks stopped.');
  const a = client('Match Check A'),
    b = client('Match Check B');
  // The normal UI uses a 300s queue. This valid, unusual duration isolates these
  // probes from normal people searching for a match on the public service.
  const options = {mode: 'duel', duration: 61, difficulty: 'expert'},
    network = {region: 'oceania', maxPing: 0};
  a.matchmake(a.testLook, options, network);
  await until(() => a.queueState?.phase === 'searching', 'isolated queue');
  b.matchmake(b.testLook, options, network);
  await until(() => a.active && b.active, 'two-human server matchmaking');
  assert.equal(a.matchId, b.matchId);
  assert.equal(a.code, b.code);
  assert.equal(a.canManage, false);
  assert.equal(b.canManage, false);
  assert.ok(a.sim.cars.every((car) => !car.bot));
  checks.push('two-human dedicated matchmaking without a browser host');
  const cleaned = await release();
  assert.equal(cleaned, true, 'Server rooms did not clean up');
  checks.push('test lobbies and queue released');
  console.log(
    JSON.stringify(
      {
        result: 'LIVE DEDICATED SERVER PASS',
        server: base,
        build: initial.build,
        checks,
        gamePingFromCloudWorkspaceMs: responsePing,
        scope:
          'Real public HTTPS/WSS from two automated clients in this cloud workspace; not a two-PC Australian browser/FPS test.'
      },
      null,
      2
    )
  );
} catch (error) {
  console.error('LIVE DEDICATED SERVER CHECK FAILED:', error.message);
  process.exitCode = 1;
} finally {
  closing = true;
  for (const room of clients) room.close();
  agent?.destroy();
}
