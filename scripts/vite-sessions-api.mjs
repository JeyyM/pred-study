import { saveCompletedSession } from './lib/session-store.mjs';

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

function attachSessionsApi(server) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/sessions') {
      next();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    try {
      const body = await readBody(req);
      const saved = saveCompletedSession(body);
      sendJson(res, saved.duplicate ? 200 : 201, saved);
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'Session rejected' });
    }
  });
}

export function sessionsApiPlugin() {
  return {
    name: 'sessions-api',
    configureServer(server) {
      attachSessionsApi(server);
    },
    configurePreviewServer(server) {
      attachSessionsApi(server);
    },
  };
}
