import {CAPABILITIES} from '../runtime/capabilities.mjs';
import {handleAPI, jsonHeaders} from '../http/api.mjs';
import {DurableObject} from 'cloudflare:workers';
import {GameService} from '../runtime/game-service.mjs';
import {SocialService} from '../social/service.mjs';
import {NET_BUILD} from '../../dist/network-protocol.js';

const dynamicPath = (path) =>
  path === '/multiplayer' ||
  path === '/health' ||
  path === '/server-config.json' ||
  path.startsWith('/api/');
function json(status, value, origin) {
  return new Response(JSON.stringify(value), {
    status,
    headers: jsonHeaders(origin),
  });
}

// One shared physics/matchmaking authority. Static assets stay on Cloudflare's
// edge; all players reach this named object so they can find each other.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:')
      return json(426, {error: 'HTTPS is required.'});
    if (!dynamicPath(url.pathname)) return env.ASSETS.fetch(request);
    // A location hint is best effort, not a promise of an Australian data centre.
    const id = env.ARENA.idFromName('flyingcarsforfun-oceania-v1');
    return env.ARENA.get(id, {locationHint: 'oc'}).fetch(request);
  },
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
      region: 'oceania (location requested)',
    });
    this.social = new SocialService({
      store: ctx.storage,
      room: (code) => this.service.rooms.get(code),
    });
  }
  async fetch(request) {
    const url = new URL(request.url),
      origin = request.headers.get('Origin') || '';
    if (url.protocol !== 'https:')
      return json(426, {error: 'HTTPS is required.'});
    const originOK =
      !origin || origin === url.origin || this.allowedOrigins.includes(origin);
    if (url.pathname === '/health' && request.method === 'GET')
      return json(200, {
        ok: true,
        build: NET_BUILD,
        region: this.service.region,
        rooms: this.service.rooms.size,
        queued: this.service.queue.waiting.size,
        runtime: this.service.metrics.snapshot(),
      });
    if (url.pathname === '/server-config.json' && request.method === 'GET')
      return json(200, {
        build: NET_BUILD,
        server: url.origin,
        region: this.service.region,
        social: true,
        capabilities: CAPABILITIES,
      });
    if (!originOK) return json(403, {error: 'Origin is not allowed.'});
    if (url.pathname.startsWith('/api/'))
      return this.authRequest(request, url, origin);
    if (url.pathname === '/multiplayer') {
      if (
        request.method !== 'GET' ||
        request.headers.get('Upgrade')?.toLowerCase() !== 'websocket' ||
        url.search
      )
        return json(426, {
          error: 'Use a secure WebSocket without query parameters.',
        });
      if (this.service.sockets.size >= 128)
        return json(503, {error: 'The server is full.'});
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      this.service.accept(server, origin);
      return new Response(null, {status: 101, webSocket: client});
    }
    return json(404, {error: 'Not found.'});
  }
  async authRequest(request, url, origin) {
    const result = await handleAPI({
      method: request.method,
      path: url.pathname,
      origin,
      serverOrigin: url.origin,
      address: request.headers.get('CF-Connecting-IP') || 'unknown',
      authorization: request.headers.get('Authorization') || '',
      body: request.body,
      service: this.service,
      social: this.social,
    });
    return new Response(
      result.data === undefined ? null : JSON.stringify(result.data),
      {
        status: result.status,
        headers: result.headers,
      },
    );
  }
}
