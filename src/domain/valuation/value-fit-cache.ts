import type { CategoryComparable } from "./categories.ts";
import type { ValueModel } from "./model.ts";
import type { ComparableModel } from "./selection.ts";
import { refitValue } from "./value-fit.ts";
import { refitSelectedValue, type ValueTrialFit } from "./value-selection.ts";

export function cacheCalibrationFits(rows: readonly CategoryComparable[]) {
  // Only rows from this run can be cache keys. The ordered row IDs preserve
  // summation order, including through different paths to the same LOO subset.
  const ids = new Map(rows.map((row, i) => [row, `${i.toString(36)}:`]));
  const keys = new WeakMap<readonly CategoryComparable[], string>();
  const keyFor = (train: readonly CategoryComparable[]) => {
    let key = keys.get(train);
    if (key === undefined) {
      key = train
        .map((row) => {
          const id = ids.get(row);
          if (id === undefined)
            throw new Error("Calibration fit contains a row outside its input.");
          return id;
        })
        .join("");
      keys.set(train, key);
    }
    return key;
  };
  // Momentum reuses the fitted TVL slope. Age and category change the fit.
  const trialCache = Array.from({ length: 4 }, () => new Map<string, ComparableModel>());
  const fitTrial: ValueTrialFit = (train, terms) => {
    const index = Number(terms.includes("age")) + 2 * Number(terms.includes("category"));
    const cache = trialCache[index] as Map<string, ComparableModel>;
    const key = keyFor(train);
    const momentum = terms.includes("momentum");
    let fit = cache.get(key);
    if (!fit) {
      const { coefficients, medianLnAge, categoryEffects } = refitValue(train, terms);
      fit = { coefficients, medianLnAge, ...(categoryEffects && { categoryEffects }), momentum };
      cache.set(key, fit);
    }
    return fit.momentum === momentum ? fit : { ...fit, momentum };
  };
  const selected = new Map<string, ValueModel>();
  return (train: readonly CategoryComparable[]) => {
    const key = keyFor(train);
    let model = selected.get(key);
    if (!model) {
      model = refitSelectedValue(train, fitTrial);
      selected.set(key, model);
    }
    return model;
  };
}
