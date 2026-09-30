import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const SESSIONS_PATH = path.join(DATA_DIR, 'completed-sessions.jsonl');
const TRIAL_COUNT = 30;
const CATEGORIES = new Set(['sex', 'sex-adult']);

function readExistingIds() {
  if (!fs.existsSync(SESSIONS_PATH)) return new Set();
  const ids = new Set();
  const text = fs.readFileSync(SESSIONS_PATH, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.id) ids.add(row.id);
    } catch {
      /* skip broken line */
    }
  }
  return ids;
}

function assertCompleteSession(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid session');
  if (typeof payload.id !== 'string' || payload.id.length < 8) throw new Error('Missing session id');
  if (!Array.isArray(payload.trials) || payload.trials.length !== TRIAL_COUNT) {
    throw new Error('Only complete 30-round sessions are stored');
  }
  if (payload.score?.answered !== TRIAL_COUNT) {
    throw new Error('Only complete 30-round sessions are stored');
  }

  const indexes = new Set();
  for (const trial of payload.trials) {
    if (!Number.isInteger(trial.index) || trial.index < 0 || trial.index >= TRIAL_COUNT) {
      throw new Error('Invalid trial index');
    }
    if (indexes.has(trial.index)) throw new Error('Duplicate trial index');
    indexes.add(trial.index);
    if (![0, 1, 2].includes(trial.choice)) throw new Error('Invalid choice');
    if (typeof trial.correct !== 'boolean') throw new Error('Invalid trial score');
    if (!Array.isArray(trial.cards) || trial.cards.length !== 3) throw new Error('Invalid trial cards');
    const targetCards = trial.cards.filter((card) => card.category === 'sex');
    if (targetCards.length !== 1) throw new Error('Each trial must have one target');
    for (const card of trial.cards) {
      if (!card.image || !CATEGORIES.has(card.category)) throw new Error('Invalid card');
    }
  }
  if (indexes.size !== TRIAL_COUNT) throw new Error('Missing trials');
}

export function saveCompletedSession(payload) {
  assertCompleteSession(payload);

  const existing = readExistingIds();
  if (existing.has(payload.id)) {
    return { id: payload.id, duplicate: true };
  }

  const row = {
    ...payload,
    receivedAt: new Date().toISOString(),
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(SESSIONS_PATH, `${JSON.stringify(row)}\n`, 'utf8');
  return { id: payload.id, duplicate: false };
}

export function sessionsFilePath() {
  return SESSIONS_PATH;
}
