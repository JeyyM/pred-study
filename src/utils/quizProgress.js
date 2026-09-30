import { SESSION_TRIAL_COUNT } from './protocol';

export const ACTIVE_QUIZ_KEY = 'pred-study:active-quiz';
export const LAST_RESULTS_KEY = 'pred-study:last-results';

export function loadQuizProgress() {
  try {
    const raw = window.localStorage.getItem(ACTIVE_QUIZ_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.draft?.id || !Array.isArray(data.order) || data.order.length !== SESSION_TRIAL_COUNT) {
      return null;
    }
    if (data.screen !== 'trial' && data.screen !== 'results') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveQuizProgress(snapshot) {
  try {
    window.localStorage.setItem(ACTIVE_QUIZ_KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode or quota */
  }
}

export function clearQuizProgress() {
  try {
    window.localStorage.removeItem(ACTIVE_QUIZ_KEY);
  } catch {
    /* private mode */
  }
}

export function hasActiveQuiz() {
  return Boolean(loadQuizProgress());
}

export function saveLastResults(stats) {
  try {
    window.localStorage.setItem(
      LAST_RESULTS_KEY,
      JSON.stringify({ stats, at: new Date().toISOString() }),
    );
  } catch {
    /* private mode */
  }
}

export function loadLastResults() {
  try {
    const raw = window.localStorage.getItem(LAST_RESULTS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function pathForQuizState(screen, trialIndex) {
  if (screen === 'results') return '/results';
  if (screen === 'trial') return `/quiz/${trialIndex + 1}`;
  return '/';
}
