import {
  diagnosticOrigin,
  routeAdvice,
  runNetworkDiagnostics,
} from './network-diagnostics.js';
const node = (id) => document.getElementById(id),
  cities = {
    SIN: 'Singapore',
    SYD: 'Sydney',
    BNE: 'Brisbane',
    MEL: 'Melbourne',
    PER: 'Perth',
    ADL: 'Adelaide',
    AKL: 'Auckland',
    CHC: 'Christchurch',
    WLG: 'Wellington',
    DFW: 'Dallas',
    LAX: 'Los Angeles',
    IAD: 'Ashburn',
    SJC: 'San Jose',
    SEA: 'Seattle',
    NRT: 'Tokyo',
    HKG: 'Hong Kong',
  };
node('server').value = location.origin;
let controller = null,
  report = null;
node('test-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (controller) return;
  try {
    const origin = diagnosticOrigin(node('server').value);
    controller = new AbortController();
    node('run').disabled = true;
    node('server').disabled = true;
    node('cancel').hidden = false;
    node('results').hidden = true;
    node('status').textContent =
      'Measuring both routes… Keep this page visible.';
    const result = await runNetworkDiagnostics(origin, {
      signal: controller.signal,
    });
    node('edge-time').textContent = result.edge
      ? result.edge.ms + ' ms'
      : 'Unavailable';
    node('server-time').textContent = result.server
      ? result.server.ms + ' ms'
      : 'Unavailable';
    const colos = result.edge?.colos || [];
    node('colo').textContent = colos.length
      ? colos.map((c) => c + (cities[c] ? ' · ' + cities[c] : '')).join(' / ')
      : 'Entry-point identifier unavailable';
    node('advice').textContent = routeAdvice(result);
    node('status').textContent =
      'Test complete. These are HTTPS medians; the first connection request was discarded.';
    node('results').hidden = false;
    node('copy-status').textContent = '';
    report = {
      test: 'Boost Circuit route check',
      ...result,
      scope:
        'HTTPS samples; separate from in-game WebSocket RTT. Entry point is not authority location.',
    };
  } catch (error) {
    node('status').textContent =
      error.name === 'AbortError' ? 'Test cancelled.' : error.message;
  } finally {
    controller = null;
    node('run').disabled = false;
    node('server').disabled = false;
    node('cancel').hidden = true;
  }
});
node('cancel').onclick = () => controller?.abort();
window.addEventListener('pagehide', () => controller?.abort());
node('copy').onclick = async () => {
  if (!report) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    node('copy-status').textContent =
      'Copied the timing results. No IP address or account details included.';
  } catch {
    node('copy-status').textContent =
      'Clipboard access is unavailable. You can read the two timing numbers above.';
  }
};
