import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createGameServer} from './adapters/node.mjs';
import {FileProfileStore} from './storage/file-profile-store.mjs';
export async function runServer() {
  let app;
  try {
    const tls =
      process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE
        ? {
            cert: readFileSync(process.env.TLS_CERT_FILE),
            key: readFileSync(process.env.TLS_KEY_FILE),
          }
        : null;
    const tlsProxy =
      (process.env.TLS_PROXY === 'render' && process.env.RENDER === 'true') ||
      process.env.TLS_PROXY === 'trusted';
    app = createGameServer({
      tls,
      tlsProxy,
      publicOrigin:
        process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || null,
      region: process.env.SERVER_REGION || 'singapore',
      socialStore: new FileProfileStore(
        process.env.SOCIAL_DATA_DIR || resolve('.social-data'),
      ),
      maxRooms: Math.max(1, Math.min(64, Number(process.env.MAX_ROOMS) || 8)),
      allowedOrigins: (
        process.env.ALLOWED_ORIGINS ||
        'https://boost-circuit-arena.bobistheman2049.chatgpt.site'
      )
        .split(',')
        .map((value) => value.trim()),
    });
    const address = await app.listen(
      Number(process.env.PORT) || 8787,
      process.env.BIND_ADDRESS || '127.0.0.1',
    );
    console.log(
      `Boost Circuit secure game service listening on port ${address.port}.`,
    );
  } catch {
    console.error(
      'Server startup failed. Check the TLS/proxy configuration and listener settings in docs/dedicated-server.md.',
    );
    process.exitCode = 1;
    await app?.close();
  }
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app?.close().then(() => process.exit()));
}
