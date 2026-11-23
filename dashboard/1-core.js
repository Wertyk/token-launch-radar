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
    buildRadar: () => buildRadar,
    daysBetween: () => daysBetween,
    formatUsd: () => formatUsd,
    parseSnapshot: () => parseSnapshot,
    toBoard: () => toBoardRows
  });

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
      flags: slugsWithLikelyParent.has(row.protocol.slug) ? [...row.flags, "parent-protocol-likely"] : row.flags,
      decomposition: row.decomposition,
      plan_chain: row.plan.chain,
      plan_total_cost_usd: row.plan.totalCostUsd,
      plan_total_minutes: row.plan.totalMinutes
    }));
    return { rows };
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

  // src/domain/farming/plans.ts
  var DEFAULT_DEPOSIT_USD = 1e3;
  var BSC_GAS = { transactionUsd: 0.1, bridgeUsd: 0.5 };
  var GAS_ASSUMPTIONS = /* @__PURE__ */ new Map([
    ["Arbitrum", { transactionUsd: 0.09, bridgeUsd: 0.35 }],
    ["Avalanche", { transactionUsd: 0.15, bridgeUsd: 0.65 }],
    ["Base", { transactionUsd: 0.05, bridgeUsd: 0.3 }],
    ["Binance", BSC_GAS],
    ["BSC", BSC_GAS],
    ["Ethereum", { transactionUsd: 3, bridgeUsd: 8 }],
    ["Optimism", { transactionUsd: 0.07, bridgeUsd: 0.35 }],
    ["Polygon", { transactionUsd: 0.06, bridgeUsd: 0.5 }],
    ["Solana", { transactionUsd: 0.02, bridgeUsd: 0.4 }],
    ["Sui", { transactionUsd: 0.04, bridgeUsd: 0.55 }]
  ]);
  var DEFAULT_GAS = { transactionUsd: 0.45, bridgeUsd: 2.5 };
  var PLAYBOOKS = {
    dex: {
      enter: (deposit, name) => `Provide up to ${deposit} to a liquidity pool in ${name}. Save the pool and position details.`,
      exit: "Remove liquidity and reconcile the assets and fees received with the starting position."
    },
    lending: {
      enter: (deposit, name) => `Supply up to ${deposit} as collateral in ${name}. Record the rates and any collateral rules.`,
      exit: "Repay any open debt, then withdraw the collateral and reconcile the balance."
    },
    staking: {
      enter: (deposit, name) => `Stake or restake up to ${deposit} in ${name}. Record the receipt token or staking position.`,
      exit: "Request unstaking and put the applicable unlock or claim date on your calendar."
    },
    yield: {
      enter: (deposit, name) => `Deposit up to ${deposit} in a supported vault or yield strategy in ${name}. Record the shares received.`,
      exit: "Redeem the shares when eligible and record the returned assets and fees."
    },
    derivatives: {
      enter: (deposit, name) => `Post up to ${deposit} as margin in ${name} and record the market, margin rules and funding fees.`,
      exit: "Close any open exposure, then withdraw unused margin and reconcile fees and balances."
    },
    bridge: {
      enter: (deposit, name) => `Use a route offered by ${name} to bridge up to ${deposit}. Record the destination, quoted fee and minimum received.`,
      exit: "Verify the destination balance and save both the sending and receiving transaction IDs."
    },
    rwa: {
      enter: (deposit, name) => `Check eligibility, minimums and redemption terms for ${name}. Subscribe with up to ${deposit} if eligible.`,
      exit: "Check the redemption window and submit a redemption or record the earliest eligible date."
    },
    generic: {
      enter: (deposit, name) => `Check the official instructions for a supported deposit or transfer in ${name}. Use up to ${deposit} and save the confirmation.`,
      exit: "Use the documented withdrawal if available, then reconcile the balance and record any fees."
    }
  };
  var CATEGORY_GROUPS = /* @__PURE__ */ new Map([
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
    ["rwa", "rwa"]
  ]);
  function estimate(chain, isBridge) {
    const { transactionUsd, bridgeUsd } = (chain === null ? void 0 : GAS_ASSUMPTIONS.get(chain)) ?? DEFAULT_GAS;
    const entryUsd = isBridge ? bridgeUsd : transactionUsd;
    const followUpUsd = isBridge ? 0 : transactionUsd;
    const exitUsd = isBridge ? 0 : transactionUsd;
    const totalCostUsd = Math.round((bridgeUsd + entryUsd + followUpUsd + exitUsd) * 100) / 100;
    return { chain, bridgeUsd, entryUsd, followUpUsd, exitUsd, totalCostUsd };
  }
  function chooseChain(chains, isBridge) {
    let cheapest;
    for (const chain of chains) {
      const candidate = estimate(chain, isBridge);
      if (!cheapest || candidate.totalCostUsd < cheapest.totalCostUsd || candidate.totalCostUsd === cheapest.totalCostUsd && compareText(chain, cheapest.chain ?? "") < 0) {
        cheapest = candidate;
      }
    }
    return cheapest ?? estimate(null, isBridge);
  }
  function shorten(text, max) {
    const normalized = text.trim().replace(/\s+/g, " ");
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1).trimEnd()}…`;
  }
  function makeFarmPlan(protocol, depositUsd = DEFAULT_DEPOSIT_USD) {
    if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
      throw new Error("The farm plan needs a positive, finite deposit size.");
    }
    const group = CATEGORY_GROUPS.get(protocol.category?.trim().toLowerCase() ?? "") ?? "generic";
    const playbook = PLAYBOOKS[group];
    const isBridge = group === "bridge";
    const { chain, bridgeUsd, entryUsd, followUpUsd, exitUsd, totalCostUsd } = chooseChain(
      protocol.chains,
      isBridge
    );
    const deposit = formatUsd(depositUsd);
    const name = shorten(protocol.name, 140);
    const steps = [
      {
        action: chain === null ? `Verify a supported chain in the protocol documentation before setting aside ${deposit} and gas.` : `Set aside ${deposit} in a compatible wallet or account and check its gas balance.`,
        chain,
        costUsd: 0,
        minutes: 5
      },
      {
        action: "If funds are on another chain, confirm the receiving asset and use a supported bridge.",
        chain,
        costUsd: bridgeUsd,
        minutes: 10,
        note: "Budget this fee only if you need to bridge funds first."
      },
      {
        action: playbook.enter(deposit, name),
        chain,
        costUsd: entryUsd,
        minutes: 10
      },
      {
        action: isBridge ? "After 7 days, check the transfer record and reconcile the destination balance." : "After 7 days, check balances and log one small follow-up transaction if supported.",
        chain,
        costUsd: followUpUsd,
        minutes: 5
      },
      {
        action: playbook.exit,
        chain,
        costUsd: exitUsd,
        minutes: 10
      }
    ];
    return {
      chain,
      depositUsd,
      steps,
      totalCostUsd,
      totalMinutes: steps.reduce((sum, step) => sum + step.minutes, 0)
    };
  }
  function renderFarmStep(step) {
    const action = shorten(step.action, 280);
    const chain = shorten(step.chain ?? "Chain unlisted", 110);
    const note = step.note ? shorten(step.note, 100) : "";
    return `${action} | ${chain} | Est. fee ${formatUsd(step.costUsd)} | ${step.minutes} minutes${note ? ` | ${note}` : ""}`.trim();
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

  // src/domain/valuation/model.ts
  var RIDGE = 1e-6;
  var FITTED_KEYS = ["lnTvl", "lnAge"];
  function logAge(listedAt, asOf) {
    return Math.log(Math.max(1, daysBetween(listedAt, asOf)));
  }
  function featuresForFit(protocol, asOf, medianLnAge) {
    return {
      lnTvl: Math.log(protocol.tvl_usd),
      lnAge: protocol.listed_at === null ? medianLnAge : logAge(protocol.listed_at, asOf)
    };
  }
  function valueFeatures(protocol, asOf, medianLnAge) {
    const flags = [];
    if (protocol.change_7d === null) flags.push("growth-missing");
    if (protocol.listed_at === null) flags.push("age-missing");
    return {
      features: {
        ...featuresForFit(protocol, asOf, medianLnAge),
        growth: protocol.change_7d === null ? 0 : Math.log1p(clamp(protocol.change_7d, -50, 100) / 100)
      },
      flags
    };
  }
  function fittingSet(census) {
    const families = /* @__PURE__ */ new Map();
    const independent = [];
    for (const { protocol, status } of census) {
      if (status !== "traded" || protocol.mcap_usd === null) continue;
      const comparable = { ...protocol, mcap_usd: protocol.mcap_usd };
      const family = protocol.gecko_id;
      if (family === null) {
        independent.push(comparable);
        continue;
      }
      const prior = families.get(family);
      if (!prior || compareText(protocol.slug, prior.slug) < 0) families.set(family, comparable);
    }
    return [...independent, ...families.values()].sort((a, b) => compareText(a.slug, b.slug));
  }
  function fitValueModel(census, asOf) {
    const comparables = fittingSet(census);
    const n = comparables.length;
    if (n === 0) throw new Error("The value model needs at least one traded comparable.");
    const knownAges = comparables.flatMap(
      ({ slug, listed_at }) => listed_at === null ? [] : [{ slug, value: logAge(listed_at, asOf) }]
    );
    const medianLnAge = median(knownAges) ?? 0;
    const rows = comparables.map((protocol) => ({
      features: featuresForFit(protocol, asOf, medianLnAge),
      target: Math.log(protocol.mcap_usd)
    }));
    const featureStats = (key) => {
      let sum = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      for (const { features } of rows) {
        const value = features[key];
        sum += value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { mean: sum / n, range: { min, max } };
    };
    const tvl = featureStats("lnTvl");
    const age = featureStats("lnAge");
    const featureMeans = { lnTvl: tvl.mean, lnAge: age.mean };
    const featureRanges = { lnTvl: tvl.range, lnAge: age.range };
    const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n;
    const centered = rows.map(({ features, target }) => ({
      features: {
        lnTvl: features.lnTvl - featureMeans.lnTvl,
        lnAge: features.lnAge - featureMeans.lnAge
      },
      target: target - targetMean
    }));
    const normal = FITTED_KEYS.map(
      (first) => FITTED_KEYS.map(
        (second) => centered.reduce(
          (sum, row) => sum + row.features[first] * row.features[second],
          first === second ? RIDGE : 0
        )
      )
    );
    const rhs = FITTED_KEYS.map(
      (key) => centered.reduce((sum, row) => sum + row.features[key] * row.target, 0)
    );
    const [lnTvl, lnAge] = choleskySolve(normal, rhs);
    if (lnTvl === void 0 || lnAge === void 0) {
      throw new Error("The value model requires two fitted slopes.");
    }
    const intercept = targetMean - lnTvl * featureMeans.lnTvl - lnAge * featureMeans.lnAge;
    return { n, medianLnAge, featureMeans, featureRanges, coefficients: { intercept, lnTvl, lnAge } };
  }
  function predictValue(protocol, asOf, model) {
    const row = valueFeatures(protocol, asOf, model.medianLnAge);
    const {
      featureMeans,
      featureRanges,
      coefficients: { intercept, lnTvl, lnAge }
    } = model;
    const { features } = row;
    if (FITTED_KEYS.some((key) => {
      const { min, max } = featureRanges[key];
      return features[key] < min || features[key] > max;
    })) {
      row.flags.push("outside-comps-range");
    }
    const logValue = intercept + lnTvl * (features.lnTvl + features.growth) + lnAge * features.lnAge;
    const logBase = intercept + lnTvl * featureMeans.lnTvl + lnAge * featureMeans.lnAge;
    const valueUsd = Math.exp(logValue);
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
  function buildRadar(snapshot) {
    const { protocols, watchlist, as_of } = snapshot;
    const families = groupFamilies(protocols);
    const entries = buildCensus(protocols, families);
    const comparables = families.flatMap(
      ({ key, representative, tvl_usd, mcap_usd }) => mcap_usd === null ? [] : [
        {
          protocol: { ...representative, tvl_usd, mcap_usd },
          familyKey: key,
          ...classify(representative, mcap_usd)
        }
      ]
    );
    const model = fitValueModel(comparables, as_of);
    const ranked = rankBoard(boardEntries(entries, watchlist), as_of, model);
    const board = ranked.map((row) => {
      const plan = makeFarmPlan(row.protocol);
      return { ...row, plan, farm_steps: plan.steps.map(renderFarmStep) };
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
  return __toCommonJS(browser_api_exports);
})();
