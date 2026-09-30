import validatedPool from '../data/validated-pool.json' with { type: 'json' };
import { LABELS, SESSION_TRIAL_COUNT } from './study';
import { PUBLISHED_SESSION_KEY, TASK_ID } from './protocol';
import { createSupabaseClient, getSupabaseConfig } from './supabaseClient';

export function createSessionDraft() {
  const id = crypto.randomUUID();
  return {
    id,
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    trials: [],
  };
}

export function appendTrialResult(draft, trial, trialIndex, choice, correct, reactionTimeMs) {
  if (!draft) return draft;
  return {
    ...draft,
    trials: [
      ...draft.trials,
      {
        index: trialIndex,
        id: trial.id,
        reactionTimeMs: Number.isFinite(reactionTimeMs) ? Math.max(0, Math.round(reactionTimeMs)) : null,
        choice,
        choiceLabel: LABELS[choice],
        correct,
        targetIndex: trial.targetIndex,
        cards: trial.suspects.map((suspect, i) => ({
          image: suspect.image,
          category: suspect.category,
          label: LABELS[i],
        })),
      },
    ],
  };
}

export function hasPublishedOnThisDevice() {
  try {
    return Boolean(window.localStorage.getItem(PUBLISHED_SESSION_KEY));
  } catch {
    return false;
  }
}

export function markPublishedOnThisDevice(sessionId) {
  try {
    window.localStorage.setItem(
      PUBLISHED_SESSION_KEY,
      JSON.stringify({ id: sessionId, at: new Date().toISOString() }),
    );
  } catch {
    /* private mode */
  }
}

export function isCompleteSession(draft, stats) {
  return (
    draft?.id &&
    Array.isArray(draft.trials) &&
    draft.trials.length === SESSION_TRIAL_COUNT &&
    stats?.answered === SESSION_TRIAL_COUNT
  );
}

export function buildCompletedPayload(draft, stats) {
  if (!isCompleteSession(draft, stats)) return null;
  return {
    id: draft.id,
    protocol: {
      task: TASK_ID,
      trialCount: SESSION_TRIAL_COUNT,
      chance: 1 / 3,
      poolUpdatedAt: validatedPool.updatedAt || null,
      poolCount: validatedPool.count || null,
    },
    startedAt: draft.startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - draft.startedMs,
    score: {
      correct: stats.correct,
      answered: stats.answered,
      hits: stats.hits,
      misses: stats.misses,
    },
    trials: draft.trials,
  };
}

function toSupabaseRow(payload) {
  return {
    id: payload.id,
    protocol: payload.protocol,
    started_at: payload.startedAt,
    completed_at: payload.completedAt,
    duration_ms: payload.durationMs,
    score: payload.score,
    trials: payload.trials,
  };
}

async function publishToSupabase(payload) {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const { error } = await supabase.from('completed_sessions').insert(toSupabaseRow(payload));
  if (error) {
    if (error.code === '23505') return { ok: true, skipped: false, id: payload.id };
    throw new Error(error.message || 'Could not save session');
  }
  return { ok: true, skipped: false, id: payload.id };
}

async function publishToLocalApi(payload) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Could not save session');
  }
  return { ok: true, skipped: false, id: body.id || payload.id };
}

export async function publishCompletedSession(payload) {
  if (hasPublishedOnThisDevice()) {
    return { ok: true, skipped: true };
  }
  if (!payload || payload.trials?.length !== SESSION_TRIAL_COUNT) {
    throw new Error('Session is not complete');
  }

  const result = getSupabaseConfig()
    ? await publishToSupabase(payload)
    : import.meta.env.DEV
      ? await publishToLocalApi(payload)
      : null;
  if (!result) {
    throw new Error('Supabase is not configured');
  }

  markPublishedOnThisDevice(payload.id);
  return result;
}
