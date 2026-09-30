import { useCallback, useEffect, useMemo, useState } from 'react';
import poolData from '../data/mugshot-pool.json';
import SOURCE_TITLES from '../data/source-titles.json';
import { isMinorSexOffense } from '../../scripts/lib/offense.mjs';
import {
  handleValidationLinkClick,
  navigateValidation,
  parseValidationPath,
  validationDirectoryPath,
  validationPhotoPath,
  validationSourcePath,
} from '../utils/validationRoutes.js';

const MISSING = 'Not in current dataset';

function poolRoleForRecord(rec) {
  if (rec.poolRole === 'target' || rec.poolRole === 'foil') return rec.poolRole;
  return rec.category === 'sex' ? 'target' : 'foil';
}

function validationGroupKey(rec) {
  return `${rec.sourceId || 'unknown'}::${poolRoleForRecord(rec)}`;
}

function poolRoleLabel(role, sourceType) {
  const registry = sourceType === 'sex-offender-registry' || sourceType === 'sor';
  if (registry && role === 'target') return 'Child-victim (registry)';
  if (registry && role === 'foil') return 'Adult-victim / other (registry)';
  if (role === 'target') return 'Sex targets (jail booking)';
  if (role === 'foil') return 'Foils (jail booking)';
  return 'Photos';
}

function missingValue(value) {
  if (value === 0) return '0';
  if (value === false) return 'No';
  if (value === true) return 'Yes';
  if (value == null || value === '') return null;
  return String(value);
}

function profileRows(record) {
  return [
    { label: 'Name', value: missingValue(record.name), missing: !record.name },
    { label: 'Age (booking)', value: missingValue(record.age), missing: record.age == null || record.age === '' },
    {
      label: 'Age (model estimate)',
      value: missingValue(record.estimatedAge),
      missing: record.estimatedAge == null || record.estimatedAge === '',
    },
    {
      label: 'Age for matching',
      value: missingValue(record.ageForMatching),
      missing: record.ageForMatching == null || record.ageForMatching === '',
    },
    { label: 'Age band (lineups)', value: missingValue(record.ageBand), missing: !record.ageBand },
    { label: 'Age source', value: missingValue(record.ageSource), missing: !record.ageSource },
    {
      label: 'Study eligible (18+)',
      value: missingValue(record.studyEligible),
      missing: record.studyEligible == null,
    },
    { label: 'Gender', value: missingValue(record.gender), missing: !record.gender },
    { label: 'Race (booking record)', value: missingValue(record.race), missing: !record.race },
    {
      label: 'Offense / charge',
      value: missingValue(record.offense),
      missing: !record.offense,
      full: true,
    },
    {
      label: 'Additional info',
      value: missingValue(record.additionalInfo),
      missing: !record.additionalInfo,
      full: true,
      hideIfMissing: true,
    },
    { label: 'Category', value: missingValue(record.category), missing: !record.category },
    { label: 'Year', value: missingValue(record.year), missing: record.year == null },
    { label: 'Source', value: missingValue(record.sourceId), missing: !record.sourceId },
    { label: 'State', value: missingValue(record.sourceState), missing: !record.sourceState },
    { label: 'Source type', value: missingValue(record.sourceType), missing: !record.sourceType },
    { label: 'Pool group', value: poolRoleLabel(poolRoleForRecord(record), record.sourceType), missing: false },
    { label: 'Qualifying minor sex offense', value: missingValue(record.qualifyingMinor), missing: record.qualifyingMinor == null },
    { label: 'Minor target flagged', value: missingValue(record.minorTarget), missing: record.minorTarget == null },
    { label: 'Face visible', value: missingValue(record.faceVisible), missing: record.faceVisible == null },
    { label: 'Image file', value: missingValue(record.image), missing: !record.image },
  ].filter((row) => !row.hideIfMissing || !row.missing);
}

function normalizePersonKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

function reviewFlags(record, sourcePeers) {
  const flags = [];
  if (!record.name) flags.push('Name was never stored. Reject if identity or conviction status cannot be verified.');
  const personKey = normalizePersonKey(record.name);
  if (personKey.length > 3 && sourcePeers?.length) {
    const sameName = sourcePeers.filter((row) => normalizePersonKey(row.name) === personKey);
    if (sameName.length > 1) {
      flags.push(
        `This name appears on ${sameName.length} photos in this source (re-booking or duplicate scrape). Keep at most one.`,
      );
    }
  }
  if (record.studyEligible === false) {
    flags.push('Known or estimated age is under 18. Reject for this study.');
  }
  if (record.age == null && record.estimatedAge == null) {
    flags.push('No booking or model age yet. Run npm run estimate-face-age, or reject if they look under 18.');
  } else if (record.age == null || record.age === '') {
    flags.push('No booking age on file; lineup matching uses model estimate when present.');
  }
  const offense = `${record.offense || ''} ${record.additionalInfo || ''}`.toLowerCase();
  if (/sentence to serve|failure to appear|fta|hold for|unknown|no charge/.test(offense)) {
    flags.push('Charge text may not be a specific conviction. Reject if this is only a hold, FTA, or placeholder.');
  }
  if (record.qualifyingMinor && !/sex|child|minor|lewd|sodomy|indecent|exploit|molest|rape/.test(offense)) {
    flags.push('Marked as a qualifying minor sex offense, but the charge text does not clearly match.');
  }
  if (record.sourceType === 'sex-offender-registry') {
    flags.push('Registry photo (often different crop/age than jail booking mugshots). OK for the pool if face and charge qualify.');
  }
  const role = poolRoleForRecord(record);
  if (role === 'foil' && isMinorSexOffense(`${record.offense || ''}\n${record.additionalInfo || ''}`)) {
    flags.push('Charge text looks like a child-victim offense. Use Reclassify if this should be a target.');
  }
  if (role === 'target' && record.offense && !isMinorSexOffense(`${record.offense || ''}\n${record.additionalInfo || ''}`)) {
    flags.push('Charge text does not clearly name a child victim. Use Reclassify if this should be an adult-victim foil.');
  }
  return flags;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

async function bakeRotatedImage(src, degrees) {
  const normalized = ((Number(degrees) % 360) + 360) % 360;
  if (!normalized) return null;
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  const swap = normalized % 180 !== 0;
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function emptyStats(records, decisions) {
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  for (const rec of records) {
    const status = decisions[rec.image]?.status;
    if (status === 'accepted') accepted += 1;
    else if (status === 'rejected') rejected += 1;
    else pending += 1;
  }
  return { total: records.length, pending, accepted, rejected };
}

const SOURCE_NAMES = SOURCE_TITLES;

const PREFERRED_SOURCES = new Set([
  'al-blount-jail',
  'al-pickens-jail',
  'al-colbert-jail',
  'al-franklin-jail',
  'al-escambia-jail',
  'al-randolph-jail',
  'ar-scott-jail',
  'al-blount-sor',
  'al-pickens-sor',
  'al-colbert-sor',
  'al-franklin-sor',
  'al-escambia-sor',
  'al-randolph-sor',
  'ar-scott-sor',
]);

function sourceTitle(sourceId) {
  return SOURCE_NAMES[sourceId] || sourceId;
}

function sourceGroupTitle(group) {
  const base = sourceTitle(group.jailSourceId || group.sourceId);
  const role = group.poolRole || poolRoleForRecord(group.records?.[0] || {});
  return `${base} — ${poolRoleLabel(role, group.sourceType)}`;
}

function sourceTypeLabel(sourceType) {
  if (sourceType === 'county-jail' || sourceType === 'jail') return 'County jail';
  if (sourceType === 'state-prison' || sourceType === 'prison') return 'State prison mugshots';
  if (sourceType === 'sor' || sourceType === 'sex-offender-registry') return 'Sex offender registry';
  return sourceType || 'Source';
}

function groupSources(records, decisions) {
  const groups = new Map();
  for (const rec of records) {
    const groupKey = validationGroupKey(rec);
    const poolRole = poolRoleForRecord(rec);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        groupKey,
        sourceId: groupKey,
        jailSourceId: rec.sourceId || 'unknown',
        poolRole,
        sourceState: rec.sourceState || '',
        sourceType: rec.sourceType || '',
        records: [],
        pending: 0,
        accepted: 0,
        rejected: 0,
      });
    }
    const group = groups.get(groupKey);
    group.records.push(rec);
    const status = decisions[rec.image]?.status;
    if (status === 'accepted') group.accepted += 1;
    else if (status === 'rejected') group.rejected += 1;
    else group.pending += 1;
  }
  return [...groups.values()].sort((a, b) => {
    const ap = PREFERRED_SOURCES.has(a.jailSourceId) ? 0 : 1;
    const bp = PREFERRED_SOURCES.has(b.jailSourceId) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const county = sourceTitle(a.jailSourceId).localeCompare(sourceTitle(b.jailSourceId), undefined, {
      sensitivity: 'base',
    });
    if (county !== 0) return county;
    if (a.poolRole === 'target' && b.poolRole === 'foil') return -1;
    if (a.poolRole === 'foil' && b.poolRole === 'target') return 1;
    return 0;
  });
}

function applyStatusFilter(list, filter, decisions) {
  if (filter === 'accepted') return list.filter((row) => decisions[row.image]?.status === 'accepted');
  if (filter === 'rejected') return list.filter((row) => decisions[row.image]?.status === 'rejected');
  if (filter === 'pending') return list.filter((row) => !decisions[row.image]?.status);
  return list;
}

function useValidationRoute() {
  const read = () => parseValidationPath(window.location.pathname, window.location.search);
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const sync = () => setRoute(read());
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return route;
}

export default function ValidationScreen() {
  const route = useValidationRoute();
  const selectedSource = route.groupKey;
  const filter = route.filter;
  const reviewing = route.view === 'photo';
  const [records, setRecords] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [stats, setStats] = useState({ total: 0, pending: 0, accepted: 0, rejected: 0 });
  const [rotation, setRotation] = useState(0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [apiReady, setApiReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);

  const applySnapshot = useCallback((data) => {
    setRecords(data.records || []);
    setDecisions(data.decisions || {});
    setStats(data.stats || emptyStats(data.records || [], data.decisions || {}));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/validation/queue');
        if (!res.ok) throw new Error('Validation API unavailable');
        const data = await res.json();
        if (cancelled) return;
        applySnapshot(data);
        setApiReady(true);
        setError('');
      } catch {
        if (cancelled) return;
        applySnapshot({
          records: poolData.records || [],
          decisions: {},
          stats: emptyStats(poolData.records || [], {}),
        });
        setApiReady(false);
        setError('Start the app with npm run dev so Keep / Reject can write the validated database.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  const sources = useMemo(() => groupSources(records, decisions), [decisions, records]);
  const sourceRecords = useMemo(
    () => records.filter((row) => validationGroupKey(row) === selectedSource),
    [records, selectedSource],
  );
  const filtered = useMemo(
    () => applyStatusFilter(sourceRecords, filter, decisions),
    [decisions, filter, sourceRecords],
  );
  const currentSource = sources.find((row) => row.groupKey === selectedSource) || null;
  const current = reviewing ? sourceRecords.find((row) => row.image === route.image) || null : null;
  const currentDecision = current ? decisions[current.image] : null;
  const index = current ? filtered.findIndex((row) => row.image === current.image) : -1;
  const displayIndex = index >= 0 ? index : 0;

  useEffect(() => {
    if (!current) {
      setRotation(0);
      setNote('');
      return;
    }
    setRotation(currentDecision?.rotation || 0);
    setNote(currentDecision?.note || '');
  }, [current, currentDecision]);

  useEffect(() => {
    if (!loaded) return;
    if (route.view !== 'directory' && selectedSource && sources.length && !currentSource) {
      setError('That source is not in the current pool.');
      navigateValidation(validationDirectoryPath(), { replace: true });
      return;
    }
    if (route.view === 'photo' && route.image && sourceRecords.length && !current) {
      navigateValidation(validationSourcePath(route.sourceId, route.role, filter), { replace: true });
    }
  }, [current, currentSource, filter, loaded, route.image, route.role, route.sourceId, route.view, selectedSource, sourceRecords.length, sources.length]);

  useEffect(() => {
    if (route.view === 'directory') document.title = 'Validation';
    else if (route.view === 'photo' && route.image) document.title = `Validation — ${route.image}`;
    else document.title = currentSource ? `Validation — ${sourceGroupTitle(currentSource)}` : 'Validation';
    return () => {
      document.title = 'Appearance & Offense Identification Study';
    };
  }, [currentSource, route.image, route.view]);

  const decide = useCallback(
    async (status) => {
      if (!current || saving) return;
      if (!apiReady) {
        setError('Start the app with npm run dev so decisions can be saved.');
        return;
      }
      setSaving(true);
      setError('');
      try {
        const imageSrc = `/images/${current.image}`;
        const imageData = status === 'accepted' ? await bakeRotatedImage(imageSrc, rotation) : null;
        const res = await fetch('/api/validation/decide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: current.image,
            status,
            rotation,
            note,
            imageData,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        applySnapshot(data);
        const nextFiltered = applyStatusFilter(sourceRecords, filter, data.decisions);
        if (!route.sourceId || !route.role) return;
        if (!nextFiltered.length) {
          navigateValidation(validationSourcePath(route.sourceId, route.role, filter), { replace: true });
        } else {
          const stillHere = nextFiltered.some((row) => row.image === current.image);
          let nextIndex;
          if (stillHere) {
            const idx = nextFiltered.findIndex((row) => row.image === current.image);
            nextIndex = Math.min(idx + 1, nextFiltered.length - 1);
          } else {
            nextIndex = Math.min(Math.max(index, 0), nextFiltered.length - 1);
          }
          navigateValidation(
            validationPhotoPath(route.sourceId, route.role, nextFiltered[nextIndex].image, filter),
            { replace: true },
          );
        }
      } catch (err) {
        setError(err.message || 'Could not save this decision.');
      } finally {
        setSaving(false);
      }
    },
    [apiReady, applySnapshot, current, filter, index, note, rotation, route.role, route.sourceId, saving, sourceRecords],
  );

  const resetSource = useCallback(async () => {
    if (!selectedSource || resetting || !apiReady) return;
    const title = currentSource ? sourceGroupTitle(currentSource) : selectedSource;
    const ok = window.confirm(
      `Reset ${title} completely?\n\nThis re-downloads photos from the sheriff site, clears all Keep/Reject decisions for this group, and rebuilds trials. Other groups are not changed.`,
    );
    if (!ok) return;
    setResetting(true);
    setError('');
    try {
      const res = await fetch('/api/validation/reset-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: selectedSource }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      applySnapshot(data);
      if (route.sourceId && route.role) {
        navigateValidation(validationSourcePath(route.sourceId, route.role, 'all'), { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Could not reset this source.');
    } finally {
      setResetting(false);
    }
  }, [apiReady, applySnapshot, currentSource, resetting, route.role, route.sourceId, selectedSource]);

  const resetAllDecisions = useCallback(async () => {
    if (resettingAll || !apiReady) return;
    const ok = window.confirm(
      'Clear every Keep / Reject decision?\n\nPhotos stay in the pool. Validated copies are removed and you review from scratch.',
    );
    if (!ok) return;
    setResettingAll(true);
    setError('');
    try {
      const res = await fetch('/api/validation/reset-decisions', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      applySnapshot(data);
    } catch (err) {
      setError(err.message || 'Could not clear keep/reject decisions.');
    } finally {
      setResettingAll(false);
    }
  }, [apiReady, applySnapshot, resettingAll]);

  const reclassify = useCallback(
    async (role) => {
      if (!current || saving || !apiReady) return;
      const staySourceId = route.sourceId || current.sourceId;
      const stayRole = route.role;
      setSaving(true);
      setError('');
      try {
        const res = await fetch('/api/validation/reclassify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: current.image, role }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Reclassify failed');
        if (staySourceId && stayRole) {
          const remaining = applyStatusFilter(
            (data.records || []).filter((row) => validationGroupKey(row) === `${staySourceId}::${stayRole}`),
            filter,
            data.decisions || {},
          );
          if (!remaining.length) {
            navigateValidation(validationSourcePath(staySourceId, stayRole, filter), { replace: true });
          } else {
            const nextIndex = Math.min(Math.max(index, 0), remaining.length - 1);
            navigateValidation(
              validationPhotoPath(staySourceId, stayRole, remaining[nextIndex].image, filter),
              { replace: true },
            );
          }
        }
        applySnapshot(data);
      } catch (err) {
        setError(err.message || 'Could not reclassify this record.');
      } finally {
        setSaving(false);
      }
    },
    [apiReady, applySnapshot, current, filter, index, route.role, route.sourceId, saving],
  );

  const undo = useCallback(async () => {
    if (!current || saving || !currentDecision) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/validation/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: current.image }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Undo failed');
      applySnapshot(data);
    } catch (err) {
      setError(err.message || 'Could not undo this decision.');
    } finally {
      setSaving(false);
    }
  }, [applySnapshot, current, currentDecision, saving]);

  useEffect(() => {
    function onKey(event) {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!reviewing || !route.sourceId || !route.role) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = filtered[Math.min(filtered.length - 1, Math.max(index, 0) + 1)];
        if (next) navigateValidation(validationPhotoPath(route.sourceId, route.role, next.image, filter));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const prev = filtered[Math.max(0, (index >= 0 ? index : 0) - 1)];
        if (prev) navigateValidation(validationPhotoPath(route.sourceId, route.role, prev.image, filter));
      } else if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setRotation((deg) => (deg + 270) % 360);
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        setRotation((deg) => (deg + 90) % 360);
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        decide('rejected');
      } else if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        decide('accepted');
      } else if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        undo();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        navigateValidation(validationSourcePath(route.sourceId, route.role, filter));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, filter, filtered, index, reviewing, route.role, route.sourceId, undo]);

  const flags = current ? reviewFlags(current, sourceRecords) : [];
  const swap = rotation % 180 !== 0;

  return (
    <section className="screen active validation-screen">
      <header className="validation-top">
        <div>
          <p className="validation-kicker">Researcher tool</p>
          <h1>Validation</h1>
          <p className="lead">
            {selectedSource
              ? 'The photo preview uses the same crop and grayscale as a quiz card. Rotate first if the face is sideways. Reclassify if the charge is in the wrong group.'
              : 'Open a source first. Each card is one jail or registry in the pool.'}
          </p>
        </div>
        <div className="validation-top-actions">
          <button
            type="button"
            className="btn secondary"
            disabled={resettingAll || !apiReady || !loaded}
            onClick={resetAllDecisions}
          >
            {resettingAll ? 'Clearing…' : 'Clear keep/reject'}
          </button>
          <a className="btn secondary" href="/">
            Back to study
          </a>
        </div>
      </header>

      <div className="validation-stats">
        <div className="stat">
          <span className="stat-label">Pool</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Pending</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Kept</span>
          <span className="stat-value">{stats.accepted}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Rejected</span>
          <span className="stat-value">{stats.rejected}</span>
        </div>
      </div>

      {error && <p className="validation-error">{error}</p>}

      {!selectedSource ? (
        <div className="validation-directory">
          <h2>Sources</h2>
          {!loaded && <p className="validation-empty">Loading pool...</p>}
          <div className="validation-source-grid">
            {sources.map((source) => (
              <a
                key={source.groupKey}
                href={validationSourcePath(source.jailSourceId, source.poolRole)}
                className={`validation-source-card validation-source-card--${source.poolRole || 'foil'}${
                  source.sourceType === 'sex-offender-registry' ? ' validation-source-card--registry' : ''
                }`}
                onClick={handleValidationLinkClick}
              >
                <div className="validation-source-previews">
                  {source.records.slice(0, 4).map((row) => (
                    <img key={row.image} src={`/images/${row.image}`} alt="" />
                  ))}
                </div>
                <div className="validation-source-copy">
                  <strong>
                    {sourceGroupTitle(source)}
                    {PREFERRED_SOURCES.has(source.jailSourceId) ? (
                      <span className="validation-source-badge"> Preferred</span>
                    ) : null}
                  </strong>
                  <span className={`validation-pool-role-badge validation-pool-role-badge--${source.poolRole}${
                    source.sourceType === 'sex-offender-registry' ? ' validation-pool-role-badge--registry' : ''
                  }`}>
                    {poolRoleLabel(source.poolRole, source.sourceType)}
                  </span>
                  <span className="validation-source-id">{source.jailSourceId}</span>
                  <span>
                    {source.sourceState} | {sourceTypeLabel(source.sourceType)} | {source.records.length} photos
                  </span>
                  <span className="validation-source-counts">
                    {source.pending} pending | {source.accepted} kept | {source.rejected} rejected
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="validation-source-bar">
            <a className="btn secondary" href={validationDirectoryPath()} onClick={handleValidationLinkClick}>
              All sources
            </a>
            <div>
              <h2>{currentSource ? sourceGroupTitle(currentSource) : selectedSource}</h2>
              <p>
                {currentSource?.sourceState} | {sourceTypeLabel(currentSource?.sourceType)} |{' '}
                {currentSource?.jailSourceId}
              </p>
            </div>
          </div>

          {current ? (
            <div className="validation-review">
              <div className="validation-photo-card">
                <p className="validation-quiz-kicker">Quiz card preview</p>
                <div className="suspect-card validation-quiz-card">
                  <div className="suspect-label">A</div>
                  <div className="photo-wrap">
                    <img
                      src={`/images/${current.image}`}
                      alt={`Booking photo ${current.image}`}
                      style={{
                        transform: `rotate(${rotation}deg) scale(${swap ? 260 / 200 : 1})`,
                      }}
                    />
                  </div>
                </div>
                <div className="validation-photo-tools">
                  <button type="button" className="btn secondary" onClick={() => setRotation((deg) => (deg + 270) % 360)}>
                    Rotate left
                  </button>
                  <span className="validation-rotation">{rotation}{'\u00b0'}</span>
                  <button type="button" className="btn secondary" onClick={() => setRotation((deg) => (deg + 90) % 360)}>
                    Rotate right
                  </button>
                </div>
                <div className="validation-actions validation-actions--photo">
                  <button
                    type="button"
                    className="btn validation-reject"
                    disabled={saving || !loaded}
                    onClick={() => decide('rejected')}
                  >
                    Reject <kbd>K</kbd>
                  </button>
                  <button
                    type="button"
                    className="btn validation-keep"
                    disabled={saving || !loaded}
                    onClick={() => decide('accepted')}
                  >
                    Pass <kbd>L</kbd>
                  </button>
                </div>
                <button
                  type="button"
                  className="btn secondary validation-reclassify"
                  disabled={saving || !loaded || !apiReady}
                  onClick={() =>
                    reclassify(poolRoleForRecord(current) === 'target' ? 'foil' : 'target')
                  }
                >
                  {poolRoleForRecord(current) === 'target'
                    ? 'Reclassify as adult-victim'
                    : 'Reclassify as child-victim'}
                </button>
                <p className="validation-hint">
                  {filtered.length ? `${displayIndex + 1} of ${filtered.length} in this source` : 'No records'}
                  {currentDecision ? ` | already ${currentDecision.status}` : ' | not reviewed yet'}
                </p>
              </div>

              <div className="validation-profile">
                <h2>Profile</h2>
                <dl className="validation-fields">
                  {profileRows(current).map((row) => (
                    <div
                      key={row.label}
                      className={`${row.missing ? 'is-missing' : ''}${row.full ? ' is-full' : ''}`.trim()}
                    >
                      <dt>{row.label}</dt>
                      <dd>{row.missing ? MISSING : row.value}</dd>
                    </div>
                  ))}
                </dl>

                {flags.length > 0 && (
                  <div className="validation-flags">
                    <h2>Check before keeping</h2>
                    <ul>
                      {flags.map((flag) => (
                        <li key={flag}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <label className="validation-note">
                  Reviewer note
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={400}
                    placeholder="Optional: crop issue, wrong charge, possible juvenile, etc."
                  />
                </label>

                <div className="validation-nav">
                  <a
                    className="btn secondary"
                    href={route.sourceId && route.role ? validationSourcePath(route.sourceId, route.role, filter) : validationDirectoryPath()}
                    onClick={handleValidationLinkClick}
                  >
                    Close
                  </a>
                  {index > 0 && filtered[index - 1] && route.sourceId && route.role ? (
                    <a
                      className="btn secondary"
                      href={validationPhotoPath(route.sourceId, route.role, filtered[index - 1].image, filter)}
                      onClick={handleValidationLinkClick}
                    >
                      Previous
                    </a>
                  ) : (
                    <span className="btn secondary" aria-disabled="true">
                      Previous
                    </span>
                  )}
                  <button type="button" className="btn secondary" disabled={!currentDecision || saving} onClick={undo}>
                    Undo
                  </button>
                  {index >= 0 && index < filtered.length - 1 && filtered[index + 1] && route.sourceId && route.role ? (
                    <a
                      className="btn secondary"
                      href={validationPhotoPath(route.sourceId, route.role, filtered[index + 1].image, filter)}
                      onClick={handleValidationLinkClick}
                    >
                      Next
                    </a>
                  ) : (
                    <span className="btn secondary" aria-disabled="true">
                      Next
                    </span>
                  )}
                </div>
                <p className="validation-keys">
                  Rotate <kbd>A</kbd> <kbd>S</kbd> | Move <kbd>{'\u2190'}</kbd> <kbd>{'\u2192'}</kbd> | Undo{' '}
                  <kbd>U</kbd> | Close <kbd>Esc</kbd>
                </p>
              </div>
            </div>
          ) : (
            <div className="validation-empty">
              {loaded
                ? filtered.length
                  ? 'Click a photo below to keep or reject it.'
                  : 'No records in this filter.'
                : 'Loading pool...'}
            </div>
          )}

          <div className="validation-gallery">
            <div className="validation-gallery-head">
              <h2>Photos in this source</h2>
              <div className="validation-gallery-toolbar">
                <button
                  type="button"
                  className="btn validation-reset-source"
                  disabled={resetting || !apiReady || !loaded}
                  onClick={resetSource}
                  title="Re-download from sheriff site and clear all keep/reject for this source"
                >
                  {resetting ? 'Resetting…' : 'Reset source'}
                </button>
                <div className="validation-filters">
                {[
                  ['all', `All (${currentSource?.records.length || 0})`],
                  ['pending', `Pending (${currentSource?.pending || 0})`],
                  ['accepted', `Kept (${currentSource?.accepted || 0})`],
                  ['rejected', `Rejected (${currentSource?.rejected || 0})`],
                ].map(([id, label]) => (
                  <a
                    key={id}
                    href={
                      route.sourceId && route.role
                        ? validationSourcePath(route.sourceId, route.role, id)
                        : validationDirectoryPath()
                    }
                    className={`btn secondary${filter === id ? ' is-active' : ''}`}
                    onClick={handleValidationLinkClick}
                  >
                    {label}
                  </a>
                ))}
                </div>
              </div>
            </div>
            <div className="validation-thumbs">
              {filtered.map((row) => {
                const status = decisions[row.image]?.status;
                return (
                  <a
                    key={row.image}
                    href={
                      route.sourceId && route.role
                        ? validationPhotoPath(route.sourceId, route.role, row.image, filter)
                        : validationDirectoryPath()
                    }
                    className={`validation-thumb${row.image === current?.image ? ' is-current' : ''}${status ? ` is-${status}` : ''}`}
                    onClick={handleValidationLinkClick}
                  >
                    <img src={`/images/${row.image}`} alt={row.image} />
                    <span>{row.image.replace('.jpg', '')}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

