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
  hasPublishedOnThisDevice,
  isCompleteSession,
  publishCompletedSession,
} from './utils/sessionLog';
import {
  clearQuizProgress,
  loadLastResults,
  loadQuizProgress,
  pathForQuizState,
  saveLastResults,
  saveQuizProgress,
} from './utils/quizProgress';
import { parseStudyPath, pushStudyPath, replaceStudyPath } from './utils/quizRoutes';

const SCREENS = {
  CONSENT: 'consent',
  TRIAL: 'trial',
  RESULTS: 'results',
};

function beginSession(context) {
  return {
    screen: SCREENS.TRIAL,
    order: buildSessionTrials(),
    trialIndex: 0,
    stats: createInitialStats(),
    draft: createSessionDraft(context),
    answered: false,
    choice: null,
    pendingChoice: null,
    lastCorrect: false,
    feedback: '',
  };
}

function emptySession() {
  return {
    screen: SCREENS.CONSENT,
    order: [],
    trialIndex: 0,
    stats: createInitialStats(),
    draft: null,
    answered: false,
    choice: null,
    pendingChoice: null,
    lastCorrect: false,
    feedback: '',
  };
}

function restoreSession() {
  const saved = loadQuizProgress();
  if (saved?.order?.length && saved.draft) {
    return {
      screen: saved.screen === SCREENS.RESULTS ? SCREENS.RESULTS : SCREENS.TRIAL,
      order: saved.order,
      trialIndex: saved.trialIndex,
      stats: saved.stats,
      draft: saved.draft,
      answered: Boolean(saved.answered),
      choice: saved.choice ?? null,
      pendingChoice: saved.pendingChoice ?? null,
      lastCorrect: Boolean(saved.lastCorrect),
      feedback: saved.feedback || '',
    };
  }

  if (hasPublishedOnThisDevice()) {
    const last = loadLastResults();
    if (parseStudyPath().view === 'results' && last?.stats) {
      return {
        ...emptySession(),
        screen: SCREENS.RESULTS,
        stats: last.stats,
      };
    }
    return emptySession();
  }

  return emptySession();
}

export default function App() {
  const restored = useMemo(() => restoreSession(), []);
  const [screen, setScreen] = useState(restored.screen);
  const [order, setOrder] = useState(restored.order);
  const [trialIndex, setTrialIndex] = useState(restored.trialIndex);
  const [stats, setStats] = useState(restored.stats);
  const [draft, setDraft] = useState(restored.draft);
  const [answered, setAnswered] = useState(restored.answered);
  const [choice, setChoice] = useState(restored.choice);
  const [pendingChoice, setPendingChoice] = useState(restored.pendingChoice ?? null);
  const [lastCorrect, setLastCorrect] = useState(restored.lastCorrect);
  const [feedback, setFeedback] = useState(restored.feedback);
  const [saveStatus, setSaveStatus] = useState('idle');
  const trialShownAtRef = useRef(0);
  const publishLockRef = useRef(false);
  const latestRef = useRef({ draft: restored.draft, stats: restored.stats });

  const trial = order[trialIndex];
  const revealAnswer = draft?.arm !== 'silent';
  latestRef.current = { draft, stats };

  const applySession = useCallback((next) => {
    setScreen(next.screen || SCREENS.CONSENT);
    setOrder(next.order);
    setTrialIndex(next.trialIndex);
    setStats(next.stats);
    setDraft(next.draft);
    setAnswered(next.answered);
    setChoice(next.choice);
    setPendingChoice(next.pendingChoice ?? null);
    setLastCorrect(next.lastCorrect);
    setFeedback(next.feedback);
  }, []);

  const persistable = screen === SCREENS.TRIAL || screen === SCREENS.RESULTS;

  useEffect(() => {
    if (!persistable || !draft || order.length === 0) return;
    saveQuizProgress({
      screen,
      order,
      trialIndex,
      stats,
      draft,
      answered,
      choice,
      pendingChoice,
      lastCorrect,
      feedback,
    });
  }, [answered, choice, draft, feedback, lastCorrect, order, pendingChoice, persistable, screen, stats, trialIndex]);

  useEffect(() => {
    const wanted = pathForQuizState(screen, trialIndex);
    replaceStudyPath(wanted);
  }, [screen, trialIndex]);

  useEffect(() => {
    const snapToSaved = () => {
      const wanted = pathForQuizState(screen, trialIndex);
      const parsed = parseStudyPath();
      if (screen === SCREENS.TRIAL && parsed.view === 'quiz' && parsed.round === trialIndex + 1) {
        return;
      }
      if (screen === SCREENS.RESULTS && parsed.view === 'results') return;
      if (screen === SCREENS.CONSENT && parsed.view === 'consent') return;
      replaceStudyPath(wanted);
    };
    window.addEventListener('popstate', snapToSaved);
    return () => window.removeEventListener('popstate', snapToSaved);
  }, [screen, trialIndex]);

  const publishDraft = useCallback(async (nextDraft, nextStats) => {
    if (publishLockRef.current) return;
    if (!isCompleteSession(nextDraft, nextStats)) return;

    if (nextDraft.isRetake) {
      publishLockRef.current = true;
      clearQuizProgress();
      setSaveStatus('idle');
      return;
    }

    const payload = buildCompletedPayload(nextDraft, nextStats);
    if (!payload) return;

    publishLockRef.current = true;
    setSaveStatus('saving');
    try {
      const result = await publishCompletedSession(payload);
      saveLastResults(nextStats);
      clearQuizProgress();
      setSaveStatus(result.skipped ? 'idle' : 'saved');
    } catch {
      publishLockRef.current = false;
      setSaveStatus('error');
    }
  }, []);

  const pickChoice = useCallback(
    (selected) => {
      if (answered || !trial) return;
      setPendingChoice(selected);
    },
    [answered, trial],
  );

  const confirmChoice = useCallback(() => {
    if (answered || !trial || pendingChoice === null || pendingChoice === undefined) return;

    const selected = pendingChoice;
    const result = scoreAnswer(trial, selected);
    const reactionTimeMs = trialShownAtRef.current ? Date.now() - trialShownAtRef.current : null;
    const { draft: currentDraft, stats: currentStats } = latestRef.current;
    const nextStats = {
      ...currentStats,
      correct: currentStats.correct + result.delta.correct,
      answered: currentStats.answered + 1,
      hits: currentStats.hits + result.delta.hits,
      misses: currentStats.misses + result.delta.misses,
      targetPresent: currentStats.targetPresent + result.delta.targetPresent,
      falseAlarms: currentStats.falseAlarms + result.delta.falseAlarms,
      responses: [...currentStats.responses, result.response],
    };
    const nextDraft = appendTrialResult(
      currentDraft,
      trial,
      trialIndex,
      selected,
      result.correct,
      reactionTimeMs,
    );

    if (currentDraft?.arm === 'silent') {
      setStats(nextStats);
      setDraft(nextDraft);
      setAnswered(false);
      setChoice(null);
      setPendingChoice(null);
      setLastCorrect(false);
      setFeedback('');

      if (trialIndex >= order.length - 1) {
        setScreen(SCREENS.RESULTS);
        pushStudyPath('/results');
        window.scrollTo(0, 0);
        publishDraft(nextDraft, nextStats);
        return;
      }

      setTrialIndex(trialIndex + 1);
      pushStudyPath(`/quiz/${trialIndex + 2}`);
      window.scrollTo(0, 0);
      return;
    }

    setChoice(selected);
    setLastCorrect(result.correct);
    setFeedback(getFeedback(trial, selected, result.correct));
    setAnswered(true);
    setStats(nextStats);
    setDraft(nextDraft);
  }, [answered, order.length, pendingChoice, publishDraft, trial, trialIndex]);

  const handleNext = useCallback(() => {
    if (trialIndex >= order.length - 1) {
      const { draft: nextDraft, stats: nextStats } = latestRef.current;
      setScreen(SCREENS.RESULTS);
      pushStudyPath('/results');
      window.scrollTo(0, 0);
      publishDraft(nextDraft, nextStats);
      return;
    }
    const nextIndex = trialIndex + 1;
    setTrialIndex(nextIndex);
    setAnswered(false);
    setChoice(null);
    setPendingChoice(null);
    setLastCorrect(false);
    setFeedback('');
    pushStudyPath(`/quiz/${nextIndex + 1}`);
    window.scrollTo(0, 0);
  }, [order.length, publishDraft, trialIndex]);

  const handleStart = useCallback((context) => {
    if (loadQuizProgress()) return;
    if (hasPublishedOnThisDevice() && !context?.isRetake) return;
    publishLockRef.current = false;
    const next = beginSession(context);
    if (!next.order.length) {
      applySession({ ...emptySession(), screen: SCREENS.CONSENT });
      return;
    }
    applySession(next);
    setSaveStatus('idle');
    pushStudyPath('/quiz/1');
    window.scrollTo(0, 0);
  }, [applySession]);

  const handleResume = useCallback(() => {
    const saved = loadQuizProgress();
    if (!saved?.order?.length || !saved.draft) return;
    publishLockRef.current = false;
    applySession({
      screen: saved.screen === SCREENS.RESULTS ? SCREENS.RESULTS : SCREENS.TRIAL,
      order: saved.order,
      trialIndex: saved.trialIndex,
      stats: saved.stats,
      draft: saved.draft,
      answered: Boolean(saved.answered),
      choice: saved.choice ?? null,
      pendingChoice: saved.pendingChoice ?? null,
      lastCorrect: Boolean(saved.lastCorrect),
      feedback: saved.feedback || '',
    });
    replaceStudyPath(pathForQuizState(saved.screen === SCREENS.RESULTS ? SCREENS.RESULTS : SCREENS.TRIAL, saved.trialIndex));
    window.scrollTo(0, 0);
  }, [applySession]);

  useEffect(() => {
    if (screen !== SCREENS.RESULTS || saveStatus !== 'error') return undefined;
    const { draft: nextDraft } = latestRef.current;
    if (!nextDraft || nextDraft.isRetake) return undefined;
    const timer = window.setTimeout(() => {
      const { draft: d, stats: s } = latestRef.current;
      publishLockRef.current = false;
      publishDraft(d, s);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [screen, saveStatus, publishDraft]);

  const handleEndQuiz = useCallback(() => {
    clearQuizProgress();
    publishLockRef.current = false;
    applySession(emptySession());
    replaceStudyPath('/');
    window.scrollTo(0, 0);
  }, [applySession]);

  useEffect(() => {
    if (screen === SCREENS.TRIAL && trial && !answered) {
      trialShownAtRef.current = Date.now();
    }
  }, [answered, screen, trial]);

  const content = useMemo(() => {
    if (screen === SCREENS.CONSENT) {
      return <ConsentScreen onStart={handleStart} onResume={handleResume} />;
    }
    if (screen === SCREENS.RESULTS) {
      return (
        <ResultsScreen stats={stats} onEndQuiz={handleEndQuiz} />
      );
    }
    if (screen === SCREENS.TRIAL && !trial) {
      return (
        <section className="screen active">
          <div className="panel">
            <p>Could not build a random session from the current photo pool.</p>
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
          pendingChoice={pendingChoice}
          correct={lastCorrect}
          feedback={feedback}
          revealAnswer={revealAnswer}
          onSelect={pickChoice}
          onConfirm={confirmChoice}
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
    pendingChoice,
    lastCorrect,
    feedback,
    revealAnswer,
    handleStart,
    handleResume,
    pickChoice,
    confirmChoice,
    handleNext,
    handleEndQuiz,
  ]);

  return <div className="app">{content}</div>;
}
