// Run only against an idle server you own. Uses synthetic test lobbies and
// closes only its own sockets; never resets a Durable Object or real matches.
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

const endpoint = serverEndpoint(
  process.argv[2] || process.env.BOOST_CIRCUIT_SERVER_URL,
);
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
    headers: {...options.headers, Origin: base},
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
    onChat: (message) => messages.push({recipient: name, ...message}),
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
  assert.equal(initial.build, NET_BUILD, 'Deploy matching source first');
  if (initial.rooms || initial.queued)
    throw Error('Server busy; no test sessions created.');
  async function pair(label) {
    const a = client(label + ' Lead'),
      b = client(label + ' Friend');
    a.create(
      {
        mode: 'custom',
        maxPeople: 8,
        rules: {gravity: 'low', ball: 'large', boost: 'unlimited'},
        botStyle: 'keeper',
      },
      {...a.testLook, style: {wheels: 'gold', decal: 'chevron'}},
    );
    await until(() => a.admitted, 'party owner');
    b.join(a.invite, b.testLook);
    await until(() => a.members.length === 2 && b.admitted, 'friend join');
    for (const c of [a, b]) {
      c.chooseTeam(0);
      c.setReady(true);
    }
    await until(
      () => a.members.every((m) => m.ready && m.team === 0),
      'party ready',
    );
    return [a, b];
  }
  const privatePair = await pair('Overdrive Rules');
  privatePair[0].startMatch();
  await until(
    () => privatePair.every((c) => c.active),
    'private mutator match',
  );
  for (const c of privatePair) {
    assert.equal(c.sim.rules.gravity, C.gravity / 2);
    assert.equal(c.sim.ball.radius, C.ballRadius * 1.5);
    assert.equal(c.sim.rules.unlimited, true);
    assert.equal(c.sim.cars[0].appearance.style.wheels, 'gold');
  }
  await drive(privatePair, 1.5);
  assert.equal(await release(), true, 'private fixture cleanup');
  checks.push('authoritative private mutators and shared garage style');
  const a = await pair('Overdrive Alpha'),
    b = await pair('Overdrive Beta');
  a[0].queueParty({mode: 'hoops'}, {region: 'oceania'});
  b[0].queueParty({mode: 'hoops'}, {region: 'oceania'});
  await until(
    () => [...a, ...b].every((c) => c.active),
    'four-player party Hoops',
  );
  for (const c of [...a, ...b]) {
    assert.equal(c.code, a[0].code);
    assert.equal(c.sim.options.mode, 'hoops');
    assert.equal(c.sim.options.arena, 'skyline');
    assert.equal(c.sim.cars.length, 4);
    assert.ok(c.sim.cars.every((car) => !car.bot));
    assert.equal(c.sim.rules.gravity, C.gravity);
  }
  assert.equal(a[0].self.team, a[1].self.team);
  assert.equal(b[0].self.team, b[1].self.team);
  assert.notEqual(a[0].self.team, b[0].self.team);
  await drive([...a, ...b], 2);
  assert.equal(await release(), true, 'party fixture cleanup');
  checks.push(
    'two whole parties on opposing teams in online Hoops with standard physics',
    'all synthetic lobbies and searches cleaned up',
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({result: 'LIVE OVERDRIVE PASS', build: NET_BUILD, checks}),
  );
} finally {
  closing = true;
  for (const room of clients) room.close();
  agent?.destroy();
}
