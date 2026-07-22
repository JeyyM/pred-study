import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import poolData from './data/mugshot-pool.json';
import ConsentScreen from './components/ConsentScreen';
import SessionLoader from './components/SessionLoader';
import TrialScreen from './components/TrialScreen';
import ResultsScreen from './components/ResultsScreen';
import {
  createInitialStats,
  getFeedback,
  scoreAnswer,
} from './utils/study';
import { prepareSession } from './utils/prepareSession';
import {
  estimateRemainingSessions,
  markSessionSeen,
} from './utils/sessionPool';

const SCREENS = {
  CONSENT: 'consent',
  PREPARE: 'prepare',
  TRIAL: 'trial',
  RESULTS: 'results',
};

const IMAGE_VERSION = poolData.orientationFixedAt
  ? String(new Date(poolData.orientationFixedAt).getTime())
  : poolData.expandedAt
    ? String(new Date(poolData.expandedAt).getTime())
    : '1';

export default function App() {
  const [screen, setScreen] = useState(SCREENS.CONSENT);
  const [session, setSession] = useState(null);
  const [order, setOrder] = useState([]);
  const [trialIndex, setTrialIndex] = useState(0);
  const [stats, setStats] = useState(createInitialStats);
  const [answered, setAnswered] = useState(false);
  const [choice, setChoice] = useState(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [prepareProgress, setPrepareProgress] = useState(null);
  const [prepareError, setPrepareError] = useState(null);
  const [remainingSessions, setRemainingSessions] = useState(() =>
    estimateRemainingSessions(poolData.records),
  );
  const prepareAbortRef = useRef(null);

  const trial = order[trialIndex];

  useEffect(() => {
    if (screen === SCREENS.RESULTS && session?.rawTrials) {
      markSessionSeen(session.rawTrials);
      setRemainingSessions(estimateRemainingSessions(poolData.records));
    }
  }, [screen, session?.rawTrials]);

  const beginPrepare = useCallback(() => {
    prepareAbortRef.current?.abort();
    const controller = new AbortController();
    prepareAbortRef.current = controller;

    setPrepareError(null);
    setPrepareProgress({ phase: 'init', message: 'Starting…' });
    setScreen(SCREENS.PREPARE);
    window.scrollTo(0, 0);

    prepareSession(poolData.records, {
      imageVersion: IMAGE_VERSION,
      signal: controller.signal,
      onProgress: setPrepareProgress,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.error) {
          setPrepareError(result.error);
          return;
        }

        setSession({ rawTrials: result.rawTrials });
        setOrder(result.order);
        setTrialIndex(0);
        setStats(createInitialStats());
        setAnswered(false);
        setChoice(null);
        setLastCorrect(false);
        setFeedback('');
        setScreen(SCREENS.TRIAL);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setPrepareError(err.message || 'Could not prepare session.');
      });
  }, []);

  const resetStudy = useCallback(() => {
    prepareAbortRef.current?.abort();
    setSession(null);
    setOrder([]);
    setTrialIndex(0);
    setStats(createInitialStats());
    setAnswered(false);
    setChoice(null);
    setLastCorrect(false);
    setFeedback('');
    setPrepareError(null);
    setPrepareProgress(null);
    setRemainingSessions(estimateRemainingSessions(poolData.records));
    setScreen(SCREENS.CONSENT);
    window.scrollTo(0, 0);
  }, []);

  const submitAnswer = useCallback(
    (selected) => {
      if (answered || !trial) return;

      const result = scoreAnswer(trial, selected);
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
    },
    [answered, trial],
  );

  const handleNext = useCallback(() => {
    if (trialIndex >= order.length - 1) {
      setScreen(SCREENS.RESULTS);
      window.scrollTo(0, 0);
      return;
    }
    setTrialIndex((i) => i + 1);
    setAnswered(false);
    setChoice(null);
    setLastCorrect(false);
    setFeedback('');
  }, [order.length, trialIndex]);

  const handleStart = useCallback(() => {
    beginPrepare();
  }, [beginPrepare]);

  const content = useMemo(() => {
    if (screen === SCREENS.CONSENT) {
      return (
        <ConsentScreen
          onStart={handleStart}
          poolSize={poolData.count}
          remainingSessions={remainingSessions}
        />
      );
    }
    if (screen === SCREENS.PREPARE) {
      return (
        <SessionLoader
          progress={prepareProgress}
          error={prepareError}
          onRetry={beginPrepare}
          onBack={resetStudy}
        />
      );
    }
    if (screen === SCREENS.RESULTS) {
      return <ResultsScreen stats={stats} totalTrials={order.length} onRestart={resetStudy} />;
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
          imageVersion={IMAGE_VERSION}
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
    prepareProgress,
    prepareError,
    remainingSessions,
    handleStart,
    resetStudy,
    beginPrepare,
    submitAnswer,
    handleNext,
  ]);

  return <div className="app">{content}</div>;
}
