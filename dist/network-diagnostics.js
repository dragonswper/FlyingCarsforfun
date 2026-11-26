// HTTP route samples are kept separate from the in-game WebSocket round trip.
// This tool needs no profile, credential, IP lookup or location permission.
export function diagnosticOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error(
      'Enter an HTTPS server address without credentials or query parameters.',
    );
  return url.origin;
}
export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return Math.round(
    sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2,
  );
}
async function probe(base, path, {fetcher, now, signal, count}) {
  const samples = [],
    colos = new Set();
  for (let i = 0; i <= count; i++) {
    if (signal?.aborted)
      throw new DOMException('Test cancelled.', 'AbortError');
    const controller = new AbortController(),
      cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(cancel, 4000);
    try {
      const at = now(),
        response = await fetcher(base + path, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          signal: controller.signal,
        });
      if (!response.ok)
        throw Error('The endpoint is unavailable (' + response.status + ').');
      const raw = await response.text();
      if (raw.length > 16384) throw Error('Unexpected diagnostic response.');
      const data = JSON.parse(raw),
        ms = Math.max(0, now() - at);
      if (path === '/edge-ping' && data.scope !== 'edge')
        throw Error('This server does not expose an edge test.');
      if (
        path === '/health' &&
        !/^boost-circuit-\d+\.\d+\.\d+$/.test(data.build)
      )
        throw Error('This address is not a game server.');
      // Discard the first request, which can include DNS/TLS connection setup.
      if (i) {
        samples.push(ms);
        if (/^[A-Z]{3}$/.test(data.colo)) colos.add(data.colo);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  return {
    ms: median(samples),
    minMs: Math.round(Math.min(...samples)),
    maxMs: Math.round(Math.max(...samples)),
    samples: samples.length,
    colos: [...colos],
  };
}
export async function runNetworkDiagnostics(
  address,
  {
    fetcher = globalThis.fetch,
    now = () => performance.now(),
    signal,
    count = 5,
  } = {},
) {
  const base = diagnosticOrigin(address),
    options = {
      fetcher,
      now,
      signal,
      count: Math.max(3, Math.min(7, Math.round(Number(count) || 5))),
    };
  const outcomes = await Promise.allSettled([
    probe(base, '/edge-ping', options),
    probe(base, '/health', options),
  ]);
  if (signal?.aborted) throw new DOMException('Test cancelled.', 'AbortError');
  return {
    edge: outcomes[0].status === 'fulfilled' ? outcomes[0].value : null,
    server: outcomes[1].status === 'fulfilled' ? outcomes[1].value : null,
  };
}
export function routeAdvice({edge, server}) {
  if (!server)
    return 'The game server could not be measured. Check its HTTPS address and try again.';
  if (edge && edge.ms > 50)
    return 'The route to the Cloudflare entry point already exceeds the 25–50 ms goal. The game server adds its own route. An Australian entry point and nearby Australian game hosting are needed to aim for that range.';
  if (edge && server.ms > edge.ms + 50)
    return 'The entry point is relatively close, but the game-server route adds substantial delay. Cloudflare’s Oceania hint does not prove the game authority is in Australia.';
  if (server.ms > 50)
    return 'The measured game-server route exceeds the 25–50 ms goal. Nearby hosting and a direct route are needed; graphics settings cannot remove this network delay.';
  return 'The HTTPS samples are within the target range. Compare them with the in-game Game ping: WebSocket scheduling and an overloaded or background tab can add delay.';
}
