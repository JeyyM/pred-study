const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

export function isLoopbackHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  return LOOPBACK.has(host);
}

/** Researcher UI and API: local `npm run dev` only. Production builds omit the screen. */
export function isValidationAvailable() {
  if (!import.meta.env.DEV) return false;
  if (typeof window === 'undefined') return false;
  return isLoopbackHostname(window.location.hostname);
}
