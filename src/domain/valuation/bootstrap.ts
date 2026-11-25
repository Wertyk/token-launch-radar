export function resample<Row>(rows: readonly Row[], random: () => number): Row[] {
  return rows.map(() => rows[Math.floor(random() * rows.length)] as Row);
}

interface Replicate {
  ranked: readonly string[];
  coefficients: readonly number[];
}

export function bootstrapSummary(replicates: readonly Replicate[]) {
  const count = replicates.length;
  const rankSamples = new Map<string, number[]>();
  for (const { ranked } of replicates) {
    ranked.forEach((slug, i) => {
      const samples = rankSamples.get(slug) ?? [];
      samples.push(i + 1);
      rankSamples.set(slug, samples);
    });
  }
  const ranks = new Map(
    [...rankSamples].map(([slug, samples]) => {
      samples.sort((a, b) => a - b);
      // Inverse empirical CDF (nearest rank), with integer endpoints.
      return [
        slug,
        {
          rank_p10: samples[Math.ceil(0.1 * count) - 1] as number,
          rank_p90: samples[Math.ceil(0.9 * count) - 1] as number,
        },
      ];
    }),
  );
  const standardErrors = (replicates[0]?.coefficients ?? []).map((_, i) => {
    const values = replicates.map(({ coefficients }) => coefficients[i] as number);
    if (count < 2 || !values.every(Number.isFinite)) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / count;
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1));
  });
  return { ranks, standardErrors };
}
