function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function pct(num, den) {
  if (!den) return null;
  return (num / den) * 100;
}

export function buildDashboardStats({ sessions = [], faces = [], stimuli = [], protocols = [], titles = {} }) {
  const stimulusByImage = new Map(stimuli.map((row) => [row.image, row]));
  const accuracies = [];
  const durations = [];
  const reactionTimes = [];
  const byArm = {
    feedback: { n: 0, accuracies: [], reactionTimes: [] },
    silent: { n: 0, accuracies: [], reactionTimes: [] },
  };
  const devices = {};
  const genders = {};
  const ages = [];

  for (const session of sessions) {
    const answered = Number(session.score?.answered) || 0;
    const correct = Number(session.score?.correct) || 0;
    if (answered) accuracies.push(correct / answered);
    if (Number.isFinite(session.duration_ms)) durations.push(session.duration_ms);
    const arm = session.arm === 'silent' ? 'silent' : 'feedback';
    byArm[arm].n += 1;
    if (answered) byArm[arm].accuracies.push(correct / answered);
    const type = session.device_type || 'unknown';
    devices[type] = (devices[type] || 0) + 1;
    const gender = session.participant_gender || 'unspecified';
    genders[gender] = (genders[gender] || 0) + 1;
    if (Number.isFinite(session.participant_age)) ages.push(session.participant_age);
    for (const trial of session.trials || []) {
      if (Number.isFinite(trial.reactionTimeMs)) {
        reactionTimes.push(trial.reactionTimeMs);
        byArm[arm].reactionTimes.push(trial.reactionTimeMs);
      }
    }
  }

  const faceRows = faces.map((face) => {
    const meta = stimulusByImage.get(face.image) || {};
    return {
      image: face.image,
      sourceId: meta.source_id || null,
      sourceTitle: titles[meta.source_id] || meta.source_id || 'Unknown dataset',
      poolRole: meta.pool_role || null,
      category: meta.category || null,
      timesPlayed: face.times_played || 0,
      timesSelected: face.times_selected || 0,
      selectRate: pct(face.times_selected || 0, face.times_played || 0),
    };
  }).sort((a, b) => b.timesSelected - a.timesSelected || b.timesPlayed - a.timesPlayed);

  const byDataset = {};
  for (const row of faceRows) {
    const key = row.sourceId || 'unknown';
    if (!byDataset[key]) {
      byDataset[key] = {
        sourceId: key,
        title: row.sourceTitle,
        played: 0,
        selected: 0,
        faces: 0,
      };
    }
    byDataset[key].played += row.timesPlayed;
    byDataset[key].selected += row.timesSelected;
    byDataset[key].faces += 1;
  }

  return {
    sessionCount: sessions.length,
    stimulusCount: stimuli.length,
    meanAccuracy: mean(accuracies),
    meanDurationMs: mean(durations),
    meanReactionMs: mean(reactionTimes),
    protocols: Object.fromEntries(
      (protocols.length ? protocols : [
        { protocol: 'feedback', completed_count: byArm.feedback.n },
        { protocol: 'silent', completed_count: byArm.silent.n },
      ]).map((row) => [row.protocol, row.completed_count]),
    ),
    arms: {
      feedback: {
        n: byArm.feedback.n,
        meanAccuracy: mean(byArm.feedback.accuracies),
        meanReactionMs: mean(byArm.feedback.reactionTimes),
      },
      silent: {
        n: byArm.silent.n,
        meanAccuracy: mean(byArm.silent.accuracies),
        meanReactionMs: mean(byArm.silent.reactionTimes),
      },
    },
    devices,
    genders,
    meanAge: mean(ages),
    datasets: Object.values(byDataset).sort((a, b) => b.selected - a.selected),
    faces: faceRows,
    recent: sessions
      .slice()
      .sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)))
      .slice(0, 25)
      .map((session) => ({
        id: session.id,
        arm: session.arm,
        deviceType: session.device_type,
        ipAddress: session.ip_address,
        gender: session.participant_gender || null,
        age: session.participant_age ?? null,
        accuracy: session.score?.answered
          ? session.score.correct / session.score.answered
          : null,
        correct: session.score?.correct ?? null,
        answered: session.score?.answered ?? null,
        durationMs: session.duration_ms,
        completedAt: session.completed_at,
      })),
  };
}
