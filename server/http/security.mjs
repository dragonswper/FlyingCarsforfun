// Public game assets remain downloadable; authority secrets and admin data do not.
export const SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), fullscreen=(self), gamepad=(self)',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob: https: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
});
export const PRIVATE_PATH =
  /(?:^|\/)(?:\.git|\.env(?:\.[^/]*)?|\.dev\.vars(?:\.[^/]*)?|\.admin-(?:data|setup)|\.social-data|secrets|server|node_modules|certs)(?:\/|$)|\.(?:pem|key|p12|pfx|map)$/i;
export function privatePath(path) {
  try {
    return PRIVATE_PATH.test(decodeURIComponent(path));
  } catch {
    return true;
  }
}
export function secureResponse(response) {
  // A WebSocket upgrade must retain its platform-specific webSocket handle.
  if (response.status === 101) return response;
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS))
    result.headers.set(key, value);
  return result;
}
