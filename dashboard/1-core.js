var Radar = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/application/browser-api.ts
  var browser_api_exports = {};
  __export(browser_api_exports, {
    buildRadar: () => recomputeRadar,
    daysBetween: () => daysBetween,
    formatUsd: () => formatUsd,
    parseSnapshot: () => parseSnapshot,
    toBoard: () => toBoard
  });

  // src/application/board-rows.ts
  function toBoardRows(result) {
    const slugsWithLikelyParent = new Set(result.houseRule.falsePositives.map(({ slug }) => slug));
    const rows = result.board.map((row) => ({
      slug: row.protocol.slug,
      name: row.protocol.name,
      rank: row.rank,
      implied_value_usd: row.implied_value_usd,
      farm_steps: row.farm_steps,
      category: row.protocol.category,
      chains: row.protocol.chains,
      tvl_usd: row.protocol.tvl_usd,
      change_7d: row.protocol.change_7d,
      listed_at: row.protocol.listed_at,
      status: row.status,
      board_reasons: row.boardReasons,
      flags: [
        ...row.flags,
        ...slugsWithLikelyParent.has(row.protocol.slug) ? ["parent-protocol-likely"] : [],
        ...row.plan.flags
      ],
      decomposition: row.decomposition,
      plan_chain: row.plan.chain,
      plan_one_time_cost_usd: row.plan.oneTimeCostUsd,
      plan_recurring_cost_usd: row.plan.recurringCostUsd,
      plan_total_cost_usd: row.plan.totalCostUsd,
      plan_total_minutes: row.plan.totalMinutes,
      airdrop_yield_apr: row.economics.airdropYieldApr,
      farm_economics: {
        launchProbability12: row.economics.launchProbability12,
        deposits: row.economics.deposits,
        breakEvenDepositUsd: row.economics.breakEvenDepositUsd
      }
    }));
    return { rows };
  }

  // src/domain/shared/money.ts
  function formatUsd(value) {
    const [whole = "0", cents] = Math.abs(value).toFixed(2).split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const fraction = cents && cents !== "00" ? `.${cents}` : "";
    return `${value < 0 ? "-" : ""}$${grouped}${fraction}`;
  }

  // src/domain/snapshot.ts
  var DAY_MS = 864e5;
  var GREGORIAN_CYCLE_DAYS = 146097;
  function utcDay(iso, path) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const year = Number(iso.slice(0, 4));
      const month = Number(iso.slice(5, 7)) - 1;
      const day = Number(iso.slice(8, 10));
      const shifted = year < 100;
      const timestamp = Date.UTC(shifted ? year + 400 : year, month, day);
      const date = new Date(timestamp);
      if (date.getUTCMonth() === month && date.getUTCDate() === day) {
        return timestamp / DAY_MS - (shifted ? GREGORIAN_CYCLE_DAYS : 0);
      }
    }
    throw new Error(`${path}: expected a valid YYYY-MM-DD date`);
  }
  function daysBetween(fromIso, toIso) {
    return utcDay(toIso, "toIso") - utcDay(fromIso, "fromIso");
  }
  function object(value, path) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${path}: expected an object`);
    }
    return value;
  }
  function array(value, path) {
    if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
    return value;
  }
  function nonEmpty(value, path) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${path}: expected a non-empty string`);
    }
    return value;
  }
  function finite(value, path) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`${path}: expected a finite number`);
    }
    return value;
  }
  function dateString(value, path) {
    const iso = nonEmpty(value, path);
    utcDay(iso, path);
    return iso;
  }
  function nullable(value, path, parse) {
    return value === null ? null : parse(value, path);
  }
  function parseProtocol(value, index) {
    const path = `protocols[${index}]`;
    const raw = object(value, path);
    const tvlPath = `${path}.tvl_usd`;
    const tvl_usd = finite(raw.tvl_usd, tvlPath);
    if (tvl_usd <= 0) throw new Error(`${tvlPath}: expected a positive number`);
    return {
      slug: nonEmpty(raw.slug, `${path}.slug`),
      name: nonEmpty(raw.name, `${path}.name`),
      category: nullable(raw.category, `${path}.category`, nonEmpty),
      chains: array(raw.chains, `${path}.chains`).map(
        (chain, chainIndex) => nonEmpty(chain, `${path}.chains[${chainIndex}]`)
      ),
      tvl_usd,
      change_7d: nullable(raw.change_7d, `${path}.change_7d`, finite),
      mcap_usd: nullable(raw.mcap_usd, `${path}.mcap_usd`, finite),
      listed_at: nullable(raw.listed_at, `${path}.listed_at`, dateString),
      gecko_id: nullable(raw.gecko_id, `${path}.gecko_id`, nonEmpty),
      symbol: nullable(raw.symbol, `${path}.symbol`, nonEmpty)
    };
  }
  function parseSnapshot(value) {
    const raw = object(value, "snapshot");
    const as_of = dateString(raw.as_of, "as_of");
    const source = nonEmpty(raw.source, "source");
    const floor_usd = finite(raw.floor_usd, "floor_usd");
    const slugs = /* @__PURE__ */ new Set();
    const protocols = array(raw.protocols, "protocols").map((item, index) => {
      const protocol = parseProtocol(item, index);
      if (slugs.has(protocol.slug)) {
        throw new Error(`protocols[${index}].slug: duplicate slug ${JSON.stringify(protocol.slug)}`);
      }
      slugs.add(protocol.slug);
      return protocol;
    });
    const watchlist = array(raw.watchlist, "watchlist").map((item, index) => {
      const path = `watchlist[${index}]`;
      const slug = nonEmpty(item, path);
      if (!slugs.has(slug)) throw new Error(`${path}: unknown protocol slug ${JSON.stringify(slug)}`);
      return slug;
    });
    return { as_of, source, floor_usd, protocols, watchlist };
  }

  // src/domain/shared/order.ts
  function compareText(first, second) {
    if (first < second) return -1;
    if (first > second) return 1;
    return 0;
  }

  // src/domain/census/families.ts
  function familyKey({ slug, gecko_id }) {
    return gecko_id === null ? `slug:${slug}` : `gecko:${gecko_id}`;
  }
  function groupFamilies(protocols) {
    const families = /* @__PURE__ */ new Map();
    for (const protocol of [...protocols].sort((a, b) => compareText(a.slug, b.slug))) {
      const { tvl_usd, mcap_usd } = protocol;
      const key = familyKey(protocol);
      const marketCap = mcap_usd !== null && mcap_usd > 0 ? mcap_usd : null;
      const family = families.get(key);
      if (family) {
        family.members.push(protocol);
        family.tvl_usd += tvl_usd;
        family.mcap_usd ??= marketCap;
      } else {
        families.set(key, {
          key,
          representative: protocol,
          members: [protocol],
          tvl_usd,
          mcap_usd: marketCap
        });
      }
    }
    return [...families.values()];
  }

  // src/domain/census/census.ts
  var EXCLUDED_CATEGORIES = /* @__PURE__ */ new Set([
    "Bridge",
    "Canonical Bridge",
    "Liquid Staking",
    "Liquid Restaking",
    "Restaked BTC",
    "CEX"
  ]);
  var VERSION_SUFFIX = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
  var PRODUCT_WORD = /(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu;
  var EXCHANGE_NAME = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu;
  function tokenFields({ gecko_id, symbol }) {
    if (gecko_id !== null) return symbol === null ? "gecko_id" : "gecko_id and symbol";
    return symbol === null ? null : "symbol";
  }
  function exclusionReason(protocol) {
    const { category } = protocol;
    if (category !== null && EXCLUDED_CATEGORIES.has(category)) {
      return `Category ${category} is excluded by the house rule.`;
    }
    const name = protocol.name.trim();
    if (VERSION_SUFFIX.test(name)) {
      return "Name ends in a version marker.";
    }
    const productWord = name.match(PRODUCT_WORD)?.[0];
    if (productWord !== void 0) {
      return `Name contains the word “${productWord}”.`;
    }
    const exchange = name.match(EXCHANGE_NAME)?.[0];
    return exchange === void 0 ? null : `Name begins with an exchange name, “${exchange}”.`;
  }
  function classify(protocol, marketCap = protocol.mcap_usd) {
    if (marketCap !== null && marketCap > 0) {
      return { status: "traded", reason: "The family records a positive market cap." };
    }
    const fields = tokenFields(protocol);
    if (fields !== null) {
      return {
        status: "token-unpriced",
        reason: `The protocol records a token via ${fields} without a positive market cap.`
      };
    }
    const reason = exclusionReason(protocol);
    if (reason !== null) return { status: "excluded", reason };
    return { status: "pre-token", reason: "The protocol records no token." };
  }
  function buildCensus(protocols, families = groupFamilies(protocols)) {
    const marketCaps = new Map(families.map(({ key, mcap_usd }) => [key, mcap_usd]));
    return protocols.map((protocol) => {
      const key = familyKey(protocol);
      return { protocol, familyKey: key, ...classify(protocol, marketCaps.get(key) ?? null) };
    });
  }
  function checkHouseRule({
    protocols,
    floor_usd,
    watchlist
  }) {
    const watchlisted = new Set(watchlist);
    const matches = new Set(
      protocols.filter(
        (protocol) => protocol.tvl_usd >= floor_usd && tokenFields(protocol) === null && exclusionReason(protocol) === null
      ).map(({ slug }) => slug).sort(compareText)
    );
    const truePositives = [];
    const falsePositives = [];
    for (const slug of matches) {
      if (watchlisted.has(slug)) {
        truePositives.push(slug);
      } else {
        falsePositives.push({
          slug,
          reason: "DefiLlama names a parent protocol for it (parentProtocol), a field the snapshot does not carry"
        });
      }
    }
    const falseNegatives = [...watchlisted].filter((slug) => !matches.has(slug)).sort(compareText);
    return {
      truePositives,
      falsePositives,
      falseNegatives,
      recall: watchlisted.size === 0 ? 0 : truePositives.length / watchlisted.size,
      precision: matches.size === 0 ? 0 : truePositives.length / matches.size
    };
  }
  function boardEntries(census, watchlist) {
    const watchlisted = new Set(watchlist);
    const entries = [];
    for (const entry of census) {
      const boardReasons = [];
      if (entry.status === "pre-token") boardReasons.push("pre-token");
      if (watchlisted.has(entry.protocol.slug)) boardReasons.push("watchlist");
      if (boardReasons.length > 0) entries.push({ ...entry, boardReasons });
    }
    return entries;
  }

  // src/domain/farming/assumptions.ts
  var ASSUMPTIONS_AS_OF = "2026-11-14";
  var binance = [0.1, 0.5];
  var FARM_ASSUMPTIONS = {
    asOf: ASSUMPTIONS_AS_OF,
    airdropShareOfLaunchCap: 0.25,
    farmerHaircut: 0.5,
    hourlyRateUsd: 25,
    capitalApr: { yieldBearing: 0.02, nonYielding: 0.05 },
    horizonMonths: 12,
    monthsPerYear: 12,
    weeksPerYear: 52,
    minutesPerHour: 60,
    farmThreshold: 1.5,
    thinThreshold: 0.75,
    depositsUsd: [1e3, 1e4],
    tradeVolumeUsd: 200,
    tradingFeeRate: 6e-4,
    setupMinutes: 5,
    bridgeMinutes: 10,
    // Active minutes for entry, each recurring check, and exit.
    minutes: {
      lending: [12, 6, 10],
      dex: [15, 8, 12],
      derivatives: [15, 12, 10],
      yield: [12, 5, 9],
      staking: [10, 4, 10],
      rwa: [45, 6, 15],
      prediction: [12, 9, 8],
      bridge: [16, 4, 6],
      generic: [12, 5, 8]
    },
    // Planning estimates as of asOf, in USD per transaction and per bridge (including gas).
    chainFees: {
      Aptos: [0.03, 0.55],
      Arbitrum: [0.09, 0.35],
      Arc: [0.05, 0.5],
      Avalanche: [0.15, 0.65],
      Base: [0.05, 0.3],
      Berachain: [0.08, 0.5],
      Binance: binance,
      Bitcoin: [2, 7],
      BSC: binance,
      Ethereum: [3, 8],
      Flare: [0.03, 0.5],
      Hemi: [0.14, 0.85],
      "Hyperliquid L1": [0.12, 0.8],
      Ink: [0.05, 0.4],
      Katana: [0.07, 0.45],
      Linea: [0.12, 0.5],
      Mantle: [0.1, 0.5],
      Monad: [0.04, 0.4],
      Optimism: [0.07, 0.35],
      Plasma: [0.04, 0.45],
      "Plume Mainnet": [0.06, 0.5],
      Polygon: [0.06, 0.5],
      "Robinhood Chain": [0.06, 0.45],
      Solana: [0.02, 0.4],
      Sonic: [0.04, 0.45],
      Starknet: [0.12, 0.65],
      Stellar: [0.01, 0.45],
      Sui: [0.04, 0.55],
      Unichain: [0.05, 0.35],
      "zkSync Era": [0.12, 0.6]
    },
    defaultChainFees: [0.45, 2.5]
  };

  // src/domain/farming/economics.ts
  function estimateFarmEconomics(plan, valueUsd, tvlUsd, launchProbability) {
    const fixedCosts = plan.totalCostUsd + plan.totalMinutes / FARM_ASSUMPTIONS.minutesPerHour * FARM_ASSUMPTIONS.hourlyRateUsd;
    const horizonYears2 = FARM_ASSUMPTIONS.horizonMonths / FARM_ASSUMPTIONS.monthsPerYear;
    const capitalCarry = plan.capitalApr * horizonYears2;
    const k = valueUsd * FARM_ASSUMPTIONS.airdropShareOfLaunchCap * launchProbability * FARM_ASSUMPTIONS.farmerHaircut / tvlUsd;
    const atDeposit = (depositUsd) => {
      const expectedValueUsd = k * depositUsd;
      const costUsd = fixedCosts + depositUsd * capitalCarry;
      const ratio = expectedValueUsd / costUsd;
      const verdict = ratio >= FARM_ASSUMPTIONS.farmThreshold ? "FARM" : ratio >= FARM_ASSUMPTIONS.thinThreshold ? "THIN" : "SKIP";
      return { depositUsd, expectedValueUsd, costUsd, verdict };
    };
    const [small, large] = FARM_ASSUMPTIONS.depositsUsd;
    return {
      launchProbability12: launchProbability,
      airdropYieldApr: k / horizonYears2,
      deposits: [atDeposit(small), atDeposit(large)],
      breakEvenDepositUsd: k > capitalCarry ? fixedCosts / (k - capitalCarry) : "never"
    };
  }
  function renderEconomics({
    deposits: [atDeposit],
    breakEvenDepositUsd
  }) {
    const { depositUsd, expectedValueUsd, costUsd, verdict } = atDeposit;
    const breakEven = breakEvenDepositUsd === "never" ? "never" : `≈ ${formatUsd(breakEvenDepositUsd)}`;
    return `Economics at ${formatUsd(depositUsd)} over ${FARM_ASSUMPTIONS.horizonMonths} months · expected airdrop ≈ ${formatUsd(expectedValueUsd)} vs cost ≈ ${formatUsd(costUsd)} → ${verdict}. Break-even deposit ${breakEven}. Assumes ${FARM_ASSUMPTIONS.airdropShareOfLaunchCap * 100}% of circulating launch cap because a mostly unlocked airdrop can account for much of a small launch float.`;
  }

  // src/domain/farming/plans.ts
  var DEFAULT_DEPOSIT_USD = FARM_ASSUMPTIONS.depositsUsd[0];
  var PLAYBOOKS = {
    lending: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.yieldBearing,
      enter: "Supply collateral. Log the rate and liquidation limit if borrowing.",
      review: "Log the supply rate and check the health factor of any debt.",
      cadence: "monthly",
      exit: "Repay any debt and withdraw the collateral.",
      exitCondition: "At the horizon or sooner if collateral nears liquidation."
    },
    dex: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.yieldBearing,
      enter: "Add liquidity to one pool. Save its fee tier, price range and entry amounts.",
      review: "Compare pool value plus fees against holding. Rebalance if the range breaks.",
      cadence: "weekly",
      reviewGas: true,
      exit: "Remove liquidity and compare proceeds with holding the entry amounts.",
      exitCondition: "At the horizon or when fees fail to cover divergence loss."
    },
    derivatives: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.nonYielding,
      enter: "Post margin and record funding and liquidation terms.",
      review: `If eligible, open and close a small position within ${formatUsd(FARM_ASSUMPTIONS.tradeVolumeUsd)} of gross volume at ${(FARM_ASSUMPTIONS.tradingFeeRate * 100).toFixed(2)}% in trading fees. Log funding.`,
      cadence: "weekly",
      reviewGas: true,
      exit: "Close open positions and withdraw available margin.",
      exitCondition: "At the horizon or sooner if funding or margin hits your limit."
    },
    yield: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.yieldBearing,
      enter: "Deposit into a vault. Record shares, strategy, fees and withdrawal terms.",
      review: "Check share price, strategy changes and available exit liquidity.",
      cadence: "monthly",
      exit: "Redeem vault shares and record assets received.",
      exitCondition: "When withdrawals open at the horizon or after a strategy change."
    },
    staking: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.yieldBearing,
      enter: "Stake with a validator or pool. Record commission and the unbonding period.",
      review: "Check validator uptime, rewards and slashing notices.",
      cadence: "monthly",
      exit: "Request unstaking and schedule the claim after unbonding.",
      exitCondition: "Allow for unbonding before the horizon or exit after a slash."
    },
    rwa: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.yieldBearing,
      enter: "Allow time for eligibility checks and KYC. If approved, subscribe and log the redemption window.",
      review: "Check issuer updates, access restrictions and redemption liquidity.",
      cadence: "monthly",
      exit: "Submit a redemption and track settlement.",
      exitCondition: "At the first eligible window near the horizon or after a terms change."
    },
    prediction: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.nonYielding,
      enter: "Read one market’s resolution rules. Set a loss limit before buying shares.",
      review: "Check resolution updates and available bids for the position.",
      cadence: "weekly",
      exit: "Claim settled proceeds or close against available bids.",
      exitCondition: "At resolution, the loss limit or the horizon."
    },
    bridge: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.nonYielding,
      enter: "Quote the destination asset and minimum received. Send only after verifying both.",
      review: "Check unresolved transfers and follow the documented recovery path if needed.",
      cadence: "monthly",
      exit: "Reconcile the destination balance and save both transaction IDs.",
      exitCondition: "Once the transfer settles or recovery completes."
    },
    generic: {
      capitalApr: FARM_ASSUMPTIONS.capitalApr.nonYielding,
      enter: "Use a documented deposit or transfer and save the receipt.",
      review: "Check balances and changes to access or withdrawal terms.",
      cadence: "monthly",
      exit: "Withdraw through the documented route and reconcile proceeds.",
      exitCondition: "At the horizon or when access or withdrawal terms change."
    }
  };
  var categories = {
    dex: ["dex", "dexs", "liquidity manager"],
    lending: ["lending", "uncollateralized lending", "cdp", "cdp manager", "collateral markets"],
    staking: [
      "liquid staking",
      "staking pool",
      "restaking",
      "liquid restaking",
      "restaked btc",
      "staking"
    ],
    yield: [
      "yield",
      "yield aggregator",
      "leveraged farming",
      "farm",
      "onchain capital allocator",
      "risk curators"
    ],
    derivatives: [
      "derivatives",
      "interest rate derivatives",
      "basis trading",
      "options",
      "options vault",
      "perps"
    ],
    bridge: ["bridge", "canonical bridge", "cross chain bridge"],
    rwa: ["rwa"],
    prediction: ["prediction market", "prediction markets"],
    generic: []
  };
  var groups = new Map(
    Object.keys(categories).flatMap(
      (group) => categories[group].map((label) => [label, group])
    )
  );
  var chainFees = FARM_ASSUMPTIONS.chainFees;
  var horizonYears = FARM_ASSUMPTIONS.horizonMonths / FARM_ASSUMPTIONS.monthsPerYear;
  var occurrences = {
    once: 1,
    weekly: Math.floor(FARM_ASSUMPTIONS.weeksPerYear * horizonYears),
    monthly: FARM_ASSUMPTIONS.horizonMonths
  };
  function estimate(chain, bridge, reviewTransactions) {
    const fees = chain !== null && Object.hasOwn(chainFees, chain) ? chainFees[chain] : void 0;
    const [transactionUsd, bridgeUsd] = fees ?? FARM_ASSUMPTIONS.defaultChainFees;
    const cost = roundUsd(bridgeUsd + (bridge ? 0 : 2 + reviewTransactions) * transactionUsd);
    return { chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === void 0 };
  }
  function chooseChain(chains, bridge, reviewTransactions) {
    let cheapest;
    for (const chain of chains) {
      const candidate = estimate(chain, bridge, reviewTransactions);
      if (!cheapest || candidate.cost < cheapest.cost || candidate.cost === cheapest.cost && compareText(chain, cheapest.chain ?? "") < 0) {
        cheapest = candidate;
      }
    }
    return cheapest ?? estimate(null, bridge, reviewTransactions);
  }
  function shorten(text, max) {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
  }
  function roundUsd(value) {
    return Math.round(value * 100) / 100;
  }
  function makeFarmPlan(protocol, depositUsd = DEFAULT_DEPOSIT_USD) {
    if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
      throw new Error("The farm plan needs a positive, finite deposit size.");
    }
    const group = groups.get(protocol.category?.trim().toLowerCase() ?? "") ?? "generic";
    const playbook = PLAYBOOKS[group];
    const bridge = group === "bridge";
    const repeats = occurrences[playbook.cadence];
    const { chain, transactionUsd, bridgeUsd, feeAssumed } = chooseChain(
      protocol.chains,
      bridge,
      playbook.reviewGas ? repeats : 0
    );
    const [entryMinutes, reviewMinutes, exitMinutes] = FARM_ASSUMPTIONS.minutes[group];
    const tradingFees = group === "derivatives" ? FARM_ASSUMPTIONS.tradeVolumeUsd * FARM_ASSUMPTIONS.tradingFeeRate : 0;
    const deposit = formatUsd(depositUsd);
    const steps = [
      {
        action: chain === null ? `Verify a supported chain before setting aside ${deposit} and gas.` : `Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,
        chain,
        costUsd: 0,
        minutes: FARM_ASSUMPTIONS.setupMinutes,
        cadence: "once"
      }
    ];
    if (!bridge) {
      steps.push({
        action: "If funding from another chain, verify the receiving asset and bridge funds.",
        chain,
        costUsd: bridgeUsd,
        minutes: FARM_ASSUMPTIONS.bridgeMinutes,
        cadence: "once"
      });
    }
    steps.push(
      {
        action: `${shorten(protocol.name, 140)} — ${playbook.enter}`,
        chain,
        costUsd: bridge ? bridgeUsd : transactionUsd,
        minutes: entryMinutes,
        cadence: "once"
      },
      {
        action: playbook.review,
        chain,
        costUsd: roundUsd(tradingFees + (playbook.reviewGas ? transactionUsd : 0)),
        minutes: reviewMinutes,
        cadence: playbook.cadence
      },
      {
        action: playbook.exit,
        chain,
        costUsd: bridge ? 0 : transactionUsd,
        minutes: exitMinutes,
        cadence: "once",
        exitCondition: playbook.exitCondition
      }
    );
    let oneTimeCostUsd = 0;
    let recurringCostUsd = 0;
    let totalMinutes = 0;
    for (const { costUsd, minutes, cadence } of steps) {
      const count = occurrences[cadence];
      if (cadence === "once") oneTimeCostUsd += costUsd;
      else recurringCostUsd += costUsd * count;
      totalMinutes += minutes * count;
    }
    return {
      chain,
      depositUsd,
      steps,
      flags: feeAssumed ? ["fee-assumed"] : [],
      assumptionsAsOf: FARM_ASSUMPTIONS.asOf,
      horizonMonths: FARM_ASSUMPTIONS.horizonMonths,
      capitalApr: playbook.capitalApr,
      oneTimeCostUsd: roundUsd(oneTimeCostUsd),
      recurringCostUsd: roundUsd(recurringCostUsd),
      totalCostUsd: roundUsd(oneTimeCostUsd + recurringCostUsd),
      totalMinutes
    };
  }
  function renderFarmStep(step) {
    const action = shorten(step.action, 280);
    const chain = shorten(step.chain ?? "Chain unlisted", 110);
    const exit = step.exitCondition ? ` | Exit · ${shorten(step.exitCondition, 100)}` : "";
    return `${action} | ${chain} | Est. fee ${formatUsd(step.costUsd)} | ${step.minutes} minutes | ${step.cadence}${exit}`;
  }

  // src/domain/shared/math.ts
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function median(observations) {
    const sorted = [...observations].sort((a, b) => a.value - b.value || compareText(a.slug, b.slug));
    const mid = Math.floor(sorted.length / 2);
    const upper = sorted[mid];
    const lower = sorted[mid - 1];
    if (!upper) return void 0;
    return sorted.length % 2 === 0 && lower ? (lower.value + upper.value) / 2 : upper.value;
  }

  // src/domain/launch-clock/clock.ts
  var YEAR_DAYS = 365;
  function shareAt(points, age) {
    let left = points[0];
    if (!left) return 0;
    if (age <= left.ageDays) return left.share;
    for (const right of points) {
      if (age <= right.ageDays) {
        const fraction = (age - left.ageDays) / (right.ageDays - left.ageDays);
        return left.share + fraction * (right.share - left.share);
      }
      left = right;
    }
    return left.share;
  }
  function launchProbability12(points, age) {
    const now = shareAt(points, age);
    if (now === 1) return 0;
    return clamp((shareAt(points, age + YEAR_DAYS) - now) / (1 - now), 0, 1);
  }

  // src/domain/valuation/comparables.ts
  function logAge(listedAt, asOf) {
    return Math.log(Math.max(1, daysBetween(listedAt, asOf)));
  }
  function logMomentum(change) {
    return change === null ? 0 : Math.log1p(clamp(change, -50, 100) / 100);
  }
  function comparablesFromFamilies(families, asOf) {
    return families.flatMap(({ key, representative, tvl_usd, mcap_usd }) => {
      if (mcap_usd === null) return [];
      const { slug, listed_at, change_7d } = representative;
      return [
        {
          slug,
          familyKey: key,
          listedAt: listed_at,
          lnTvl: Math.log(tvl_usd),
          lnAge: listed_at === null ? null : logAge(listed_at, asOf),
          growth: logMomentum(change_7d),
          target: Math.log(mcap_usd)
        }
      ];
    });
  }

  // src/domain/valuation/linalg.ts
  function at(values, index) {
    const value = values[index];
    if (value === void 0) throw new Error("Incomplete linear system.");
    return value;
  }
  function choleskySolve(matrix, rhs) {
    const n = matrix.length;
    if (rhs.length !== n || matrix.some((row) => row.length !== n)) {
      throw new Error("The linear system requires a square matrix and a matching right-hand side.");
    }
    const lower = [];
    for (const [i, row] of matrix.entries()) {
      const factorRow = [];
      for (const [j, priorRow] of lower.entries()) {
        let residual = at(row, j);
        for (const [k, value] of factorRow.entries()) {
          residual -= value * at(priorRow, k);
        }
        factorRow.push(residual / at(priorRow, j));
      }
      const diagonal = factorRow.reduce((sum, value) => sum - value * value, at(row, i));
      if (!Number.isFinite(diagonal) || diagonal <= 0) {
        throw new Error("Cholesky factorization requires a positive-definite matrix.");
      }
      factorRow.push(Math.sqrt(diagonal));
      lower.push(factorRow);
    }
    const y = [];
    for (const [i, row] of lower.entries()) {
      let residual = at(rhs, i);
      for (const [j, value] of y.entries()) residual -= at(row, j) * value;
      y.push(residual / at(row, i));
    }
    const x = [];
    for (const [reverseIndex, row] of lower.toReversed().entries()) {
      const i = n - 1 - reverseIndex;
      let residual = at(y, i);
      for (let j = i + 1; j < n; j++) {
        const factorRow = lower[j];
        if (!factorRow) throw new Error("Incomplete Cholesky factor.");
        residual -= at(factorRow, i) * at(x, j);
      }
      x[i] = residual / at(row, i);
    }
    return x;
  }

  // src/domain/valuation/ridge.ts
  var HUBER_K = 1.345;
  var MAD_NORMAL_SCALE = 1.4826;
  var MIN_SCALE = 1e-8;
  var MAX_ITERATIONS = 20;
  var TOLERANCE = 1e-5;
  function weightedRidge(rows, weights, lambda) {
    let weightSum = 0;
    let tvlSum = 0;
    let ageSum = 0;
    let targetSum = 0;
    let tvlSquared = 0;
    let ageSquared = 0;
    let tvlAge = 0;
    let tvlTarget = 0;
    let ageTarget = 0;
    for (const [index, { tvl, age, target }] of rows.entries()) {
      const weight = weights[index] ?? 1;
      const weightedTvl = weight * tvl;
      const weightedAge = weight * age;
      weightSum += weight;
      tvlSum += weightedTvl;
      ageSum += weightedAge;
      targetSum += weight * target;
      tvlSquared += weightedTvl * tvl;
      ageSquared += weightedAge * age;
      tvlAge += weightedTvl * age;
      tvlTarget += weightedTvl * target;
      ageTarget += weightedAge * target;
    }
    if (lambda === 0 && tvlSquared > 0 && ageSquared > 0 && tvlAge ** 2 >= (1 - 8 * Number.EPSILON) * tvlSquared * ageSquared) {
      return [
        ...choleskySolve(
          [
            [weightSum, tvlSum],
            [tvlSum, tvlSquared]
          ],
          [targetSum, tvlTarget]
        ),
        0
      ];
    }
    return choleskySolve(
      [
        [weightSum, tvlSum, ageSum],
        [tvlSum, (tvlSquared || 1) + lambda, tvlAge],
        [ageSum, tvlAge, (ageSquared || 1) + lambda]
      ],
      [targetSum, tvlTarget, ageTarget]
    );
  }
  function medianInPlace(values) {
    const middle = Math.floor(values.length / 2);
    let low = 0;
    let high = values.length - 1;
    while (low < high) {
      const pivot = values[low + high >>> 1] ?? 0;
      let left = low;
      let right = high;
      while (left <= right) {
        while ((values[left] ?? pivot) < pivot) left++;
        while ((values[right] ?? pivot) > pivot) right--;
        if (left <= right) {
          const value = values[left] ?? pivot;
          values[left++] = values[right] ?? pivot;
          values[right--] = value;
        }
      }
      if (middle <= right) high = right;
      else if (middle >= left) low = left;
      else break;
    }
    const upper = values[middle] ?? 0;
    if (values.length % 2 !== 0) return upper;
    let lower = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < middle; i++) lower = Math.max(lower, values[i] ?? upper);
    return (lower + upper) / 2;
  }
  function madScale(residuals, scratch) {
    scratch.set(residuals);
    const center = medianInPlace(scratch);
    for (let i = 0; i < residuals.length; i++) scratch[i] = Math.abs((residuals[i] ?? 0) - center);
    return Math.max(MIN_SCALE, MAD_NORMAL_SCALE * medianInPlace(scratch));
  }
  function fitHuber(size, solve, evaluateResiduals, robust = true) {
    const weights = new Float64Array(size).fill(1);
    const residuals = new Float64Array(size);
    const scratch = new Float64Array(size);
    let coefficients = solve(weights);
    evaluateResiduals(coefficients, residuals);
    let huberScale = madScale(residuals, scratch);
    if (robust) {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const cutoff = HUBER_K * huberScale;
        for (let i = 0; i < residuals.length; i++) {
          weights[i] = Math.min(1, cutoff / Math.abs(residuals[i] ?? 0));
        }
        const next = solve(weights);
        const converged = next.every(
          (value, i) => Math.abs(value - (coefficients[i] ?? 0)) < TOLERANCE
        );
        coefficients = next;
        evaluateResiduals(coefficients, residuals);
        huberScale = madScale(residuals, scratch);
        if (converged) break;
      }
    }
    return { coefficients, huberScale };
  }
  function fitRidge(rows, lambda, robust) {
    return fitHuber(
      rows.length,
      (weights) => weightedRidge(rows, weights, lambda),
      ([intercept = 0, tvlSlope = 0, ageSlope = 0], residuals) => {
        let i = 0;
        for (const { target, tvl, age } of rows) {
          residuals[i++] = target - (intercept + tvlSlope * tvl + ageSlope * age);
        }
      },
      robust
    );
  }

  // src/domain/valuation/model.ts
  var FITTED_KEYS = ["lnTvl", "lnAge"];
  function valueFeatures(protocol, asOf, medianLnAge) {
    const flags = [];
    if (protocol.change_7d === null) flags.push("growth-missing");
    if (protocol.listed_at === null) flags.push("age-missing");
    return {
      features: {
        lnTvl: Math.log(protocol.tvl_usd),
        lnAge: protocol.listed_at === null ? medianLnAge : logAge(protocol.listed_at, asOf),
        growth: logMomentum(protocol.change_7d)
      },
      flags
    };
  }
  function featureStats(values) {
    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const value of values) {
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const mean = min === max ? min : sum / values.length;
    const scale = Math.sqrt(
      values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
    );
    return { mean, scale, range: { min, max } };
  }
  function prepareFit(rows, drop) {
    const n = rows.length;
    if (n === 0) throw new Error("The value model needs at least one traded comparable.");
    const medianLnAge = median(rows.flatMap(({ slug, lnAge }) => lnAge === null ? [] : [{ slug, value: lnAge }])) ?? 0;
    const tvl = featureStats(rows.map(({ lnTvl }) => lnTvl));
    const age = featureStats(rows.map(({ lnAge }) => lnAge ?? medianLnAge));
    const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n;
    const tvlScale = drop === "tvl" ? 0 : tvl.scale;
    const ageScale = drop === "age" ? 0 : age.scale;
    const design = rows.map((row) => ({
      target: row.target - targetMean,
      tvl: tvlScale ? (row.lnTvl - tvl.mean) / tvlScale : 0,
      age: ageScale ? ((row.lnAge ?? medianLnAge) - age.mean) / ageScale : 0
    }));
    return {
      design,
      targetMean,
      tvlScale,
      ageScale,
      metadata: {
        n,
        medianLnAge,
        featureMeans: { lnTvl: tvl.mean, lnAge: age.mean },
        featureRanges: { lnTvl: tvl.range, lnAge: age.range }
      }
    };
  }
  function restoreCoefficients({ targetMean, tvlScale, ageScale, metadata: { featureMeans } }, centeredIntercept, tvlSlope, ageSlope) {
    const lnTvl = tvlScale ? tvlSlope / tvlScale : 0;
    const lnAge = ageScale ? ageSlope / ageScale : 0;
    const intercept = targetMean + centeredIntercept - lnTvl * featureMeans.lnTvl - lnAge * featureMeans.lnAge;
    return { intercept, lnTvl, lnAge };
  }
  function fitValueModel(rows, lambda, { drop, robust = true } = {}) {
    const prepared = prepareFit(rows, drop);
    const {
      coefficients: [base = 0, tvl = 0, age = 0],
      huberScale
    } = fitRidge(prepared.design, lambda, robust);
    return {
      ...prepared.metadata,
      lambda,
      huberScale,
      coefficients: restoreCoefficients(prepared, base, tvl, age)
    };
  }
  function logValue({ lnTvl, growth, lnAge }, { coefficients }) {
    return coefficients.intercept + coefficients.lnTvl * (lnTvl + growth) + coefficients.lnAge * lnAge;
  }
  function predictValue(protocol, asOf, model) {
    const row = valueFeatures(protocol, asOf, model.medianLnAge);
    const { featureMeans, featureRanges, coefficients } = model;
    const { features } = row;
    if (FITTED_KEYS.some((key) => {
      const { min, max } = featureRanges[key];
      return features[key] < min || features[key] > max;
    })) {
      row.flags.push("outside-comps-range");
    }
    const { intercept, lnTvl, lnAge } = coefficients;
    const logBase = intercept + lnTvl * featureMeans.lnTvl + lnAge * featureMeans.lnAge;
    const valueUsd = Math.exp(logValue(features, model));
    return {
      ...row,
      valueUsd,
      implied_value_usd: clamp(Math.round(valueUsd), 1, 1e14),
      decomposition: {
        base: Math.exp(logBase),
        multipliers: {
          lnTvl: Math.exp(lnTvl * (features.lnTvl - featureMeans.lnTvl)),
          growth: Math.exp(lnTvl * features.growth),
          lnAge: Math.exp(lnAge * (features.lnAge - featureMeans.lnAge))
        }
      }
    };
  }
  function rankBoard(entries, asOf, model) {
    return entries.map((entry) => ({ ...entry, ...predictValue(entry.protocol, asOf, model) })).sort(
      (a, b) => b.implied_value_usd - a.implied_value_usd || compareText(a.protocol.slug, b.protocol.slug)
    ).map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  // src/application/build-radar.ts
  function radarInputs({ protocols, as_of }) {
    const families = groupFamilies(protocols);
    return { families, comparables: comparablesFromFamilies(families, as_of) };
  }
  function rankRadar(snapshot, { families, comparables }, lambda, launchClock) {
    const { protocols, watchlist, as_of } = snapshot;
    const entries = buildCensus(protocols, families);
    const model = fitValueModel(comparables, lambda);
    const ranked = rankBoard(boardEntries(entries, watchlist), as_of, model);
    const board = ranked.map((row) => {
      const { protocol, implied_value_usd } = row;
      const age = protocol.listed_at === null ? launchClock.medianAgeDays ?? 0 : Math.max(0, daysBetween(protocol.listed_at, as_of));
      const p12 = launchProbability12(launchClock.points, age);
      const plan = makeFarmPlan(protocol);
      const economics = estimateFarmEconomics(plan, implied_value_usd, protocol.tvl_usd, p12);
      return {
        ...row,
        plan,
        economics,
        farm_steps: [...plan.steps.map(renderFarmStep), renderEconomics(economics)]
      };
    });
    const census = entries.map(
      ({ protocol: { slug, name, category, tvl_usd }, ...classification }) => ({
        slug,
        name,
        category,
        tvl_usd,
        ...classification
      })
    );
    return { census, houseRule: checkHouseRule(snapshot), model, board };
  }
  function recomputeRadar(snapshot, lambda, launchClock) {
    return rankRadar(snapshot, radarInputs(snapshot), lambda, launchClock);
  }

  // src/application/browser-api.ts
  function samePrecision(a, b) {
    return a === b || Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) <= 1e-12;
  }
  function toBoard(radar, published = []) {
    const board = toBoardRows(radar);
    for (const [index, row] of board.rows.entries()) {
      const reference = published[index];
      if (!reference || row.slug !== reference.slug) continue;
      const a = row.decomposition;
      const b = reference.decomposition;
      if (samePrecision(a.base, b.base) && samePrecision(a.multipliers.lnTvl, b.multipliers.lnTvl) && samePrecision(a.multipliers.growth, b.multipliers.growth) && samePrecision(a.multipliers.lnAge, b.multipliers.lnAge)) {
        row.decomposition = b;
      }
    }
    return board;
  }
  return __toCommonJS(browser_api_exports);
})();
