import validatedPool from '../data/validated-pool.json' with { type: 'json' };
import { LABELS, SESSION_TRIAL_COUNT } from './study';
import { ASSIGNED_ARM_KEY, PUBLISHED_SESSION_KEY, TASK_ID } from './protocol';

function normalizeArm(arm) {
  return arm === 'feedback' ? 'feedback' : arm === 'silent' ? 'silent' : null;
}
import { createSupabaseClient, getSupabaseConfig } from './supabaseClient';

export function createSessionDraft(context = {}) {
  const id = crypto.randomUUID();
  const isRetake = Boolean(context.isRetake);
  const arm = isRetake
    ? context.arm === 'feedback'
      ? 'feedback'
      : 'silent'
    : context.arm === 'silent'
      ? 'silent'
      : 'feedback';
  return {
    id,
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    arm,
    isRetake,
    device: context.device || null,
    demographics: isRetake ? null : context.demographics || null,
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
          sourceId: suspect.sourceId || null,
          label: LABELS[i],
        })),
      },
    ],
  };
}

export function getPublishedSessionMeta() {
  try {
    const raw = window.localStorage.getItem(PUBLISHED_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasPublishedOnThisDevice() {
  return Boolean(getPublishedSessionMeta()?.id);
}

export function getAssignedArm() {
  const fromPublished = normalizeArm(getPublishedSessionMeta()?.arm);
  if (fromPublished) return fromPublished;
  try {
    return normalizeArm(window.localStorage.getItem(ASSIGNED_ARM_KEY));
  } catch {
    return null;
  }
}

export function persistAssignedArm(arm) {
  const normalized = normalizeArm(arm);
  if (!normalized) return;
  try {
    window.localStorage.setItem(ASSIGNED_ARM_KEY, normalized);
  } catch {
    /* private mode */
  }
}

export function armForRetake() {
  return getAssignedArm() || 'silent';
}

export function markPublishedOnThisDevice(sessionId, arm) {
  try {
    window.localStorage.setItem(
      PUBLISHED_SESSION_KEY,
      JSON.stringify({
        id: sessionId,
        at: new Date().toISOString(),
        arm: arm === 'feedback' ? 'feedback' : 'silent',
      }),
    );
    persistAssignedArm(arm);
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
    arm: draft.arm === 'silent' ? 'silent' : 'feedback',
    device_id: draft.device?.deviceId || null,
    device_type: draft.device?.deviceType || null,
    user_agent: draft.device?.userAgent || null,
    ip_address: draft.device?.ipAddress || null,
    participant_gender: draft.demographics?.gender || null,
    participant_age: draft.demographics?.age ?? null,
    protocol_meta: {
      task: TASK_ID,
      trialCount: SESSION_TRIAL_COUNT,
      chance: 1 / 3,
      poolUpdatedAt: validatedPool.updatedAt || null,
      poolCount: validatedPool.count || null,
    },
    started_at: draft.startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - draft.startedMs,
    score: {
      correct: stats.correct,
      answered: stats.answered,
      hits: stats.hits,
      misses: stats.misses,
    },
    trials: draft.trials,
  };
}

async function publishToSupabase(payload) {
  const supabase = createSupabaseClient();
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase.rpc('submit_completed_session', { payload });
  if (error) throw new Error(error.message || 'Could not save session');
  return { ok: true, skipped: false, id: data?.id || payload.id };
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

  markPublishedOnThisDevice(payload.id, payload.arm);
  return result;
}
