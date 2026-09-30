import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConsentScreen from './components/ConsentScreen';
import TrialScreen from './components/TrialScreen';
import ResultsScreen from './components/ResultsScreen';
import {
  buildSessionTrials,
  createInitialStats,
  getFeedback,
  scoreAnswer,
} from './utils/study';
import {
  appendTrialResult,
  buildCompletedPayload,
  createSessionDraft,
  isCompleteSession,
  publishCompletedSession,
} from './utils/sessionLog';

const SCREENS = {
  CONSENT: 'consent',
  TRIAL: 'trial',
  RESULTS: 'results',
};

function beginSession() {
  return {
    order: buildSessionTrials(),
    trialIndex: 0,
    stats: createInitialStats(),
    draft: createSessionDraft(),
    answered: false,
    choice: null,
    lastCorrect: false,
    feedback: '',
  };
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.CONSENT);
  const [order, setOrder] = useState([]);
  const [trialIndex, setTrialIndex] = useState(0);
  const [stats, setStats] = useState(createInitialStats);
  const [draft, setDraft] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [choice, setChoice] = useState(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const trialShownAtRef = useRef(0);
  const publishLockRef = useRef(false);
  const latestRef = useRef({ draft: null, stats: null });

  const trial = order[trialIndex];
  latestRef.current = { draft, stats };

  const applySession = useCallback((next) => {
    setOrder(next.order);
    setTrialIndex(next.trialIndex);
    setStats(next.stats);
    setDraft(next.draft);
    setAnswered(next.answered);
    setChoice(next.choice);
    setLastCorrect(next.lastCorrect);
    setFeedback(next.feedback);
  }, []);

  const publishDraft = useCallback(async (nextDraft, nextStats) => {
    if (publishLockRef.current) return;
    if (!isCompleteSession(nextDraft, nextStats)) return;

    const payload = buildCompletedPayload(nextDraft, nextStats);
    if (!payload) return;

    publishLockRef.current = true;
    setSaveStatus('saving');
    try {
      const result = await publishCompletedSession(payload);
      setSaveStatus(result.skipped ? 'idle' : 'saved');
    } catch {
      publishLockRef.current = false;
      setSaveStatus('error');
    }
  }, []);

  const resetStudy = useCallback(() => {
    applySession({
      order: [],
      trialIndex: 0,
      stats: createInitialStats(),
      draft: null,
      answered: false,
      choice: null,
      lastCorrect: false,
      feedback: '',
    });
    setSaveStatus('idle');
    setScreen(SCREENS.CONSENT);
    window.scrollTo(0, 0);
  }, [applySession]);

  const submitAnswer = useCallback(
    (selected) => {
      if (answered || !trial) return;

      const result = scoreAnswer(trial, selected);
      const reactionTimeMs = trialShownAtRef.current ? Date.now() - trialShownAtRef.current : null;
      setChoice(selected);
      setLastCorrect(result.correct);
      setFeedback(getFeedback(trial, selected, result.correct));
      setAnswered(true);
      setStats((prev) => ({
        ...prev,
        correct: prev.correct + result.delta.correct,
        answered: prev.answered + 1,
        hits: prev.hits + result.delta.hits,
        misses: prev.misses + result.delta.misses,
        targetPresent: prev.targetPresent + result.delta.targetPresent,
        falseAlarms: prev.falseAlarms + result.delta.falseAlarms,
        responses: [...prev.responses, result.response],
      }));
      setDraft((prev) => appendTrialResult(prev, trial, trialIndex, selected, result.correct, reactionTimeMs));
    },
    [answered, trial, trialIndex],
  );

  const handleNext = useCallback(() => {
    if (trialIndex >= order.length - 1) {
      const { draft: nextDraft, stats: nextStats } = latestRef.current;
      setScreen(SCREENS.RESULTS);
      window.scrollTo(0, 0);
      publishDraft(nextDraft, nextStats);
      return;
    }
    setTrialIndex((i) => i + 1);
    setAnswered(false);
    setChoice(null);
    setLastCorrect(false);
    setFeedback('');
  }, [order.length, publishDraft, trialIndex]);

  const handleStart = useCallback(() => {
    publishLockRef.current = false;
    applySession(beginSession());
    setSaveStatus('idle');
    setScreen(SCREENS.TRIAL);
    window.scrollTo(0, 0);
  }, [applySession]);

  const handleRetrySave = useCallback(() => {
    const { draft: nextDraft, stats: nextStats } = latestRef.current;
    publishDraft(nextDraft, nextStats);
  }, [publishDraft]);

  useEffect(() => {
    if (screen === SCREENS.TRIAL && trial && !answered) {
      trialShownAtRef.current = Date.now();
    }
  }, [answered, screen, trial]);

  const content = useMemo(() => {
    if (screen === SCREENS.CONSENT) {
      return <ConsentScreen onStart={handleStart} />;
    }
    if (screen === SCREENS.RESULTS) {
      return (
        <ResultsScreen
          stats={stats}
          totalTrials={order.length}
          onRestart={resetStudy}
          saveStatus={saveStatus}
          onRetrySave={handleRetrySave}
        />
      );
    }
    if (screen === SCREENS.TRIAL && !trial) {
      return (
        <section className="screen active">
          <div className="panel">
            <p>Could not build a random session from the current photo pool.</p>
            <button type="button" className="btn primary" onClick={resetStudy}>
              Back
            </button>
          </div>
        </section>
      );
    }
    if (trial) {
      return (
        <TrialScreen
          trial={trial}
          trialIndex={trialIndex}
          totalTrials={order.length}
          stats={stats}
          answered={answered}
          choice={choice}
          correct={lastCorrect}
          feedback={feedback}
          onSelect={submitAnswer}
          onNext={handleNext}
        />
      );
    }
    return null;
  }, [
    screen,
    trial,
    trialIndex,
    order.length,
    stats,
    answered,
    choice,
    lastCorrect,
    feedback,
    saveStatus,
    handleStart,
    resetStudy,
    submitAnswer,
    handleNext,
    handleRetrySave,
  ]);

  return <div className="app">{content}</div>;
}
