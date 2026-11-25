import { featureStats } from "../shared/math.ts";
import { addOuterProduct, choleskySolve, zeroMatrix } from "../valuation/linalg.ts";

const MAX_ITERATIONS = 80;
const TOLERANCE = 1e-10;

export function sigmoid(logit: number): number {
  const exp = Math.exp(-Math.abs(logit));
  return logit < 0 ? exp / (1 + exp) : 1 / (1 + exp);
}

export function linearScore(features: readonly number[], coefficients: readonly number[]): number {
  return dot([1, ...features], coefficients);
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, value, i) => sum + value * (b[i] ?? 0), 0);
}

/** Newton/IRLS for summed logistic loss plus penalty/2 times squared standardized slopes. */
export function fitLogistic(
  features: readonly (readonly number[])[],
  labels: readonly number[],
  penalty: number,
): number[] {
  const n = features.length;
  const width = (features[0]?.length ?? 0) + 1;
  if (!n || labels.length !== n)
    throw new Error("The token-status model needs labeled observations.");
  const rate = labels.reduce((sum, label) => sum + label, 0) / n;
  const coefficients = Array<number>(width).fill(0);
  coefficients[0] = Math.log(rate / (1 - rate));
  // A constant training label has a limiting intercept-only fit.
  if (rate === 0 || rate === 1) return coefficients;

  const stats = features[0]?.map((_, j) => featureStats(features.map((row) => row[j] ?? 0))) ?? [];
  const design = features.map((row) => [
    1,
    ...stats.map(({ mean, scale }, j) => ((row[j] ?? 0) - mean) / (scale || 1)),
  ]);

  const columns = coefficients.map((_, i) => i);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const gradient = coefficients.map((slope, j) => (j ? -penalty * slope : 0));
    const information = zeroMatrix(width);
    for (const [i, line] of information.entries()) line[i] = i ? penalty : 0;
    for (const [i, row] of design.entries()) {
      const logit = dot(row, coefficients);
      const probability = sigmoid(logit);
      const error = (labels[i] ?? 0) - probability;
      const weight = probability * sigmoid(-logit);
      addOuterProduct(information, row, weight, columns);
      for (const [j, value] of row.entries()) gradient[j] = (gradient[j] ?? 0) + value * error;
    }
    const delta = choleskySolve(information, gradient);
    const magnitude = Math.max(...delta.map(Math.abs));
    // Limit each step in logit space when far from the optimum.
    const maxLogitStep = Math.max(...design.map((row) => Math.abs(dot(row, delta))));
    const step = Math.min(1, 2 / maxLogitStep);
    delta.forEach((value, j) => {
      coefficients[j] = (coefficients[j] ?? 0) + step * value;
    });
    if (magnitude <= TOLERANCE) {
      const slopes = stats.map(({ scale }, j) => (coefficients[j + 1] ?? 0) / (scale || 1));
      const intercept = stats.reduce(
        (sum, { mean }, j) => sum - mean * (slopes[j] ?? 0),
        coefficients[0] ?? 0,
      );
      return [intercept, ...slopes];
    }
  }
  throw new Error("Token-status logistic fit did not converge.");
}
