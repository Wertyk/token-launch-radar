export const ASSUMPTIONS_AS_OF = "2026-11-14";

/**
 * V estimates circulating launch market cap from DefiLlama's circulating market caps.
 * With 10–20% of supply circulating at launch, a mostly unlocked airdrop of
 * 5–10% of total supply can represent a large share of the launch float.
 * Assume a conservative 25% of circulating launch cap for the airdrop pool.
 */
const defaults = {
  asOf: ASSUMPTIONS_AS_OF,
  airdropShareOfLaunchCap: 0.25,
  farmerHaircut: 0.5,
  hourlyRateUsd: 25,
  // Yield-bearing deposits keep their base yield. Compare the same asset in a
  // vault without an airdrop. Non-yielding deposits forgo the cash rate.
  capitalApr: { yieldBearing: 0, nonYielding: 0.05 },
  horizonMonths: 12,
  monthsPerYear: 12,
  weeksPerYear: 52,
  minutesPerHour: 60,
  depositsUsd: [1_000, 10_000],
  tradeVolumeUsd: 200,
  tradingFeeRate: 0.0006,
  setupMinutes: 5,
  bridgeMinutes: 10,
} as const;

export { defaults as FARM_ASSUMPTIONS };
