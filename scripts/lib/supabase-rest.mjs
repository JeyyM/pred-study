import { getServiceSupabaseConfig } from './load-env-local.mjs';

export function getAdminConfig() {
  return getServiceSupabaseConfig();
}

export async function supabaseRest(pathname, { method = 'GET', body, prefer } = {}) {
  const config = getServiceSupabaseConfig();
  if (!config) {
    throw new Error('Add VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local');
  }

  const url = `${config.url.replace(/\/$/, '')}/rest/v1/${pathname.replace(/^\//, '')}`;
  const headers = {
    apikey: config.serviceKey,
    Authorization: `Bearer ${config.serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = data?.message || data?.error || text || res.statusText;
    throw new Error(message);
  }
  return data;
}
