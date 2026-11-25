// Integrate survival until launch or one year, whichever comes first.
export function expectedHoldYears(p12: number, capYears = 1): number {
  if (p12 === 0) return capYears;
  const hazard = -Math.log1p(-p12);
  return -Math.expm1(-hazard * capYears) / hazard;
}
