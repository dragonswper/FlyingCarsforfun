import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {request} from 'node:https';
import WebSocket from 'ws';
import {ServerLink} from '../../dist/server-link.js';
import {ServerCredentials} from '../../dist/server-auth.js';
// Tests trust this ephemeral certificate explicitly; TLS verification stays on.
const dir = mkdtempSync(join(tmpdir(), 'boost-tls-'));
let tls;
try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1'
    ],
    {stdio: 'ignore'}
  );
  tls = {key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem'))};
} finally {
  rmSync(dir, {recursive: true, force: true});
}
export {tls};
export function secureFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {method: options.method || 'GET', headers: options.headers, ca: tls.cert},
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            json: async () => JSON.parse(text),
            text: async () => text,
            headers: res.headers
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
export class TrustedSocket extends WebSocket {
  constructor(url, options = {}) {
    super(url, {...options, ca: tls.cert});
  }
}
export class TrustedLink extends ServerLink {
  constructor(url, options) {
    super(url, {...options, WebSocketClass: TrustedSocket});
  }
}
export const credentials = (endpoint) => new ServerCredentials(endpoint, {fetcher: secureFetch});
