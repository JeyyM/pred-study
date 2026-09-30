import { useState } from 'react';
import { isValidationAvailable } from '../utils/localHost.js';

export default function ConsentScreen({ onStart }) {
  const [consented, setConsented] = useState(false);
  const showValidation = isValidationAvailable();

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
            <li>Photos are de-identified. No names or locations are shown.</li>
            <li>
              Estimated time: <strong>12–18 minutes</strong>.
            </li>
          </ul>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
          />
          <span>I am 18 or older and consent to participate in this anonymous research task.</span>
        </label>

        <button type="button" className="btn primary" disabled={!consented} onClick={onStart}>
          Start study
        </button>

        {showValidation ? (
          <p className="validation-entry">
            <a href="/validation">Validation</a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
