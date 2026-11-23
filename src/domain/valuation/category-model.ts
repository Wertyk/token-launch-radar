import type { CategoryComparable, CategoryGroup } from "./categories.ts";
import { categoryTotals } from "./categories.ts";
import { choleskySolve } from "./linalg.ts";
import { logValue, prepareFit, restoreCoefficients } from "./model.ts";
import type { RidgeRow } from "./ridge.ts";
import { fitHuber } from "./ridge.ts";
import {
  innerFolds,
  LAMBDAS,
  modelFeatures,
  predictionsFor,
  selectByMedianError,
} from "./selection.ts";

interface GroupRow extends RidgeRow {
  group: number;
}

interface CategoryParameters {
  lambda: number;
  categoryPenaltyMultiple: number;
}

// The comparison retains the joint grid from the category-model trial.
const CATEGORY_MULTIPLES = [65_536, 1024, 256, 64, 16, 4, 1] as const;

function weightedCategoryFit(
  rows: readonly GroupRow[],
  weights: Float64Array,
  groupPenalty: readonly number[][],
  lambda: number,
): number[] {
  const groups = Array.from({ length: groupPenalty.length + 1 }, () => ({
    weight: 0,
    tvl: 0,
    age: 0,
    target: 0,
  }));
  let tvlSquared = 0;
  let ageSquared = 0;
  let tvlAge = 0;
  let tvlTarget = 0;
  let ageTarget = 0;
  // Each design row has one group indicator and two standardized continuous terms.
  for (const [index, { group, tvl, age, target }] of rows.entries()) {
    const stats = groups[group];
    if (!stats) throw new Error("Missing ridge group.");
    const weight = weights[index] ?? 1;
    const weightedTvl = weight * tvl;
    const weightedAge = weight * age;
    stats.weight += weight;
    stats.tvl += weightedTvl;
    stats.age += weightedAge;
    stats.target += weight * target;
    tvlSquared += weightedTvl * tvl;
    ageSquared += weightedAge * age;
    tvlAge += weightedTvl * age;
    tvlTarget += weightedTvl * target;
    ageTarget += weightedAge * target;
  }

  const totals = { weight: 0, tvl: 0, age: 0, target: 0 };
  for (const stats of groups) {
    totals.weight += stats.weight;
    totals.tvl += stats.tvl;
    totals.age += stats.age;
    totals.target += stats.target;
  }
  const contrasts = groups.slice(1);
  const normal = groupPenalty.map((line, i) => {
    const stats = contrasts[i];
    if (!stats) throw new Error("Missing ridge group.");
    const row = [stats.weight, ...line, stats.tvl, stats.age];
    row[i + 1] = (row[i + 1] ?? 0) + stats.weight;
    return row;
  });
  normal.unshift([totals.weight, ...contrasts.map(({ weight }) => weight), totals.tvl, totals.age]);
  normal.push(
    [totals.tvl, ...contrasts.map(({ tvl }) => tvl), (tvlSquared || 1) + lambda, tvlAge],
    [totals.age, ...contrasts.map(({ age }) => age), tvlAge, (ageSquared || 1) + lambda],
  );
  const solution = choleskySolve(normal, [
    totals.target,
    ...contrasts.map(({ target }) => target),
    tvlTarget,
    ageTarget,
  ]);
  const intercept = solution[0] ?? 0;
  for (let i = 1; i < groups.length; i++) solution[i] = (solution[i] ?? 0) + intercept;
  return solution;
}

function categoryResiduals(
  rows: readonly GroupRow[],
  coefficients: readonly number[],
  groups: number,
  residuals: Float64Array,
): void {
  const tvlSlope = coefficients[groups] ?? 0;
  const ageSlope = coefficients[groups + 1] ?? 0;
  let i = 0;
  for (const { target, group, tvl, age } of rows) {
    residuals[i++] = target - ((coefficients[group] ?? 0) + tvlSlope * tvl + ageSlope * age);
  }
}

export function fitCategoryModel(
  rows: readonly CategoryComparable[],
  { lambda, categoryPenaltyMultiple }: CategoryParameters,
) {
  const prepared = prepareFit(rows);
  const groupSizes = categoryTotals();
  const groupKeys = rows.map(({ category }) => category);
  for (const key of groupKeys) groupSizes[key]++;
  const groups = (Object.keys(groupSizes) as CategoryGroup[]).filter((key) => groupSizes[key] > 0);
  const shares = groups.map((category) => groupSizes[category] / rows.length);
  const design: GroupRow[] = prepared.design.map((row, i) => ({
    ...row,
    group: groups.indexOf(groupKeys[i] ?? "other"),
  }));

  // Use a separate unpenalized intercept and K−1 treatment contrasts. The
  // penalty applies to deviations from the family-weighted intercept.
  const contrastShares = shares.slice(1);
  const penalty = lambda * categoryPenaltyMultiple;
  const groupPenalty = contrastShares.map((left, i) =>
    contrastShares.map(
      (right, j) => penalty * ((i === j ? 1 : 0) + shares.length * left * right - left - right),
    ),
  );
  const { coefficients } = fitHuber(
    rows.length,
    (weights) => weightedCategoryFit(design, weights, groupPenalty, lambda),
    (coefficients, residuals) => categoryResiduals(design, coefficients, shares.length, residuals),
  );
  const centeredBase = shares.reduce((sum, share, i) => sum + share * (coefficients[i] ?? 0), 0);
  const categoryEffects = categoryTotals();
  groups.forEach((key, i) => {
    categoryEffects[key] = (coefficients[i] ?? 0) - centeredBase;
  });
  return {
    medianLnAge: prepared.metadata.medianLnAge,
    coefficients: restoreCoefficients(
      prepared,
      centeredBase,
      coefficients[shares.length] ?? 0,
      coefficients[shares.length + 1] ?? 0,
    ),
    categoryEffects,
  };
}

function categoryPredictions(
  rows: readonly CategoryComparable[],
  fit: ReturnType<typeof fitCategoryModel>,
) {
  return predictionsFor(
    rows,
    (row) => logValue(modelFeatures(row, fit.medianLnAge), fit) + fit.categoryEffects[row.category],
  );
}

export function selectCategoryFit(rows: readonly CategoryComparable[]): CategoryParameters {
  const multiples =
    new Set(rows.map(({ category }) => category)).size < 2
      ? [CATEGORY_MULTIPLES[0]]
      : CATEGORY_MULTIPLES;
  const candidates = LAMBDAS.flatMap((lambda) =>
    multiples.map((categoryPenaltyMultiple) => ({
      lambda,
      categoryPenaltyMultiple,
    })),
  ).sort(
    (a, b) =>
      b.lambda * b.categoryPenaltyMultiple - a.lambda * a.categoryPenaltyMultiple ||
      b.lambda - a.lambda ||
      b.categoryPenaltyMultiple - a.categoryPenaltyMultiple,
  );
  const strongest = { lambda: LAMBDAS[0], categoryPenaltyMultiple: CATEGORY_MULTIPLES[0] };
  return selectByMedianError(
    innerFolds(rows),
    candidates,
    strongest,
    ({ train, test }, parameters) => categoryPredictions(test, fitCategoryModel(train, parameters)),
  );
}

export function nestedCategoryPredictions(
  train: readonly CategoryComparable[],
  test: readonly CategoryComparable[],
) {
  return categoryPredictions(test, fitCategoryModel(train, selectCategoryFit(train)));
}
