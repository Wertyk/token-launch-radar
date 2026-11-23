interface Bin {
  count: number;
  recorded: number;
}

export function pava(bins: readonly Bin[]): number[] {
  const pools: (Bin & { size: number })[] = [];
  for (const bin of bins) {
    pools.push({ ...bin, size: 1 });
    while (pools.length > 1) {
      const left = pools.at(-2);
      const right = pools.at(-1);
      if (!left || !right || left.recorded * right.count <= right.recorded * left.count) break;
      left.count += right.count;
      left.recorded += right.recorded;
      left.size += right.size;
      pools.pop();
    }
  }
  return pools.flatMap(({ count, recorded, size }) => Array<number>(size).fill(recorded / count));
}
