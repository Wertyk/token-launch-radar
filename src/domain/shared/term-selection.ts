type Scores = readonly (number | null)[];

export interface SelectionStep<Term> {
  baseline: Scores;
  trials: { term: Term; scores: Scores; kept: boolean }[];
}

// Compare in candidate order on ties. Scores use the original units of each error.
export function selectTerms<Term>(
  candidates: readonly Term[],
  evaluate: (terms: readonly Term[]) => Scores,
) {
  const terms: Term[] = [];
  const steps: SelectionStep<Term>[] = [];
  let scores = evaluate(terms);
  while (terms.length < candidates.length) {
    const trials = candidates
      .filter((term) => !terms.includes(term))
      .map((term) => ({
        term,
        scores: evaluate([...terms, term]),
        kept: false,
      }));
    let best: (typeof trials)[number] | undefined;
    let bestGain = 0;
    for (const trial of trials) {
      const gains = scores.map((error, i) => {
        const challenger = trial.scores[i];
        return error === null || challenger == null ? 0 : error - challenger;
      });
      const gain = gains.reduce((sum, value) => sum + value, 0);
      if (gains.every((value) => value > 0) && gain > bestGain) {
        best = trial;
        bestGain = gain;
      }
    }
    steps.push({ baseline: scores, trials });
    if (!best) break;
    best.kept = true;
    terms.push(best.term);
    scores = best.scores;
  }
  return { terms, steps, scores };
}
