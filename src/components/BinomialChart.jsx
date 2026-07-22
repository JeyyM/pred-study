import { useMemo } from 'react';
import {
  CHANCE_PER_TRIAL,
  binomialPmf,
  binomialSurvival,
  buildBinomialDistribution,
  formatPercent,
} from '../utils/binomial';

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 44, left: 44 };

export default function BinomialChart({ trials, score }) {
  const n = trials;
  const p = CHANCE_PER_TRIAL;

  const distribution = useMemo(() => buildBinomialDistribution(n, p), [n, p]);
  const maxProb = Math.max(...distribution.map((d) => d.prob));
  const expected = n * p;

  const pExact = binomialPmf(n, p, score);
  const pAtLeast = binomialSurvival(n, p, score);

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const barGap = 2;
  const barWidth = plotW / (n + 1) - barGap;

  const xFor = (k) => PAD.left + (k + 0.5) * (plotW / (n + 1));
  const yFor = (prob) => PAD.top + plotH - (prob / maxProb) * plotH;
  const expectedX = PAD.left + (expected / n) * plotW;

  return (
    <div className="binomial-chart">
      <h2>Luck vs. skill (binomial distribution)</h2>
      <p className="binomial-lead">
        If every answer were a random 33% guess across {n} rounds, this curve shows how often each total
        score would appear. Your result is marked in blue.
      </p>

      <svg
        className="binomial-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Binomial distribution for ${n} trials at 33 percent chance. Your score was ${score}.`}
      >
        <line
          x1={PAD.left}
          y1={PAD.top + plotH}
          x2={WIDTH - PAD.right}
          y2={PAD.top + plotH}
          className="binomial-axis"
        />
        <line
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + plotH}
          className="binomial-axis"
        />

        <text x={PAD.left} y={HEIGHT - 8} className="binomial-axis-label">
          Number correct (0–{n})
        </text>
        <text
          x={12}
          y={PAD.top + plotH / 2}
          className="binomial-axis-label binomial-axis-label-y"
          transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}
        >
          Probability
        </text>

        <line
          x1={expectedX}
          y1={PAD.top}
          x2={expectedX}
          y2={PAD.top + plotH}
          className="binomial-expected-line"
        />
        <text x={expectedX} y={PAD.top - 4} textAnchor="middle" className="binomial-expected-label">
          Expected ~{Math.round(expected)}
        </text>

        {distribution.map(({ k, prob }) => {
          const x = xFor(k) - barWidth / 2;
          const y = yFor(prob);
          const h = PAD.top + plotH - y;
          const isScore = k === score;
          return (
            <g key={k}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, prob > 0 ? 2 : 0)}
                className={isScore ? 'binomial-bar binomial-bar-you' : 'binomial-bar'}
                rx={2}
              />
              {isScore && (
                <text x={xFor(k)} y={y - 6} textAnchor="middle" className="binomial-you-label">
                  You ({k})
                </text>
              )}
              {(k === 0 || k === n || k % 3 === 0) && (
                <text x={xFor(k)} y={PAD.top + plotH + 16} textAnchor="middle" className="binomial-tick">
                  {k}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <dl className="binomial-stats">
        <div>
          <dt>Your score</dt>
          <dd>
            {score} / {n}
          </dd>
        </div>
        <div>
          <dt>Chance of exactly this many correct</dt>
          <dd>{formatPercent(pExact)}</dd>
        </div>
        <div>
          <dt>Chance of this many or more (pure guessing)</dt>
          <dd>{formatPercent(pAtLeast)}</dd>
        </div>
        <div>
          <dt>Expected by chance</dt>
          <dd>
            ~{expected.toFixed(1)} correct ({formatPercent(p, 0)} per round)
          </dd>
        </div>
      </dl>
    </div>
  );
}
