import { compareText } from "../shared/order.ts";
import type { CategoryComparable } from "./categories.ts";
import type { ValueModel } from "./model.ts";
import type { ComparableModel } from "./selection.ts";
import { refitValueTrial } from "./value-fit.ts";
import { refitSelectedValue, type ValueTrialFit } from "./value-selection.ts";

export function cacheCalibrationFits(rows: readonly CategoryComparable[]) {
  // Only rows from this run can be cache keys. The ordered row IDs preserve
  // summation order, including through different paths to the same LOO subset.
  const ids = new Map(rows.map((row, i) => [row, `${i.toString(36)}:`]));
  const ordered = [...rows].sort((a, b) => compareText(a.slug, b.slug));
  const base = ordered.length + 1;
  const compact = base ** 3 <= Number.MAX_SAFE_INTEGER;
  const omittedKey = (train: readonly CategoryComparable[]) => {
    // Encode up to three omitted positions as nonzero digits in this run's base.
    let remaining = ordered.length - train.length;
    if (!compact || remaining < 0 || remaining > 3) return;
    let key = 0;
    let next = 0;
    for (let i = 0; i < ordered.length; i++) {
      if (next < train.length && ordered[i] === train[next]) next++;
      else {
        if (remaining === 0) return;
        remaining--;
        key = key * base + i + 1;
      }
    }
    if (next === train.length) return key;
  };
  const keys = new WeakMap<readonly CategoryComparable[], number | string>();
  const keyFor = (train: readonly CategoryComparable[]) => {
    let key = keys.get(train);
    if (key === undefined) {
      key =
        omittedKey(train) ??
        train
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
  const trialCache = Array.from({ length: 4 }, () => new Map<number | string, ComparableModel>());
  const fitTrial: ValueTrialFit = (train, terms) => {
    const index = Number(terms.includes("age")) + 2 * Number(terms.includes("category"));
    const cache = trialCache[index] as Map<number | string, ComparableModel>;
    const key = keyFor(train);
    const momentum = terms.includes("momentum");
    let fit = cache.get(key);
    if (!fit) {
      fit = refitValueTrial(train, terms);
      cache.set(key, fit);
    }
    return fit.momentum === momentum ? fit : { ...fit, momentum };
  };
  const selected = new Map<number | string, ValueModel>();
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
