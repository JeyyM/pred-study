export function studyPathname(pathname = window.location.pathname) {
  return String(pathname).replace(/\/+$/, '') || '/';
}

export function parseStudyPath(pathname = window.location.pathname) {
  const path = studyPathname(pathname);
  if (path === '/results') return { view: 'results', round: null };
  if (path === '/quiz') return { view: 'quiz', round: null };
  const match = path.match(/^\/quiz\/(\d+)$/);
  if (match) return { view: 'quiz', round: Number(match[1]) };
  return { view: 'consent', round: null };
}

export function quizPath(round) {
  return `/quiz/${round}`;
}

export function resultsPath() {
  return '/results';
}

export function replaceStudyPath(path) {
  if (studyPathname() === studyPathname(path)) return;
  window.history.replaceState(null, '', path);
}

export function pushStudyPath(path) {
  if (studyPathname() === studyPathname(path)) return;
  window.history.pushState(null, '', path);
}
