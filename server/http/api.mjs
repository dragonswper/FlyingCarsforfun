// Both HTTPS adapters use this bounded API. Credentials never enter logs.
export const BODY_LIMIT = 4096;
export function jsonHeaders(origin) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(origin ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {}),
  };
}
export async function handleAPI({
  method,
  path,
  origin = '',
  serverOrigin,
  address = 'unknown',
  authorization = '',
  body,
  service,
  social,
}) {
  const reply = (status, data) => ({
    status,
    data,
    headers: jsonHeaders(origin),
  });
  if (method === 'OPTIONS')
    return {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || serverOrigin,
        Vary: 'Origin',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
      },
    };
  if (method !== 'POST') return reply(405, {error: 'Use POST.'});
  if (path !== '/api/social' && !service.auth.permit(address))
    return reply(429, {
      error: 'Too many authentication requests. Wait a minute.',
    });
  let raw = '',
    size = 0;
  const decoder = new TextDecoder();
  try {
    if (body)
      for await (const chunk of body) {
        size += chunk.byteLength;
        if (size > BODY_LIMIT) return reply(413, {error: 'Request too large.'});
        raw += decoder.decode(chunk, {stream: true});
      }
    raw += decoder.decode();
  } catch {
    return reply(400, {error: 'Invalid request body.'});
  }
  if (path === '/api/social') {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return reply(400, {error: 'Invalid request body.'});
    }
    const result = await social.handle(
      data,
      authorization.startsWith('Bearer ') ? authorization.slice(7) : '',
      address,
    );
    return reply(result.status, result.data);
  }
  if (path === '/api/session') {
    try {
      return reply(201, service.auth.issue());
    } catch {
      return reply(503, {error: 'Guest sessions are full. Try later.'});
    }
  }
  if (path === '/api/ticket') {
    const token = authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '',
      ticket = service.auth.ticket(token, origin);
    return reply(
      ticket ? 200 : 401,
      ticket || {
        error: 'Guest session expired. Reconnect to get a new session.',
      },
    );
  }
  return reply(404, {error: 'Not found.'});
}
