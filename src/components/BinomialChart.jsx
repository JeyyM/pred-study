import { binomialPmf } from '../utils/binomial';

export default function BinomialChart({ n, k, p = 1 / 3, compact = false }) {
  const width = 640;
  const height = compact ? 200 : 280;
  const pad = compact
    ? { top: 22, right: 12, bottom: 28, left: 12 }
    : { top: 28, right: 16, bottom: 36, left: 16 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const values = Array.from({ length: n + 1 }, (_, i) => binomialPmf(n, i, p));
  const maxP = Math.max(...values);
  const barGap = 1;
  const barW = innerW / (n + 1);

  const x = (i) => pad.left + i * barW;
  const barH = (prob) => (prob / maxP) * innerH;
  const y = (prob) => pad.top + innerH - barH(prob);
  const expected = n * p;
  const expectedX = pad.left + expected * barW + barW / 2;

  return (
    <svg className="binomial-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Chance score distribution">
      <line
        x1={pad.left}
        x2={width - pad.right}
        y1={pad.top + innerH}
        y2={pad.top + innerH}
        className="binomial-axis"
      />
      <line
        x1={expectedX}
        x2={expectedX}
        y1={pad.top}
        y2={pad.top + innerH}
        className="binomial-expected"
      />
      {values.map((prob, i) => (
        <rect
          key={i}
          x={x(i) + barGap / 2}
          y={y(prob)}
          width={Math.max(1, barW - barGap)}
          height={barH(prob)}
          className={i === k ? 'binomial-bar is-score' : 'binomial-bar'}
        />
      ))}
      <text x={expectedX} y={pad.top - 8} textAnchor="middle" className="binomial-label">
        Chance ~{Math.round(expected)}
      </text>
      <text x={x(k) + barW / 2} y={y(values[k]) - 8} textAnchor="middle" className="binomial-score-label">
        You {k}
      </text>
      {[0, 10, 20, 30].filter((tick) => tick <= n).map((tick) => (
        <text key={tick} x={x(tick) + barW / 2} y={height - 10} textAnchor="middle" className="binomial-tick">
          {tick}
        </text>
      ))}
    </svg>
  );
}
