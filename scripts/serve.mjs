import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

export function createGameServer(root = defaultRoot) {
  const resolvedRoot = path.resolve(root);
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method not allowed');
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid URL'); return; }
    if (pathname.includes('\0') || pathname.includes('\\')) {
      res.writeHead(400); res.end('Invalid path'); return;
    }
    const filename = path.resolve(resolvedRoot, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(resolvedRoot + path.sep)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    try {
      const info = await stat(filename);
      if (!info.isFile()) throw new Error('Not a file');
      res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length': info.size });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(filename);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portIndex = process.argv.indexOf('--port');
  const rawPort = portIndex >= 0 ? process.argv[portIndex + 1] : (process.env.PORT || '4173');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Use --port with a number from 0 to 65535.');
  const server = createGameServer();
  server.on('error', err => { console.error(`Unable to start Boost Circuit: ${err.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Boost Circuit: http://127.0.0.1:${server.address().port}`);
    console.log('Keep this window open while playing. Press Ctrl+C to stop.');
  });
}
