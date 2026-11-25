import { featureStats } from "../shared/math.ts";
import { diagonalPenalty, dot, weightedLeastSquares } from "../valuation/linalg.ts";

export function sigmoid(logit: number): number {
  const exp = Math.exp(-Math.abs(logit));
  return logit < 0 ? exp / (1 + exp) : 1 / (1 + exp);
}

export function linearScore(features: readonly number[], coefficients: readonly number[]): number {
  return dot([1, ...features], coefficients);
}

//! Logistic IRLS uses w = p(1−p) and z = logit + (label − p)/w.
export function fitLogistic(
  features: readonly (readonly number[])[],
  labels: readonly number[],
  lambda: number,
): number[] {
  const first = features[0];
  if (!first || labels.length !== features.length)
    throw new Error("Logistic fitting requires labeled rows.");
  const rate = labels.reduce((sum, label) => sum + label, 0) / labels.length;
  const coefficients = [Math.log(rate / (1 - rate)), ...first.map(() => 0)];
  // A constant training label has a limiting intercept-only fit.
  if (rate === 0 || rate === 1) return coefficients;

  const stats = first.map((_, j) => featureStats(features.map((row) => row[j] ?? 0)));
  const design = features.map((row) => [
    1,
    ...stats.map(({ mean, scale }, j) => ((row[j] ?? 0) - mean) / (scale || 1)),
  ]);
  const penalty = diagonalPenalty(coefficients.length, lambda);
  const weights: number[] = [];
  for (let iteration = 0; iteration < 80; iteration++) {
    const working = design.map((row, i) => {
      const logit = dot(row, coefficients);
      const p = sigmoid(logit);
      const weight = p * sigmoid(-logit);
      weights[i] = weight;
      return logit + ((labels[i] ?? 0) - p) / weight;
    });
    const next = weightedLeastSquares(design, working, weights, penalty);
    const delta = next.map((value, j) => value - (coefficients[j] ?? 0));
    // Limit each step in logit space when far from the optimum.
    const step = Math.min(1, 2 / Math.max(...design.map((row) => Math.abs(dot(row, delta)))));
    delta.forEach((value, j) => {
      coefficients[j] = (coefficients[j] ?? 0) + step * value;
    });
    if (delta.every((value) => Math.abs(value) <= 1e-10)) {
      const slopes = coefficients.slice(1).map((value, j) => value / (stats[j]?.scale || 1));
      const intercept = stats.reduce(
        (value, { mean }, j) => value - mean * (slopes[j] ?? 0),
        coefficients[0] ?? 0,
      );
      return [intercept, ...slopes];
    }
  }
  throw new Error("Token-status logistic fit did not converge.");
}
