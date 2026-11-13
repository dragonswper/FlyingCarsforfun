import {createServer as createHTTPServer} from 'node:http';
import {createServer as createHTTPSServer} from 'node:https';
import {readFileSync, createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {NET_BUILD, MAX_PACKET} from '../dist/network-protocol.js';
import {GameService} from './game-service.mjs';
export {ServerSession} from './session.mjs';
const ROOT = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

export function createGameServer({
  root = ROOT,
  maxRooms = 8,
  allowedOrigins = ['https://boost-circuit-arena.bobistheman2049.chatgpt.site'],
  tls = null,
  tlsProxy = false,
  publicOrigin = null,
  tick = true,
  region = 'singapore',
  queueClock
} = {}) {
  if (!tls && !tlsProxy)
    throw Error(
      'TLS is required. Supply TLS_CERT_FILE/TLS_KEY_FILE, or explicitly configure a trusted HTTPS ingress. See docs/dedicated-server.md.'
    );
  if (tlsProxy && (!publicOrigin || !/^https:\/\/[^/]+$/.test(publicOrigin)))
    throw Error('A trusted TLS proxy requires an explicit HTTPS PUBLIC_ORIGIN.');
  const service = new GameService({maxRooms, region, queueClock, autostart: tick});
  const {rooms, bindings, sockets, auth, queue} = service;
  let closed = false;
  const secure = (request) =>
    !!request.socket.encrypted || (tlsProxy && request.headers['x-forwarded-proto'] === 'https');
  const originOK = (request) =>
    !request.headers.origin ||
    request.headers.origin === publicOrigin ||
    request.headers.origin === 'https://' + request.headers.host ||
    allowedOrigins.includes(request.headers.origin);
  const json = (response, status, data, origin) => {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {})
    });
    response.end(JSON.stringify(data));
  };
  const httpHandler = async (request, response) => {
    const origin = request.headers.origin;
    // The provider's health probe may be local HTTP. It carries no game data.
    let url;
    try {
      url = new URL(request.url, 'https://localhost');
    } catch {
      json(response, 400, {error: 'Invalid URL.'});
      return;
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      json(response, 200, {
        ok: true,
        build: NET_BUILD,
        region,
        rooms: rooms.size,
        queued: queue.waiting.size
      });
      return;
    }
    if (!secure(request)) {
      json(response, 426, {error: 'HTTPS is required.'});
      return;
    }
    if (url.pathname === '/server-config.json' && request.method === 'GET') {
      json(response, 200, {
        build: NET_BUILD,
        server: publicOrigin || 'https://' + request.headers.host,
        region
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!originOK(request)) {
        json(response, 403, {error: 'Origin is not allowed.'});
        return;
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin':
            origin || publicOrigin || 'https://' + request.headers.host,
          Vary: 'Origin',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600'
        });
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        json(response, 405, {error: 'Use POST.'}, origin);
        return;
      }
      if (!auth.permit(request.socket.remoteAddress)) {
        json(response, 429, {error: 'Too many authentication requests. Wait a minute.'}, origin);
        return;
      }
      let size = 0;
      try {
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4096) {
            json(response, 413, {error: 'Request too large.'}, origin);
            return;
          }
        }
      } catch {
        return;
      }
      if (url.pathname === '/api/session') {
        try {
          json(response, 201, auth.issue(), origin);
        } catch {
          json(response, 503, {error: 'Guest sessions are full. Try later.'}, origin);
        }
        return;
      }
      if (url.pathname === '/api/ticket') {
        const header = request.headers.authorization || '',
          token = header.startsWith('Bearer ') ? header.slice(7) : '',
          ticket = auth.ticket(token, origin || '');
        json(
          response,
          ticket ? 200 : 401,
          ticket || {error: 'Guest session expired. Reconnect to get a new session.'},
          origin
        );
        return;
      }
      json(response, 404, {error: 'Not found.'}, origin);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405);
      response.end();
      return;
    }
    let path;
    try {
      path = resolve(
        root,
        '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
      );
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (!path.startsWith(resolve(root) + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const info = await stat(path);
      if (!info.isFile()) throw Error();
      response.writeHead(200, {
        'Content-Type': MIME[extname(path)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=31536000'
      });
      if (request.method === 'HEAD') response.end();
      else
        createReadStream(path)
          .on('error', () => response.destroy())
          .pipe(response);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  };
  const server = tls
      ? createHTTPSServer({...tls, minVersion: 'TLSv1.2'}, httpHandler)
      : createHTTPServer(httpHandler),
    wss = new WebSocketServer({noServer: true, maxPayload: MAX_PACKET, perMessageDeflate: false});
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'https://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (!secure(request) || !originOK(request) || url.pathname !== '/multiplayer' || url.search) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (sockets.size >= 128) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
  wss.on('connection', (socket, request) => service.accept(socket, request.headers.origin || ''));
  const pump = () => service.pump();
  return {
    server,
    rooms,
    bindings,
    queue,
    pump,
    async listen(port = 8787, host = '127.0.0.1') {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, resolve);
      });
      return server.address();
    },
    async close() {
      if (closed) return;
      closed = true;
      service.close();
      await new Promise((resolve) => wss.close(resolve));
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let app;
  try {
    const tls =
      process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE
        ? {
            cert: readFileSync(process.env.TLS_CERT_FILE),
            key: readFileSync(process.env.TLS_KEY_FILE)
          }
        : null;
    const tlsProxy =
      (process.env.TLS_PROXY === 'render' && process.env.RENDER === 'true') ||
      process.env.TLS_PROXY === 'trusted';
    app = createGameServer({
      tls,
      tlsProxy,
      publicOrigin: process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || null,
      region: process.env.SERVER_REGION || 'singapore',
      maxRooms: Math.max(1, Math.min(64, Number(process.env.MAX_ROOMS) || 8)),
      allowedOrigins: (
        process.env.ALLOWED_ORIGINS || 'https://boost-circuit-arena.bobistheman2049.chatgpt.site'
      )
        .split(',')
        .map((value) => value.trim())
    });
    const address = await app.listen(
      Number(process.env.PORT) || 8787,
      process.env.BIND_ADDRESS || '127.0.0.1'
    );
    console.log(`Boost Circuit secure game service listening on port ${address.port}.`);
  } catch {
    console.error(
      'Server startup failed. Check the TLS/proxy configuration and listener settings in docs/dedicated-server.md.'
    );
    process.exitCode = 1;
    await app?.close();
  }
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => app?.close().then(() => process.exit()));
}
