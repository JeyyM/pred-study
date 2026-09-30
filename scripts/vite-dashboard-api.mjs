import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboardStats } from './lib/dashboard-stats.mjs';
import { getServiceSupabaseConfig } from './lib/load-env-local.mjs';
import { supabaseRest } from './lib/supabase-rest.mjs';

const SOURCE_TITLES = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'source-titles.json'),
    'utf8',
  ),
);

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
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

function isLocalDashboardRequest(req) {
  const host = hostnameFromHostHeader(req.headers.host).toLowerCase();
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const hostOk = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const remoteOk = remote === '127.0.0.1' || remote === '::1';
  return hostOk && remoteOk;
}

async function loadDashboard() {
  const config = getServiceSupabaseConfig();
  if (!config) {
    throw new Error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local for the dashboard.');
  }
  const [sessions, faces, stimuli, protocols] = await Promise.all([
    supabaseRest('completed_sessions?select=id,arm,device_type,ip_address,participant_gender,participant_age,duration_ms,score,trials,completed_at'),
    supabaseRest('face_stats?select=image,times_played,times_selected'),
    supabaseRest('stimuli?select=image,source_id,pool_role,category'),
    supabaseRest('protocol_counts?select=protocol,completed_count'),
  ]);

  return buildDashboardStats({
    sessions: sessions || [],
    faces: faces || [],
    stimuli: stimuli || [],
    protocols: protocols || [],
    titles: SOURCE_TITLES,
  });
}

function attachDashboardApi(server) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url?.split('?')[0];
    if (url !== '/api/dashboard') {
      next();
      return;
    }
    if (!isLocalDashboardRequest(req)) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    try {
      sendJson(res, 200, await loadDashboard());
    } catch (err) {
      sendJson(res, 400, { error: err.message || 'Dashboard error' });
    }
  });
}

export function dashboardApiPlugin() {
  return {
    name: 'dashboard-api',
    configureServer(server) {
      attachDashboardApi(server);
    },
  };
}
