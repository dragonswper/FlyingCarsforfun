import {DurableObject} from 'cloudflare:workers';
import {GameService} from './game-service.mjs';
import {NET_BUILD} from '../dist/network-protocol.js';

const dynamicPath = (path) =>
  path === '/multiplayer' ||
  path === '/health' ||
  path === '/server-config.json' ||
  path.startsWith('/api/');
function json(status, value, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(origin ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {})
    }
  });
}

// One shared physics/matchmaking authority. Static assets stay on Cloudflare's
// edge; all players reach this named object so they can find each other.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:') return json(426, {error: 'HTTPS is required.'});
    if (!dynamicPath(url.pathname)) return env.ASSETS.fetch(request);
    // A location hint is best effort, not a promise of an Australian data centre.
    const id = env.ARENA.idFromName('flyingcarsforfun-oceania-v1');
    return env.ARENA.get(id, {locationHint: 'oc'}).fetch(request);
  }
};

export class ArenaService extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.allowedOrigins = String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    this.service = new GameService({
      maxRooms: Math.max(1, Math.min(8, Number(env.MAX_ROOMS) || 1)),
      region: 'oceania (location requested)'
    });
  }
  async fetch(request) {
    const url = new URL(request.url),
      origin = request.headers.get('Origin') || '';
    if (url.protocol !== 'https:') return json(426, {error: 'HTTPS is required.'});
    const originOK = !origin || origin === url.origin || this.allowedOrigins.includes(origin);
    if (url.pathname === '/health' && request.method === 'GET')
      return json(200, {
        ok: true,
        build: NET_BUILD,
        region: this.service.region,
        rooms: this.service.rooms.size,
        queued: this.service.queue.waiting.size
      });
    if (url.pathname === '/server-config.json' && request.method === 'GET')
      return json(200, {build: NET_BUILD, server: url.origin, region: this.service.region});
    if (!originOK) return json(403, {error: 'Origin is not allowed.'});
    if (url.pathname.startsWith('/api/')) return this.authRequest(request, url, origin);
    if (url.pathname === '/multiplayer') {
      if (
        request.method !== 'GET' ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
        url.search
      )
        return json(426, {error: 'Use a secure WebSocket without query parameters.'});
      if (this.service.sockets.size >= 128) return json(503, {error: 'The server is full.'});
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.service.accept(server, origin);
      return new Response(null, {status: 101, webSocket: client});
    }
    return json(404, {error: 'Not found.'});
  }
  async authRequest(request, url, origin) {
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin || url.origin,
          Vary: 'Origin',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600'
        }
      });
    if (request.method !== 'POST') return json(405, {error: 'Use POST.'}, origin);
    // Cloudflare supplies this address. It is a short-lived in-memory rate-limit
    // key only: never an identity credential, log entry or persisted profile.
    if (!this.service.auth.permit(request.headers.get('CF-Connecting-IP') || 'unknown'))
      return json(429, {error: 'Too many authentication requests. Wait a minute.'}, origin);
    const reader = request.body?.getReader();
    let size = 0;
    if (reader)
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return json(413, {error: 'Request too large.'}, origin);
          }
        }
      } catch {
        return json(400, {error: 'Invalid request body.'}, origin);
      }
    if (url.pathname === '/api/session') {
      try {
        return json(201, this.service.auth.issue(), origin);
      } catch {
        return json(503, {error: 'Guest sessions are full. Try later.'}, origin);
      }
    }
    if (url.pathname === '/api/ticket') {
      const header = request.headers.get('Authorization') || '',
        token = header.startsWith('Bearer ') ? header.slice(7) : '',
        ticket = this.service.auth.ticket(token, origin);
      return json(
        ticket ? 200 : 401,
        ticket || {error: 'Guest session expired. Reconnect to get a new session.'},
        origin
      );
    }
    return json(404, {error: 'Not found.'}, origin);
  }
}
