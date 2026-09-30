import { useMemo, useState } from 'react';
import { isValidationAvailable } from '../utils/localHost.js';
import { claimProtocolArm, checkDeviceCanStart, getDeviceContext } from '../utils/device.js';
import { hasActiveQuiz } from '../utils/quizProgress.js';
import { armForRetake, hasPublishedOnThisDevice } from '../utils/sessionLog.js';

export default function ConsentScreen({ onStart, onResume }) {
  const recordedDone = useMemo(() => hasPublishedOnThisDevice(), []);
  const inProgress = hasActiveQuiz();

  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const showTools = isValidationAvailable();

  const ageNumber = Number(age);
  const hasAge = age !== '' && Number.isFinite(ageNumber);
  const underage = hasAge && ageNumber < 18;
  const ageOk = Number.isInteger(ageNumber) && ageNumber >= 18 && ageNumber <= 100;

  const canStart =
    !inProgress &&
    consented &&
    !starting &&
    (recordedDone || (Boolean(gender) && ageOk));

  const handleStart = async () => {
    if (!canStart || underage) return;
    setStarting(true);
    setError(null);
    try {
      const device = await getDeviceContext();
      if (recordedDone) {
        onStart({
          device,
          isRetake: true,
          arm: armForRetake(),
        });
        return;
      }
      const gate = await checkDeviceCanStart(device);
      if (!gate.allowed) {
        onStart({
          device,
          isRetake: true,
          arm: armForRetake(),
        });
        return;
      }
      const arm = await claimProtocolArm(device.deviceId);
      onStart({
        device,
        arm,
        isRetake: false,
        demographics: { gender, age: ageNumber },
      });
    } catch (err) {
      setError(err.message || 'Could not start the study.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="screen active">
      <div className="panel">
        <h1>Can appearance predict offense type?</h1>
        <p className="lead">
          This short study tests whether people can tell a{' '}
          <strong>child-victim sex offense</strong> from other sex offenses using registry photos only.
        </p>

        <div className="info-box">
          <h2>Before you begin</h2>
          <ul>
            <li>
              You will see <strong>30 rounds</strong>. Each round shows <strong>three booking photos</strong> (A, B, C).
            </li>
            <li>
              Each session draws a <strong>new random set</strong> from photos already approved in validation. No photo is reused in the same session as a target or a foil. The three faces in a round are age-similar (official registry age if present, otherwise a model estimate).
            </li>
            <li>All three individuals are on a <strong>sex-offender registry</strong>.</li>
            <li>
              Each round is <strong>same-gender</strong> (currently all male) so gender is not a giveaway.
            </li>
            <li>
              In every round, <strong>exactly one</strong> person has a qualifying child-victim sex offense. The other two are registered for other sex offenses (typically adult victims).
            </li>
            <li>
              Pick the person you think committed the child-victim sex offense — <strong>A, B, or C only.</strong>
            </li>
            <li>You may or may not be shown whether each pick was correct.</li>
            <li>Photos are de-identified. No names or locations are shown.</li>
            <li>
              Estimated time: <strong>12–18 minutes</strong>.
            </li>
          </ul>
        </div>

        {inProgress ? (
          <div className="info-box">
            <p>You have a quiz in progress.</p>
            <button type="button" className="btn primary" onClick={onResume}>
              Continue quiz
            </button>
          </div>
        ) : null}

        {!inProgress ? (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={consented}
                onChange={(e) => setConsented(e.target.checked)}
              />
              <span>I am 18 or older and consent to participate in this anonymous research task.</span>
            </label>
            {consented ? (
              <div className="info-box demo-box">
                <h2>Quick anonymous questions</h2>
                <fieldset className="demo-fieldset">
                  <legend>Gender</legend>
                  <label>
                    <input type="radio" name="gender" value="male" checked={gender === 'male'} onChange={() => setGender('male')} />
                    Male
                  </label>
                  <label>
                    <input type="radio" name="gender" value="female" checked={gender === 'female'} onChange={() => setGender('female')} />
                    Female
                  </label>
                  <label>
                    <input type="radio" name="gender" value="other" checked={gender === 'other'} onChange={() => setGender('other')} />
                    Other
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="gender"
                      value="prefer_not"
                      checked={gender === 'prefer_not'}
                      onChange={() => setGender('prefer_not')}
                    />
                    Prefer not to say
                  </label>
                </fieldset>
                <label className="demo-age">
                  Age
                  <input
                    type="number"
                    min="1"
                    max="100"
                    inputMode="numeric"
                    value={age}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        setAge('');
                        return;
                      }
                      const next = Number(raw);
                      if (!Number.isFinite(next)) return;
                      setAge(String(Math.min(100, Math.floor(next))));
                    }}
                  />
                </label>
                {underage ? (
                  <p className="save-status is-error">You must be 18 or older to take part.</p>
                ) : null}
              </div>
            ) : null}
            {error ? <p className="save-status is-error">{error}</p> : null}
            <button type="button" className="btn primary" disabled={!canStart} onClick={handleStart}>
              {starting ? 'Starting…' : 'Start study'}
            </button>
          </>
        ) : null}

        {showTools ? (
          <p className="validation-entry">
            <a href="/validation">Validation</a>
            {' · '}
            <a href="/dashboard">Dashboard</a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
