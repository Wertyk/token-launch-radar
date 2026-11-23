import { formatUsd } from "../shared/money.ts";
import { compareText } from "../shared/order.ts";
import type { Protocol } from "../snapshot.ts";

export const ASSUMPTIONS_AS_OF = "2026-11-14";
export const DEFAULT_DEPOSIT_USD = 1_000;

export interface FarmStep {
  action: string;
  chain: string | null;
  costUsd: number;
  minutes: number;
  note?: string;
}

export interface FarmPlan {
  chain: string | null;
  depositUsd: number;
  steps: FarmStep[];
  totalCostUsd: number;
  totalMinutes: number;
}

interface GasAssumptions {
  transactionUsd: number;
  bridgeUsd: number;
}

// Planning assumptions in USD as of ASSUMPTIONS_AS_OF. A bridge estimate includes gas.
const BSC_GAS = { transactionUsd: 0.1, bridgeUsd: 0.5 };
const GAS_ASSUMPTIONS = new Map<string, GasAssumptions>([
  ["Arbitrum", { transactionUsd: 0.09, bridgeUsd: 0.35 }],
  ["Avalanche", { transactionUsd: 0.15, bridgeUsd: 0.65 }],
  ["Base", { transactionUsd: 0.05, bridgeUsd: 0.3 }],
  ["Binance", BSC_GAS],
  ["BSC", BSC_GAS],
  ["Ethereum", { transactionUsd: 3, bridgeUsd: 8 }],
  ["Optimism", { transactionUsd: 0.07, bridgeUsd: 0.35 }],
  ["Polygon", { transactionUsd: 0.06, bridgeUsd: 0.5 }],
  ["Solana", { transactionUsd: 0.02, bridgeUsd: 0.4 }],
  ["Sui", { transactionUsd: 0.04, bridgeUsd: 0.55 }],
]);
const DEFAULT_GAS = { transactionUsd: 0.45, bridgeUsd: 2.5 };

interface Playbook {
  enter: (deposit: string, name: string) => string;
  exit: string;
}

const PLAYBOOKS = {
  dex: {
    enter: (deposit, name) =>
      `Provide up to ${deposit} to a liquidity pool in ${name}. Save the pool and position details.`,
    exit: "Remove liquidity and reconcile the assets and fees received with the starting position.",
  },
  lending: {
    enter: (deposit, name) =>
      `Supply up to ${deposit} as collateral in ${name}. Record the rates and any collateral rules.`,
    exit: "Repay any open debt, then withdraw the collateral and reconcile the balance.",
  },
  staking: {
    enter: (deposit, name) =>
      `Stake or restake up to ${deposit} in ${name}. Record the receipt token or staking position.`,
    exit: "Request unstaking and put the applicable unlock or claim date on your calendar.",
  },
  yield: {
    enter: (deposit, name) =>
      `Deposit up to ${deposit} in a supported vault or yield strategy in ${name}. Record the shares received.`,
    exit: "Redeem the shares when eligible and record the returned assets and fees.",
  },
  derivatives: {
    enter: (deposit, name) =>
      `Post up to ${deposit} as margin in ${name} and record the market, margin rules and funding fees.`,
    exit: "Close any open exposure, then withdraw unused margin and reconcile fees and balances.",
  },
  bridge: {
    enter: (deposit, name) =>
      `Use a route offered by ${name} to bridge up to ${deposit}. Record the destination, quoted fee and minimum received.`,
    exit: "Verify the destination balance and save both the sending and receiving transaction IDs.",
  },
  rwa: {
    enter: (deposit, name) =>
      `Check eligibility, minimums and redemption terms for ${name}. Subscribe with up to ${deposit} if eligible.`,
    exit: "Check the redemption window and submit a redemption or record the earliest eligible date.",
  },
  generic: {
    enter: (deposit, name) =>
      `Check the official instructions for a supported deposit or transfer in ${name}. Use up to ${deposit} and save the confirmation.`,
    exit: "Use the documented withdrawal if available, then reconcile the balance and record any fees.",
  },
} satisfies Record<string, Playbook>;

type Group = keyof typeof PLAYBOOKS;

const CATEGORY_GROUPS = new Map<string, Group>([
  ["dex", "dex"],
  ["dexs", "dex"],
  ["liquidity manager", "dex"],
  ["lending", "lending"],
  ["uncollateralized lending", "lending"],
  ["cdp", "lending"],
  ["cdp manager", "lending"],
  ["collateral markets", "lending"],
  ["liquid staking", "staking"],
  ["staking pool", "staking"],
  ["restaking", "staking"],
  ["liquid restaking", "staking"],
  ["restaked btc", "staking"],
  ["yield", "yield"],
  ["yield aggregator", "yield"],
  ["leveraged farming", "yield"],
  ["farm", "yield"],
  ["derivatives", "derivatives"],
  ["interest rate derivatives", "derivatives"],
  ["basis trading", "derivatives"],
  ["options", "derivatives"],
  ["options vault", "derivatives"],
  ["bridge", "bridge"],
  ["canonical bridge", "bridge"],
  ["cross chain bridge", "bridge"],
  ["rwa", "rwa"],
]);

function estimate(chain: string | null, isBridge: boolean) {
  const { transactionUsd, bridgeUsd } =
    (chain === null ? undefined : GAS_ASSUMPTIONS.get(chain)) ?? DEFAULT_GAS;
  const entryUsd = isBridge ? bridgeUsd : transactionUsd;
  const followUpUsd = isBridge ? 0 : transactionUsd;
  const exitUsd = isBridge ? 0 : transactionUsd;
  const totalCostUsd = Math.round((bridgeUsd + entryUsd + followUpUsd + exitUsd) * 100) / 100;
  return { chain, bridgeUsd, entryUsd, followUpUsd, exitUsd, totalCostUsd };
}

function chooseChain(chains: readonly string[], isBridge: boolean) {
  let cheapest: ReturnType<typeof estimate> | undefined;
  for (const chain of chains) {
    const candidate = estimate(chain, isBridge);
    if (
      !cheapest ||
      candidate.totalCostUsd < cheapest.totalCostUsd ||
      (candidate.totalCostUsd === cheapest.totalCostUsd &&
        compareText(chain, cheapest.chain ?? "") < 0)
    ) {
      cheapest = candidate;
    }
  }
  return cheapest ?? estimate(null, isBridge);
}

function shorten(text: string, max: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

export function makeFarmPlan(protocol: Protocol, depositUsd = DEFAULT_DEPOSIT_USD): FarmPlan {
  if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
    throw new Error("The farm plan needs a positive, finite deposit size.");
  }
  const group = CATEGORY_GROUPS.get(protocol.category?.trim().toLowerCase() ?? "") ?? "generic";
  const playbook = PLAYBOOKS[group];
  const isBridge = group === "bridge";
  const { chain, bridgeUsd, entryUsd, followUpUsd, exitUsd, totalCostUsd } = chooseChain(
    protocol.chains,
    isBridge,
  );
  const deposit = formatUsd(depositUsd);
  const name = shorten(protocol.name, 140);
  const steps: FarmStep[] = [
    {
      action:
        chain === null
          ? `Verify a supported chain in the protocol documentation before setting aside ${deposit} and gas.`
          : `Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,
      chain,
      costUsd: 0,
      minutes: 5,
    },
    {
      action:
        "If funds are on another chain, confirm the receiving asset and use a supported bridge.",
      chain,
      costUsd: bridgeUsd,
      minutes: 10,
      note: "Budget this fee only if you need to bridge funds first.",
    },
    {
      action: playbook.enter(deposit, name),
      chain,
      costUsd: entryUsd,
      minutes: 10,
    },
    {
      action: isBridge
        ? "After 7 days, check the transfer record and reconcile the destination balance."
        : "After 7 days, check balances and log one small follow-up transaction if supported.",
      chain,
      costUsd: followUpUsd,
      minutes: 5,
    },
    {
      action: playbook.exit,
      chain,
      costUsd: exitUsd,
      minutes: 10,
    },
  ];

  return {
    chain,
    depositUsd,
    steps,
    totalCostUsd,
    totalMinutes: steps.reduce((sum, step) => sum + step.minutes, 0),
  };
}

export function renderFarmStep(step: FarmStep): string {
  const action = shorten(step.action, 280);
  const chain = shorten(step.chain ?? "Chain unlisted", 110);
  const note = step.note ? shorten(step.note, 100) : "";
  return `${action} | ${chain} | Est. fee ${formatUsd(step.costUsd)} | ${step.minutes} minutes${note ? ` | ${note}` : ""}`.trim();
}
