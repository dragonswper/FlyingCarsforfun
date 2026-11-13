import {Miniflare, Log, LogLevel} from 'miniflare';
import {mkdtempSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {tls, secureFetch, credentials, TrustedLink as Link} from './secure-server.mjs';
import {DedicatedRoom} from '../../dist/dedicated-room.js';
import {setTimeout as delay} from 'node:timers/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
mkdirSync(join(root, '.wrangler'), {recursive: true});
const output = mkdtempSync(join(root, '.wrangler', 'worker-test-'));
const build = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
    'deploy',
    '--dry-run',
    '--outdir',
    output
  ],
  {
    cwd: root,
    encoding: 'utf8',
    env: {...process.env, WRANGLER_SEND_METRICS: 'false', XDG_CONFIG_HOME: join(output, 'config')}
  }
);
if (build.status !== 0) {
  rmSync(output, {recursive: true, force: true});
  throw Error('Cloudflare test build failed: ' + build.stderr);
}
process.on('exit', () => rmSync(output, {recursive: true, force: true}));
export const config = JSON.parse(readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8'));
export const until = async (check, label, timeout = 8000) => {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) throw Error('Timed out: ' + label);
    await delay(10);
  }
};
export async function cloudflareServer(t) {
  const mf = new Miniflare({
    modules: true,
    scriptPath: join(output, 'cloudflare-worker.js'),
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags,
    durableObjects: {ARENA: {className: 'ArenaService', useSQLite: true}},
    bindings: config.vars,
    assets: {
      directory: resolve(root, config.assets.directory),
      binding: config.assets.binding,
      routerConfig: {
        has_user_worker: true,
        invoke_user_worker_ahead_of_assets: config.assets.run_worker_first
      }
    },
    https: true,
    httpsKey: tls.key.toString(),
    httpsCert: tls.cert.toString(),
    host: '127.0.0.1',
    port: 0,
    cf: false,
    log: new Log(LogLevel.ERROR)
  });
  const base = (await mf.ready).origin,
    url = base.replace('https:', 'wss:') + '/multiplayer',
    clients = [],
    errors = [],
    messages = [];
  t.after(async () => {
    for (const client of clients) client.close();
    await mf.dispose();
  });
  return {
    mf,
    base,
    url,
    errors,
    messages,
    request: (path, options) => secureFetch(base + path, options),
    client(name) {
      const client = new DedicatedRoom({
        address: url,
        Link,
        credentials: credentials(url),
        onDisconnect: (reason) => errors.push(reason),
        onChat: (message) => messages.push({recipient: name, ...message})
      });
      client.testLook = {name};
      clients.push(client);
      return client;
    }
  };
}
export async function twoPlayers(h, mode = 'custom') {
  const owner = h.client('Owner');
  owner.create({mode, maxPeople: 8}, owner.testLook);
  await until(() => owner.admitted, 'owner');
  const guest = h.client('Guest');
  guest.join(owner.invite, guest.testLook);
  await until(() => guest.admitted, 'join');
  for (const [n, client] of [owner, guest].entries()) {
    client.chooseTeam(n);
    client.setReady(true);
  }
  await until(() => owner.members.every((member) => member.team !== null && member.ready), 'ready');
  owner.startMatch();
  await until(() => owner.active && guest.active, 'match');
  return {owner, guest};
}
