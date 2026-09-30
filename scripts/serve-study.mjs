import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveCompletedSession } from './lib/session-store.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 4173;

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const requested = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(DIST, safePath === path.sep ? 'index.html' : safePath);

  if (!filePath.startsWith(DIST)) {
    send(res, 403, 'Forbidden');
    return;
  }

  const fallback = path.join(DIST, 'index.html');
  const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : fallback;
  const ext = path.extname(target);
  send(res, 200, fs.readFileSync(target), { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split('?')[0];

  if (url === '/api/sessions' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const saved = saveCompletedSession(body);
      send(res, saved.duplicate ? 200 : 201, JSON.stringify(saved), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    } catch (err) {
      send(res, 400, JSON.stringify({ error: err.message || 'Session rejected' }), {
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    return;
  }

  if (url?.startsWith('/api/')) {
    send(res, 404, JSON.stringify({ error: 'Not found' }), {
      'Content-Type': 'application/json; charset=utf-8',
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method not allowed');
    return;
  }

  serveStatic(req, res);
});

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Run npm run build first.');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Study server http://localhost:${PORT}`);
});
