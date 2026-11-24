import {CAPABILITIES} from '../runtime/capabilities.mjs';
import {handleAPI, jsonHeaders} from '../http/api.mjs';
import {createServer as createHTTPServer} from 'node:http';
import {createServer as createHTTPSServer} from 'node:https';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import {NET_BUILD, MAX_PACKET} from '../../dist/network-protocol.js';
import {GameService} from '../runtime/game-service.mjs';
import {SocialService} from '../social/service.mjs';
export {ServerSession} from '../session/session.mjs';
const ROOT = fileURLToPath(new URL('../../dist/', import.meta.url));
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
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
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
  queueClock,
  arenaRandom,
  socialStore = null,
} = {}) {
  if (!tls && !tlsProxy)
    throw Error(
      'TLS is required. Supply TLS_CERT_FILE/TLS_KEY_FILE, or explicitly configure a trusted HTTPS ingress. See docs/dedicated-server.md.',
    );
  if (tlsProxy && (!publicOrigin || !/^https:\/\/[^/]+$/.test(publicOrigin)))
    throw Error(
      'A trusted TLS proxy requires an explicit HTTPS PUBLIC_ORIGIN.',
    );
  const service = new GameService({
    maxRooms,
    region,
    queueClock,
    arenaRandom,
    autostart: tick,
  });
  const {rooms, bindings, sockets, auth, queue} = service;
  const social = new SocialService({
    store: socialStore,
    room: (code) => rooms.get(code),
  });
  let closed = false;
  const secure = (request) =>
    !!request.socket.encrypted ||
    (tlsProxy && request.headers['x-forwarded-proto'] === 'https');
  const originOK = (request) =>
    !request.headers.origin ||
    request.headers.origin === publicOrigin ||
    request.headers.origin === 'https://' + request.headers.host ||
    allowedOrigins.includes(request.headers.origin);
  const json = (response, status, data, origin) => {
    response.writeHead(status, jsonHeaders(origin));
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
        queued: queue.waiting.size,
        runtime: service.metrics.snapshot(),
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
        region,
        social: true,
        capabilities: CAPABILITIES,
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (!originOK(request)) {
        json(response, 403, {error: 'Origin is not allowed.'});
        return;
      }
      const result = await handleAPI({
        method: request.method,
        path: url.pathname,
        origin: origin || '',
        serverOrigin: publicOrigin || 'https://' + request.headers.host,
        address: request.socket.remoteAddress,
        authorization: request.headers.authorization || '',
        body: request,
        service,
        social,
      });
      response.writeHead(result.status, result.headers);
      response.end(
        result.data === undefined ? undefined : JSON.stringify(result.data),
      );
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
        '.' +
          decodeURIComponent(
            url.pathname === '/' ? '/index.html' : url.pathname,
          ),
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
        'Strict-Transport-Security': 'max-age=31536000',
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
    wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PACKET,
      perMessageDeflate: false,
    });
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
    if (
      !secure(request) ||
      !originOK(request) ||
      url.pathname !== '/multiplayer' ||
      url.search
    ) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (sockets.size >= 128) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) =>
      wss.emit('connection', ws, request),
    );
  });
  wss.on('connection', (socket, request) =>
    service.accept(socket, request.headers.origin || ''),
  );
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
      if (server.listening)
        await new Promise((resolve) => server.close(resolve));
    },
  };
}
