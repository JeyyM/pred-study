const FILTERS = new Set(['all', 'pending', 'accepted', 'rejected']);

export function parseValidationPath(pathname = '/', search = '') {
  const parts = String(pathname)
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filter = FILTERS.has(params.get('filter')) ? params.get('filter') : 'all';

  if (parts[0] !== 'validation') {
    return { view: 'directory', groupKey: null, sourceId: null, role: null, image: null, filter: 'all' };
  }

  if (parts.length < 3) {
    return { view: 'directory', groupKey: null, sourceId: null, role: null, image: null, filter: 'all' };
  }

  const sourceId = decodeURIComponent(parts[1]);
  const role = parts[2] === 'foil' ? 'foil' : parts[2] === 'target' ? 'target' : null;
  if (!sourceId || !role) {
    return { view: 'directory', groupKey: null, sourceId: null, role: null, image: null, filter: 'all' };
  }

  const image = parts[3] ? decodeURIComponent(parts[3]) : null;
  return {
    view: image ? 'photo' : 'source',
    groupKey: `${sourceId}::${role}`,
    sourceId,
    role,
    image,
    filter,
  };
}

export function validationHref(pathname, filter = 'all') {
  return filter && filter !== 'all' ? `${pathname}?filter=${encodeURIComponent(filter)}` : pathname;
}

export function validationDirectoryPath() {
  return '/validation';
}

export function validationSourcePath(sourceId, role, filter = 'all') {
  return validationHref(`/validation/${encodeURIComponent(sourceId)}/${role}`, filter);
}

export function validationPhotoPath(sourceId, role, image, filter = 'all') {
  return validationHref(
    `/validation/${encodeURIComponent(sourceId)}/${role}/${encodeURIComponent(image)}`,
    filter,
  );
}

export function currentValidationHref() {
  return `${window.location.pathname}${window.location.search}`;
}

export function navigateValidation(path, { replace = false } = {}) {
  if (currentValidationHref() === path) return;
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function handleValidationLinkClick(event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute('href');
  if (!href || href.startsWith('http')) return;
  event.preventDefault();
  navigateValidation(new URL(href, window.location.origin).pathname + new URL(href, window.location.origin).search);
}
