/** Binomial PMF / tail probabilities for chance baseline (1-in-3 forced choice). */

export const CHANCE_PER_TRIAL = 1 / 3;

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i += 1) {
    result *= (n - i) / (i + 1);
  }
  return result;
}

export function binomialPmf(n, p, k) {
  if (k < 0 || k > n) return 0;
  return binomialCoefficient(n, k) * p ** k * (1 - p) ** (n - k);
}

/** P(X >= k) */
export function binomialSurvival(n, p, k) {
  let sum = 0;
  for (let i = k; i <= n; i += 1) {
    sum += binomialPmf(n, p, i);
  }
  return sum;
}

export function formatPercent(probability, digits = 1) {
  return `${(probability * 100).toFixed(digits)}%`;
}

export function buildBinomialDistribution(n, p = CHANCE_PER_TRIAL) {
  return Array.from({ length: n + 1 }, (_, k) => ({
    k,
    prob: binomialPmf(n, p, k),
  }));
}
