import {NET_BUILD} from '../../dist/network-protocol.js';
import {CAPABILITIES} from '../runtime/capabilities.mjs';
// Admin APIs are same-origin only, including when the game permits another
// frontend origin. No cross-origin CORS grant can confer administrative access.
export async function handleAdmin({
  method,
  path,
  origin,
  serverOrigin,
  cookieHeader,
  address,
  contentType = '',
  body,
  admin,
  service,
}) {
  const reply = (status, data, setCookies = []) => ({status, data, setCookies});
  if (origin && origin !== serverOrigin)
    return reply(403, {error: 'Open admin on the game server itself.'});
  if (!['GET', 'POST'].includes(method))
    return reply(405, {error: 'Method not allowed.'});
  if (!service.auth.permit(address))
    return reply(429, {error: 'Too many requests. Try again shortly.'});
  if (path === '/api/admin/overview') {
    if (method !== 'GET') return reply(405, {error: 'Use GET.'});
    try {
      if (!(await admin.authenticated(cookieHeader)))
        return reply(401, {error: 'Admin login is required.'});
    } catch {
      return reply(503, {
        error: 'Admin authentication is temporarily unavailable.',
      });
    }
    return reply(200, {
      build: NET_BUILD,
      rooms: service.rooms.size,
      queued: service.queue.waiting.size,
      runtime: service.metrics.snapshot(),
      capabilities: CAPABILITIES,
    });
  }
  let data = {};
  if (method === 'POST') {
    if (
      origin !== serverOrigin ||
      contentType.split(';')[0].trim().toLowerCase() !== 'application/json'
    )
      return reply(403, {error: 'Use the secure admin form.'});
    let raw = '',
      size = 0;
    const decoder = new TextDecoder();
    try {
      if (body)
        for await (const chunk of body) {
          size += chunk.byteLength;
          if (size > 1024) return reply(413, {error: 'Request too large.'});
          raw += decoder.decode(chunk, {stream: true});
        }
      raw += decoder.decode();
      data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw Error();
    } catch {
      return reply(400, {error: 'Invalid request body.'});
    }
  }
  try {
    return await admin.handle({
      method,
      path,
      origin,
      serverOrigin,
      cookieHeader,
      address,
      body: data,
    });
  } catch {
    return reply(503, {
      error: 'Admin authentication is temporarily unavailable.',
    });
  }
}
export function adminJSON(result, ResponseClass = Response) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const value of result.setCookies || [])
    headers.append('Set-Cookie', value);
  return new ResponseClass(JSON.stringify(result.data), {
    status: result.status,
    headers,
  });
}
