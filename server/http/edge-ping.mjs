import {jsonHeaders} from './api.mjs';
// Stateless: never instantiate the physics object, authenticate, or return an IP.
export function edgePing(request, allowedOrigins = '') {
  const url = new URL(request.url),
    origin = request.headers.get('Origin') || '';
  const allowed =
    !origin ||
    origin === url.origin ||
    String(allowedOrigins)
      .split(',')
      .map((s) => s.trim())
      .includes(origin);
  const status = !allowed ? 403 : request.method !== 'GET' ? 405 : 200;
  const colo = /^[A-Z]{3}$/.test(request.cf?.colo) ? request.cf.colo : null;
  return new Response(
    JSON.stringify(
      status === 200
        ? {scope: 'edge', colo}
        : {error: status === 403 ? 'Origin is not allowed.' : 'Use GET.'},
    ),
    {status, headers: jsonHeaders(allowed && origin ? origin : undefined)},
  );
}
