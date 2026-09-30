import { resetSourceFromScrape } from './lib/reset-source-pool.mjs';
import {
  applyDecision,
  getValidationSnapshot,
  reclassifyRecord,
  resetAllDecisions,
  undoDecision,
} from './lib/validation-store.mjs';

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function hostnameFromHostHeader(hostHeader) {
  const raw = String(hostHeader || '').trim();
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end >= 0 ? raw.slice(1, end) : raw.replace(/^\[|\]$/g, '');
  }
  const colon = raw.lastIndexOf(':');
  if (colon > 0 && raw.indexOf(':') === colon) return raw.slice(0, colon);
  return raw;
}

function isLoopbackHostname(hostname) {
  const host = hostnameFromHostHeader(hostname).toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isLoopbackAddress(address) {
  const value = String(address || '').replace(/^::ffff:/, '');
  return value === '127.0.0.1' || value === '::1';
}

function isLocalValidationRequest(req) {
  const host = req.headers.host;
  const remote = req.socket?.remoteAddress;
  return isLoopbackHostname(host) && isLoopbackAddress(remote);
}

function attachValidationApi(server) {
  server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url?.startsWith('/api/validation')) {
          next();
          return;
        }

        if (!isLocalValidationRequest(req)) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }

        try {
          if (req.method === 'GET' && url === '/api/validation/queue') {
            sendJson(res, 200, getValidationSnapshot());
            return;
          }
          if (req.method === 'POST' && url === '/api/validation/decide') {
            const body = await readBody(req);
            sendJson(res, 200, applyDecision(body));
            return;
          }
          if (req.method === 'POST' && url === '/api/validation/undo') {
            const body = await readBody(req);
            sendJson(res, 200, undoDecision(body.image));
            return;
          }
          if (req.method === 'POST' && url === '/api/validation/reset-source') {
            const body = await readBody(req);
            const result = await resetSourceFromScrape(body.sourceId);
            sendJson(res, 200, { ...getValidationSnapshot(), reset: result });
            return;
          }
          if (req.method === 'POST' && url === '/api/validation/reclassify') {
            const body = await readBody(req);
            sendJson(res, 200, reclassifyRecord(body.image, body.role));
            return;
          }
          if (req.method === 'POST' && url === '/api/validation/reset-decisions') {
            sendJson(res, 200, resetAllDecisions());
            return;
          }
          sendJson(res, 404, { error: 'Not found' });
        } catch (err) {
          sendJson(res, 400, { error: err.message || 'Validation API error' });
        }
      });
}

export function validationApiPlugin() {
  return {
    name: 'validation-api',
    configureServer(server) {
      attachValidationApi(server);
    },
  };
}
