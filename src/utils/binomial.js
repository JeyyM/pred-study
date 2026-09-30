function logFact(n) {
  let sum = 0;
  for (let i = 2; i <= n; i += 1) sum += Math.log(i);
  return sum;
}

export function binomialPmf(n, k, p) {
  if (k < 0 || k > n) return 0;
  return Math.exp(logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

export function binomialCdf(n, k, p) {
  let sum = 0;
  for (let i = 0; i <= k; i += 1) sum += binomialPmf(n, i, p);
  return sum;
}

export function binomialSf(n, k, p) {
  let sum = 0;
  for (let i = k; i <= n; i += 1) sum += binomialPmf(n, i, p);
  return sum;
}

export function formatChancePct(value) {
  if (!Number.isFinite(value) || value <= 0) return '<0.01%';
  const pct = value * 100;
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

export function binomialSummary(n, k, p = 1 / 3) {
  const expected = n * p;
  const exact = binomialPmf(n, k, p);
  const atLeast = binomialSf(n, k, p);
  const atMost = binomialCdf(n, k, p);
  const aboveExpected = k >= expected;
  const tail = aboveExpected ? atLeast : atMost;
  const raw10k = tail * 10000;
  const per10k = raw10k < 0.5 ? 0 : Math.round(raw10k);
  return {
    n,
    k,
    p,
    expected,
    exact,
    atLeast,
    atMost,
    aboveExpected,
    tail,
    per10k,
  };
}
