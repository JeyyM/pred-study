import { useState } from 'react';

export default function ConsentScreen({ onStart, poolSize, remainingSessions }) {
  const [consented, setConsented] = useState(false);

  return (
    <section className="screen active">
      <div className="panel">
        <h1>Can appearance predict offense type?</h1>
        <p className="lead">
          This short study tests whether people can identify someone convicted of a{' '}
          <strong>sex offense involving a minor</strong> based only on a booking-style photo.
        </p>

        <div className="info-box">
          <h2>Before you begin</h2>
          <ul>
            <li>
              You will see <strong>18 rounds</strong>. Each round shows <strong>three booking photos</strong> (A, B, C).
            </li>
            <li>All three individuals have <strong>criminal records</strong> drawn from public sheriff sources across several states (not one jail).</li>
            <li>
              Each round is <strong>all male or all female</strong> — the three photos always share the same sex, so gender is not a giveaway. (This pool currently runs all-male lineups; photos that fail a gender consistency check are excluded.)
            </li>
            <li>
              In every round, <strong>exactly one</strong> person has a qualifying sex offense. The other two committed different crimes.
            </li>
            <li>
              Pick the person you think committed the sex offense — <strong>A, B, or C only.</strong>
            </li>
            <li>Offense details are revealed <strong>only after</strong> you answer.</li>
            <li>Photos are de-identified. No names or locations are shown. Faces must be visible — masked or obscured booking photos are excluded.</li>
            <li>
              Photos are pre-downloaded ({poolSize || '100+'}+ in the pool). Each full run uses{' '}
              <strong>54 fresh faces</strong> with no repeats within that run. Restarting pulls a new random
              set you have not seen yet (~{Math.max(remainingSessions, 0)} full replay
              {remainingSessions === 1 ? '' : 's'} left on this device).
            </li>
            <li>
              When you click Start, the app loads fresh photos and verifies each face is upright
              (using face detection) before trials begin.
            </li>
            <li>
              Booking photos are also auto-corrected on the server when downloaded — upside-down
              sheriff roster shots are flipped in place.
            </li>
            <li>
              Estimated time: <strong>8–12 minutes</strong>.
            </li>
          </ul>
        </div>

        <div className="info-box muted">
          <h2>Fair test design</h2>
          <p>
            This version uses forced choice among three photos each round, same-gender lineups, no repeated faces within a run, fresh photos on replay, randomized order, and mugshots from multiple sheriff offices. Chance guessing is 33%.
          </p>
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
      </div>
    </section>
  );
}
