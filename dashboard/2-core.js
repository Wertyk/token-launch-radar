(() => {
var ASSUMPTIONS_AS_OF = "2026-11-14"
var defaults = {
	asOf: ASSUMPTIONS_AS_OF,
	airdropShareOfLaunchCap: 0.25,
	farmerHaircut: 0.5,
	hourlyRateUsd: 25,
	// Yield-bearing deposits keep their base yield. Compare the same asset in a
	// vault without an airdrop. Non-yielding deposits forgo the cash rate.
	capitalApr: {yieldBearing: 0, nonYielding: 0.05},
	horizonMonths: 12,
	monthsPerYear: 12,
	weeksPerYear: 52,
	minutesPerHour: 60,
	depositsUsd: [1e3, 5e3, 1e4, 25e3],
	tradeVolumeUsd: 200,
	tradingFeeRate: 6e-4,
	setupMinutes: 5,
	bridgeMinutes: 10
}

function formatUsd(value) {
	const amount = Math.abs(value).toFixed(2).replace(/\.00$/, "")
	return `${value < 0 ? "-" : ""}$${amount.replace(/\B(?=(\d{3})+(?:\.|$))/g, ",")}`
}

function expectedHoldYears(p12, capYears = 1) {
	if (p12 === 0) return capYears
	const hazard = -Math.log1p(-p12)
	return -Math.expm1(-hazard * capYears) / hazard
}

function farmEconomicsTerms(plan, valueUsd, tvlUsd, launchProbability, settings = defaults) {
	const hours = plan.totalMinutes / settings.minutesPerHour
	const horizonYears = settings.horizonMonths / settings.monthsPerYear
	const {yieldBearing, nonYielding} = settings.capitalApr ?? defaults.capitalApr
	let capitalApr = plan.capitalApr
	if (capitalApr === defaults.capitalApr.yieldBearing) capitalApr = yieldBearing
	else if (capitalApr === defaults.capitalApr.nonYielding) capitalApr = nonYielding
	const capitalCarry = capitalApr * expectedHoldYears(launchProbability, horizonYears)
	const k = (valueUsd * settings.airdropShareOfLaunchCap * launchProbability * settings.farmerHaircut) / tvlUsd
	return {cashFees: plan.totalCostUsd, hours, horizonYears, capitalCarry, k}
}
function estimateFarmEconomics(plan, valueUsd, tvlUsd, launchProbability, settings = defaults) {
	const terms = farmEconomicsTerms(plan, valueUsd, tvlUsd, launchProbability, settings)
	const {cashFees, horizonYears, capitalCarry, k} = terms
	const atDeposit = depositUsd => {
		const amounts = depositAmounts(terms, depositUsd)
		const {netUsd, netPerHourUsd} = amounts
		const verdict = netUsd <= 0 ? "SKIP" : netPerHourUsd > settings.hourlyRateUsd ? "FARM" : "THIN"
		return {depositUsd, ...amounts, verdict}
	}
	return {
		launchProbability12: launchProbability,
		airdropYieldApr: k / horizonYears,
		deposits: defaults.depositsUsd.map(atDeposit),
		breakEvenDepositUsd: k > capitalCarry ? cashFees / (k - capitalCarry) : "never"
	}
}
function depositAmounts({cashFees, capitalCarry, hours, k}, depositUsd) {
	const expectedValueUsd = k * depositUsd
	const carryUsd = capitalCarry * depositUsd
	const costUsd = cashFees + carryUsd
	const netUsd = expectedValueUsd - cashFees - carryUsd
	const netPerHourUsd = netUsd === 0 ? 0 : netUsd / hours
	return {expectedValueUsd, costUsd, netUsd, netPerHourUsd}
}

function compareText(first, second) {
	if (first < second) return -1
	if (first > second) return 1
	return 0
}

var MIN_GROUP_CHANGES = 10
function farmGroup(category, playbooks) {
	const label = category?.trim().toLowerCase() ?? ""
	return Object.keys(playbooks).find(group => playbooks[group]?.categories.includes(label)) ?? "generic"
}
function farmExitThresholds(census, playbooks) {
	const changes = census
		.flatMap(({protocol, status}) => {
			const {listed_at, change_7d, slug, category} = protocol
			return status === "pre-token" && listed_at !== null && change_7d !== null ? [{change: change_7d, slug, group: farmGroup(category, playbooks)}] : []
		})
		.sort((a, b) => a.change - b.change || compareText(a.slug, b.slug))
	const decile = group => group[Math.ceil(group.length / 10) - 1]?.change
	const pooled = decile(changes)
	const fallback = pooled === void 0 ? null : {change: pooled, label: "pooled categories"}
	return new Map(
		Object.entries(playbooks).map(([group, {label}]) => {
			const sample = changes.filter(row => row.group === group)
			const change = sample.length < MIN_GROUP_CHANGES ? void 0 : decile(sample)
			return [group, change === void 0 ? fallback : {change, label}]
		})
	)
}

function chooseChain(chains, transactions, transfers, gas) {
	const quote = chain => {
		const fees = chain !== null && Object.hasOwn(gas.chains, chain) ? gas.chains[chain] : void 0
		const [transactionUsd, bridgeUsd] = fees ?? gas.fallback
		const cost = roundUsd(transfers * bridgeUsd + transactions * transactionUsd)
		return {chain, transactionUsd, bridgeUsd, cost, feeAssumed: fees === void 0}
	}
	return chains.map(quote).sort((a, b) => a.cost - b.cost || compareText(a.chain ?? "", b.chain ?? ""))[0] ?? quote(null)
}
function roundUsd(value) {
	return Math.round(value * 100) / 100
}
function makeFarmPlan(protocol, {playbooks, gas, funding, uncollateralized}, {depositUsd = defaults.depositsUsd[0], launchProbability12: launchProbability122 = 0, exitThreshold = null} = {}) {
	if (!Number.isFinite(depositUsd) || depositUsd <= 0) {
		throw new Error("The farm plan needs a positive, finite deposit size.")
	}
	const group = farmGroup(protocol.category, playbooks)
	const playbook = playbooks[group] ?? playbooks.generic
	const copy = protocol.category?.toLowerCase().includes("uncollateralized") ? uncollateralized : playbook
	const bridge = group === "bridge"
	const holdYears = expectedHoldYears(launchProbability122)
	const holdWeeks = holdYears * defaults.weeksPerYear
	const reviewCounts = {
		once: 1,
		weekly: Math.floor(holdWeeks),
		monthly: Math.floor(defaults.monthsPerYear * holdYears)
	}
	const repeats = reviewCounts[playbook.cadence]
	const [entry, review, exit] = playbook.transactions
	const gasTransactions = (bridge ? 0 : entry) + review * repeats + exit
	const {chain, transactionUsd, bridgeUsd, feeAssumed} = chooseChain(protocol.chains, gasTransactions, bridge ? entry : 1, gas)
	const fields = {
		deposit: formatUsd(depositUsd),
		chain: chain ?? "a verified chain",
		gas: gasTransactions ? `about ${formatUsd(gasTransactions * transactionUsd)} for gas` : "gas as needed"
	}
	const step = (action, costUsd, minutes, cadence = "once") => ({
		action: action.replace(/\{(\w+)\}/g, (_, key) => fields[key] ?? ""),
		chain,
		costUsd: roundUsd(costUsd),
		minutes,
		cadence
	})
	const [entryMinutes, reviewMinutes, exitMinutes] = playbook.minutes
	const tradingFees = group === "derivatives" ? defaults.tradeVolumeUsd * defaults.tradingFeeRate : 0
	const fundingStep = bridge ? null : step(funding.bridge, bridgeUsd, defaults.bridgeMinutes)
	const recurring = step(copy.review, tradingFees + review * transactionUsd, reviewMinutes, playbook.cadence)
	const floor = `TVL drops under ${formatUsd(protocol.tvl_usd / 2)}`
	const drawdown = exitThreshold?.change.toFixed(1).replace("-", "−")
	const trigger = exitThreshold
		? `Exit if 7-day TVL change falls below ${drawdown}% (bottom tenth of ${exitThreshold.label} in this snapshot) or ${floor}.`
		: `Exit if ${floor}. No listed pre-token 7-day TVL data.`
	const steps = [
		step(chain === null ? funding.unlisted : funding.wallet, 0, defaults.setupMinutes),
		...(fundingStep ? [fundingStep] : []),
		step(copy.enter, entry * (bridge ? bridgeUsd : transactionUsd), entryMinutes),
		recurring,
		{
			...step(copy.exit, exit * transactionUsd, exitMinutes),
			exitCondition: `${trigger} ${copy.exitCondition}`
		}
	]
	const oneTimeCostUsd = roundUsd(steps.reduce((sum, item) => sum + item.costUsd, 0) - recurring.costUsd)
	const recurringCostUsd = roundUsd(recurring.costUsd * repeats)
	return {
		chain,
		depositUsd,
		steps,
		fundingStep,
		exitThreshold,
		reviewCounts,
		holdWeeks,
		flags: feeAssumed ? ["fee-assumed"] : [],
		assumptionsAsOf: defaults.asOf,
		capitalApr: playbook.capitalApr,
		oneTimeCostUsd,
		recurringCostUsd,
		totalCostUsd: roundUsd(oneTimeCostUsd + recurringCostUsd),
		totalMinutes: steps.reduce((sum, item) => sum + item.minutes * reviewCounts[item.cadence], 0)
	}
}

function pava(bins) {
	const pools = []
	for (const bin of bins) {
		pools.push({...bin, size: 1})
		while (pools.length > 1) {
			const left = pools.at(-2)
			const right = pools.at(-1)
			if (!left || !right || left.recorded * right.count <= right.recorded * left.count) break
			left.count += right.count
			left.recorded += right.recorded
			left.size += right.size
			pools.pop()
		}
	}
	return pools.flatMap(({count, recorded, size}) => Array(size).fill(recorded / count))
}

var YEAR_DAYS = 365
function fitAgeShares(rows) {
	const bins = new Map()
	for (const {ageDays: age, label} of rows) {
		const year = Math.floor(age / YEAR_DAYS)
		const bin = bins.get(year) ?? {count: 0, recorded: 0, ageSum: 0}
		bin.count++
		bin.recorded += label
		bin.ageSum += age
		bins.set(year, bin)
	}
	const ordered = [...bins].sort(([a], [b]) => a - b).map(([, bin]) => bin)
	const shares = pava(ordered)
	return ordered.map(({ageSum, count}, i) => ({
		ageDays: ageSum / count,
		share: shares[i] ?? 0,
		count
	}))
}
function tailHazard(points) {
	for (let i = points.length - 1; i > 0; i--) {
		const left = points[i - 1]
		const right = points[i]
		if (left && right && right.share > left.share) {
			return Math.log((1 - left.share) / (1 - right.share)) / (right.ageDays - left.ageDays)
		}
	}
	return -Math.log1p(-(points[0]?.share ?? 0)) / YEAR_DAYS
}
function shareAt(points, age) {
	let left = points[0]
	if (!left) return 0
	if (age <= left.ageDays) return left.share
	for (const right of points) {
		if (age <= right.ageDays) {
			const fraction = (age - left.ageDays) / (right.ageDays - left.ageDays)
			return left.share + fraction * (right.share - left.share)
		}
		left = right
	}
	return left.share + (1 - left.share) * -Math.expm1(-tailHazard(points) * (age - left.ageDays))
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}
function median(observations) {
	const sorted = [...observations].sort((a, b) => a.value - b.value || compareText(a.slug, b.slug))
	const mid = Math.floor(sorted.length / 2)
	const upper = sorted[mid]
	const lower = sorted[mid - 1]
	if (!upper) return void 0
	return sorted.length % 2 === 0 && lower ? (lower.value + upper.value) / 2 : upper.value
}
function featureStats(values) {
	let sum = 0
	let min = Number.POSITIVE_INFINITY
	let max = Number.NEGATIVE_INFINITY
	for (const value of values) {
		sum += value
		min = Math.min(min, value)
		max = Math.max(max, value)
	}
	const mean = min === max ? min : sum / values.length
	const scale = Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length)
	return {mean, scale, range: {min, max}}
}

var DAY_MS = 864e5
function daysBetween(fromIso, toIso) {
	return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS
}

var categories = {
	dex: ["dex", "dexs", "liquidity manager"],
	lending: ["lending", "uncollateralized lending", "cdp", "cdp manager", "collateral markets"],
	staking: ["liquid staking", "staking pool", "restaking", "liquid restaking", "restaked btc"],
	yield: ["yield", "yield aggregator", "leveraged farming", "farm"],
	derivatives: ["derivatives", "interest rate derivatives", "basis trading", "options", "options vault"],
	rwa: ["rwa"],
	bridge: ["bridge", "canonical bridge", "cross chain bridge"],
	other: []
}
function categoryGroup(category) {
	const label = category?.trim().toLowerCase() ?? ""
	for (const [group, labels] of Object.entries(categories)) {
		if (labels.includes(label)) return group
	}
	return "other"
}
function categoryTotals() {
	return Object.fromEntries(Object.keys(categories).map(group => [group, 0]))
}

function logAge(listedAt, asOf) {
	return Math.log(Math.max(1, daysBetween(listedAt, asOf)))
}
function logMomentum(change) {
	return change === null ? 0 : Math.log1p(clamp(change, -50, 100) / 100)
}
function comparablesFromFamilies(families, asOf) {
	return families.flatMap(({key, representative, tvl_usd, mcap_usd}) => {
		if (mcap_usd === null) return []
		const {slug, listed_at, change_7d} = representative
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
		]
	})
}

function dot(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) sum += a[i] * (b[i] ?? 0)
	return sum
}
function diagonalPenalty(width, lambda) {
	return Array.from({length: width}, (_, i) => [...Array(i).fill(0), i ? lambda : 0])
}
//! Solve (XᵀWX + penalty) b = XᵀWy.
function weightedLeastSquares(design, targets, weights, penalty, ridge = false) {
	const normal = penalty.map(row => [...row])
	const rhs = normal.map(() => 0)
	for (let i = 0; i < design.length; i++) {
		const row = design[i]
		const weight = weights[i] ?? 1
		const target = targets[i]
		for (let j = 0; j < normal.length; j++) {
			const value = row[j]
			if (value === 0) continue
			const line = normal[j]
			const scaled = weight * value
			rhs[j] = rhs[j] + scaled * target
			for (let k = 0; k <= j; k++) line[k] = line[k] + scaled * row[k]
		}
	}
	const [, [, tvl = 0] = [], [, cross = 0, age = 0] = []] = normal
	if (ridge && normal.length === 3 && penalty[2]?.[2] === 0 && tvl > 0 && age > 0 && cross ** 2 >= (1 - 8 * Number.EPSILON) * tvl * age) {
		normal[2] = [0, 0, 1]
		rhs[2] = 0
	}
	for (const [i, row] of normal.entries()) {
		if (ridge && i >= normal.length - 2 && row[i] === 0) row[i] = 1
	}
	return choleskySolve(normal, rhs)
}
//! Cholesky with in-place triangular solves.
function choleskySolve(lower, solution) {
	for (const [i, row] of lower.entries()) {
		for (let j = 0; j <= i; j++) {
			const previous = lower[j]
			const pivot = row[j] - dot(row.slice(0, j), previous)
			if (j === i && !(pivot > 0 && Number.isFinite(pivot))) throw new Error("Cholesky requires positive, finite pivots.")
			row[j] = j === i ? Math.sqrt(pivot) : pivot / previous[j]
		}
		solution[i] = (solution[i] - dot(row.slice(0, i), solution)) / row[i]
	}
	for (let i = lower.length - 1; i >= 0; i--) {
		const row = lower[i]
		const value = solution[i] / row[i]
		solution[i] = value
		for (let j = 0; j < i; j++) solution[j] = solution[j] - value * row[j]
	}
	return solution
}

function sigmoid(logit) {
	const exp = Math.exp(-Math.abs(logit))
	return logit < 0 ? exp / (1 + exp) : 1 / (1 + exp)
}
function linearScore(features, coefficients) {
	return dot([1, ...features], coefficients)
}
//! Logistic IRLS uses w = p(1−p) and z = logit + (label − p)/w.
function fitLogistic(features, labels, lambda) {
	const first = features[0]
	if (!first || labels.length !== features.length) throw new Error("Logistic fitting requires labeled rows.")
	const rate = labels.reduce((sum, label) => sum + label, 0) / labels.length
	const coefficients = [Math.log(rate / (1 - rate)), ...first.map(() => 0)]
	if (rate === 0 || rate === 1) return coefficients
	const stats = first.map((_, j) => featureStats(features.map(row => row[j] ?? 0)))
	const design = features.map(row => [1, ...stats.map(({mean, scale}, j) => ((row[j] ?? 0) - mean) / (scale || 1))])
	const penalty = diagonalPenalty(coefficients.length, lambda)
	const weights = []
	for (let iteration = 0; iteration < 80; iteration++) {
		const working = design.map((row, i) => {
			const logit = dot(row, coefficients)
			const p = sigmoid(logit)
			const weight = p * sigmoid(-logit)
			weights[i] = weight
			return logit + ((labels[i] ?? 0) - p) / weight
		})
		const next = weightedLeastSquares(design, working, weights, penalty)
		const delta = next.map((value, j) => value - (coefficients[j] ?? 0))
		const step = Math.min(1, 2 / Math.max(...design.map(row => Math.abs(dot(row, delta)))))
		delta.forEach((value, j) => {
			coefficients[j] = (coefficients[j] ?? 0) + step * value
		})
		if (delta.every(value => Math.abs(value) <= 1e-10)) {
			const slopes = coefficients.slice(1).map((value, j) => value / (stats[j]?.scale || 1))
			const intercept = stats.reduce((value, {mean}, j) => value - mean * (slopes[j] ?? 0), coefficients[0] ?? 0)
			return [intercept, ...slopes]
		}
	}
	throw new Error("Token-status logistic fit did not converge.")
}

var PENALTY = 1
var PRIOR_STRENGTH = 20
function protocolFeatures(protocol, ageDays) {
	return {
		ageDays,
		lnTvl: Math.log(protocol.tvl_usd),
		growth: logMomentum(protocol.change_7d),
		lnChains: Math.log(Math.max(1, protocol.chains.length)),
		category: categoryGroup(protocol.category)
	}
}
function oddsPopulation(entries, asOf) {
	return entries
		.flatMap(({protocol, status}) => {
			const {slug, listed_at: listedAt} = protocol
			if (listedAt === null || status === "excluded") return []
			return [
				{
					...protocolFeatures(protocol, Math.max(0, daysBetween(listedAt, asOf))),
					slug,
					familyKey: slug,
					listedAt,
					label: Number(status === "traded" || status === "token-unpriced")
				}
			]
		})
		.sort((a, b) => compareText(a.slug, b.slug))
}
function baseRate(rows) {
	return rows.reduce((sum, {label}) => sum + label, 0) / rows.length
}
function categoryTokenShares(rows, prior = PRIOR_STRENGTH) {
	const counts = categoryTotals()
	const recorded = categoryTotals()
	for (const {category, label} of rows) {
		counts[category]++
		recorded[category] += label
	}
	const rate = baseRate(rows)
	for (const category of Object.keys(counts)) {
		recorded[category] = (recorded[category] + prior * rate) / (counts[category] + prior)
	}
	return recorded
}
function oddsFeatures(row, terms, shares, clock) {
	return [clockLogit(clock, row.ageDays), ...terms.map(term => (term === "categoryShare" ? shares[row.category] : row[term]))]
}
function clockLogit(clock, age) {
	const share = clamp(shareAt(clock, age), 0.01, 0.99)
	return Math.log(share / (1 - share))
}
function fitOddsModel(rows, terms) {
	const shares = categoryTokenShares(rows)
	const clock = fitAgeShares(rows)
	const coefficients = fitLogistic(
		rows.map(row => oddsFeatures(row, terms, shares, clock)),
		rows.map(({label}) => label),
		PENALTY
	)
	return {
		terms,
		coefficients,
		shares,
		clock,
		n: rows.length,
		medianAgeDays: median(rows.map(({slug, ageDays}) => ({slug, value: ageDays}))) ?? 0,
		maxAgeDays: rows.reduce((max, {ageDays}) => Math.max(max, ageDays), 0)
	}
}
function checkClockCoefficient(gamma = 0) {
	if (!(gamma > 0)) throw new Error("Token-status clock coefficient γ must be positive.")
}
function launchProbability12(clock, age, otherLogit, gamma) {
	checkClockCoefficient(gamma)
	const future = clockLogit(clock, age + YEAR_DAYS)
	const rise = future - clockLogit(clock, age)
	if (rise === 0) return -Math.expm1(-tailHazard(clock) * YEAR_DAYS)
	return clamp(sigmoid(otherLogit + gamma * future) * -Math.expm1(-gamma * rise), 0, 1)
}
function protocolOdds(model, protocol, asOf) {
	const ageDays = protocol.listed_at === null ? model.medianAgeDays : Math.max(0, daysBetween(protocol.listed_at, asOf))
	const {clock, coefficients, shares, terms} = model
	const features = oddsFeatures(protocolFeatures(protocol, ageDays), terms, shares, clock)
	features[0] = 0
	const otherLogit = linearScore(features, coefficients)
	const gamma = coefficients[1] ?? 0
	const oddsAt = days => launchProbability12(clock, days, otherLogit, gamma)
	return {oddsAge: ageDays, oddsAt, launchProbability12: oddsAt(ageDays)}
}

function medianInPlace(values) {
	values.sort()
	const middle = Math.floor(values.length / 2)
	const upper = values[middle] ?? 0
	return values.length % 2 ? upper : ((values[middle - 1] ?? upper) + upper) / 2
}
//! Huber IRLS uses w = min(1, 1.345 × scaled MAD / |residual|).
function fitHuber(design, targets, penalty, robust = true, ridge = false) {
	const weights = new Float64Array(targets.length).fill(1)
	const residuals = weights.slice()
	const scratch = weights.slice()
	let coefficients = []
	let huberScale = 1e-8
	for (let iteration = 0; iteration <= 20; iteration++) {
		const next = weightedLeastSquares(design, targets, weights, penalty, ridge)
		for (let i = 0; i < design.length; i++) {
			residuals[i] = scratch[i] = targets[i] - dot(design[i], next)
		}
		const center = medianInPlace(scratch)
		for (const [i, value] of residuals.entries()) scratch[i] = Math.abs(value - center)
		huberScale = Math.max(1e-8, 1.4826 * medianInPlace(scratch))
		const converged = next.every((value, i) => Math.abs(value - (coefficients[i] ?? Infinity)) < 1e-5)
		coefficients = next
		if (!robust || converged) break
		for (const [i, residual] of residuals.entries()) weights[i] = Math.min(1, (1.345 * huberScale) / Math.abs(residual))
	}
	return {coefficients, huberScale}
}
//! Ridge uses unit weights.
function fitRidge(rows, lambda, robust, groupPenalty = []) {
	const penalty = diagonalPenalty(groupPenalty.length + 3, lambda)
	for (const [i, row] of groupPenalty.entries()) penalty[i + 1] = [0, ...row.slice(0, i + 1)]
	const design = rows.map(({group, tvl, age}) => [1, ...groupPenalty.map((_, i) => Number(group === i + 1)), tvl, age])
	const targets = rows.map(({target}) => target)
	return fitHuber(design, targets, penalty, robust, true)
}

var FITTED_KEYS = ["lnTvl", "lnAge"]
function valueFeatures(protocol, asOf, medianLnAge) {
	const flags = []
	if (protocol.change_7d === null) flags.push("growth-missing")
	if (protocol.listed_at === null) flags.push("age-missing")
	return {
		features: {
			lnTvl: Math.log(protocol.tvl_usd),
			lnAge: protocol.listed_at === null ? medianLnAge : logAge(protocol.listed_at, asOf),
			growth: logMomentum(protocol.change_7d)
		},
		flags
	}
}
function prepareFit(rows, drop) {
	const n = rows.length
	if (n === 0) throw new Error("The value model needs at least one traded comparable.")
	const medianLnAge = median(rows.flatMap(({slug, lnAge}) => (lnAge === null ? [] : [{slug, value: lnAge}]))) ?? 0
	const tvl = featureStats(rows.map(({lnTvl}) => lnTvl))
	const age = featureStats(rows.map(({lnAge}) => lnAge ?? medianLnAge))
	const targetMean = rows.reduce((sum, row) => sum + row.target, 0) / n
	const tvlScale = drop === "tvl" ? 0 : tvl.scale
	const ageScale = drop === "age" ? 0 : age.scale
	const design = rows.map(row => ({
		target: row.target - targetMean,
		tvl: tvlScale ? (row.lnTvl - tvl.mean) / tvlScale : 0,
		age: ageScale ? ((row.lnAge ?? medianLnAge) - age.mean) / ageScale : 0
	}))
	return {
		design,
		targetMean,
		tvlScale,
		ageScale,
		metadata: {
			n,
			medianLnAge,
			featureMeans: {lnTvl: tvl.mean, lnAge: age.mean},
			featureRanges: {lnTvl: tvl.range, lnAge: age.range}
		}
	}
}
function restoreCoefficients({targetMean, tvlScale, ageScale, metadata: {featureMeans}}, centeredIntercept, tvlSlope, ageSlope) {
	const lnTvl = tvlScale ? tvlSlope / tvlScale : 0
	const lnAge = ageScale ? ageSlope / ageScale : 0
	const intercept = targetMean + centeredIntercept - lnTvl * featureMeans.lnTvl - lnAge * featureMeans.lnAge
	return {intercept, lnTvl, lnAge}
}
function fitValueModel(rows, lambda, {drop, robust = true, momentum = true} = {}, category) {
	const prepared = prepareFit(rows, drop)
	const design = category
		? prepared.design.map((row, i) => ({
				...row,
				group: category.groupBySlug[rows[i]?.slug ?? ""] ?? 0
			}))
		: prepared.design
	const {coefficients, huberScale} = fitRidge(design, lambda, robust, category?.penalty)
	const tvlColumn = category?.groups.length ?? 1
	const center = category?.contrastShares.reduce((sum, share, i) => sum + share * (coefficients[i + 1] ?? 0), 0) ?? 0
	const categoryEffects = category && categoryTotals()
	category?.groups.forEach((key, i) => {
		if (categoryEffects) categoryEffects[key] = (i ? (coefficients[i] ?? 0) : 0) - center
	})
	return {
		...prepared.metadata,
		lambda,
		momentum,
		huberScale,
		coefficients: restoreCoefficients(prepared, (coefficients[0] ?? 0) + center, coefficients[tvlColumn] ?? 0, coefficients[tvlColumn + 1] ?? 0),
		...(categoryEffects && {categoryEffects})
	}
}
function logValue({lnTvl, growth, lnAge, category}, {coefficients, momentum = true, categoryEffects}) {
	return coefficients.intercept + coefficients.lnTvl * (lnTvl + (momentum ? growth : 0)) + coefficients.lnAge * lnAge + (categoryEffects?.[category ?? "other"] ?? 0)
}
function predictValue(protocol, asOf, model) {
	const row = valueFeatures(protocol, asOf, model.medianLnAge)
	const {featureMeans, featureRanges, coefficients} = model
	const {features} = row
	if (model.categoryEffects) features.category = categoryGroup(protocol.category)
	if (
		FITTED_KEYS.some(key => {
			const {min, max} = featureRanges[key]
			return features[key] < min || features[key] > max
		})
	) {
		row.flags.push("outside-comps-range")
	}
	const {intercept, lnTvl, lnAge} = coefficients
	const logBase = intercept + lnTvl * featureMeans.lnTvl + lnAge * featureMeans.lnAge
	const valueUsd = Math.exp(logValue(features, model))
	return {
		...row,
		valueUsd,
		launch_value_usd: clamp(Math.round(valueUsd), 1, 1e14),
		decomposition: {
			base: Math.exp(logBase),
			multipliers: {
				lnTvl: Math.exp(lnTvl * (features.lnTvl - featureMeans.lnTvl)),
				growth: Math.exp(lnTvl * (model.momentum === false ? 0 : features.growth)),
				lnAge: Math.exp(lnAge * (features.lnAge - featureMeans.lnAge)),
				...(model.categoryEffects && {
					category: Math.exp(model.categoryEffects[features.category ?? "other"])
				})
			}
		}
	}
}
function rankBoard(entries, asOf, model) {
	return entries
		.map(entry => {
			const value = predictValue(entry.protocol, asOf, model)
			return {
				...entry,
				...value,
				implied_value_usd: Math.max(1, Math.round(value.launch_value_usd * entry.launchProbability12))
			}
		})
		.sort((a, b) => b.implied_value_usd - a.implied_value_usd || compareText(a.protocol.slug, b.protocol.slug))
		.map((entry, index) => ({...entry, rank: index + 1}))
}

function valueOptions(terms) {
	return {...(!terms.includes("age") && {drop: "age"}), momentum: terms.includes("momentum")}
}

var TAIL_ALPHA = 0.1
var MIN_BAND_FAMILIES = Math.ceil(1 / TAIL_ALPHA)

function familyKey({slug, gecko_id}) {
	return gecko_id === null ? `slug:${slug}` : `gecko:${gecko_id}`
}
function groupFamilies(protocols) {
	const families = new Map()
	for (const protocol of [...protocols].sort((a, b) => compareText(a.slug, b.slug))) {
		const {tvl_usd, mcap_usd} = protocol
		const key = familyKey(protocol)
		const marketCap = mcap_usd !== null && mcap_usd > 0 ? mcap_usd : null
		const family = families.get(key)
		if (family) {
			family.members.push(protocol)
			family.tvl_usd += tvl_usd
			family.mcap_usd ??= marketCap
		} else {
			families.set(key, {
				key,
				representative: protocol,
				members: [protocol],
				tvl_usd,
				mcap_usd: marketCap
			})
		}
	}
	return [...families.values()]
}

var BRIDGE_PRODUCT = "wrapped and bridged products are"
var STAKED_PRODUCT = "staked products are"
var HOUSE_RULE = " (house rule)."
var EXCLUDED_CATEGORIES = new Map([
	["Bridge", BRIDGE_PRODUCT],
	["Canonical Bridge", BRIDGE_PRODUCT],
	["Liquid Staking", STAKED_PRODUCT],
	["Liquid Restaking", STAKED_PRODUCT],
	["Restaked BTC", STAKED_PRODUCT],
	["CEX", "exchange custody is"]
])
var VERSION_SUFFIX = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i
var PRODUCT_WORD = /(?<![\p{L}\p{M}\p{N}_])(?:wrapped|staked|staking)(?![\p{L}\p{M}\p{N}_])/iu
var EXCHANGE_NAME = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(?![\p{L}\p{M}\p{N}_])/iu
function tokenFields({gecko_id, symbol}) {
	if (gecko_id !== null) return symbol === null ? "gecko_id" : "gecko_id and symbol"
	return symbol === null ? null : "symbol"
}
function exclusionReason(protocol) {
	const {category} = protocol
	const product = category === null ? void 0 : EXCLUDED_CATEGORIES.get(category)
	if (product) return `${category} category: ${product} not ranked${HOUSE_RULE}`
	const name = protocol.name.trim()
	if (VERSION_SUFFIX.test(name)) {
		return `Name ends in a version marker${HOUSE_RULE}`
	}
	const productWord = name.match(PRODUCT_WORD)?.[0]
	if (productWord !== void 0) {
		return `Name contains “${productWord}”${HOUSE_RULE}`
	}
	const exchange = name.match(EXCHANGE_NAME)?.[0]
	return exchange === void 0 ? null : `Name starts with the exchange name “${exchange}”${HOUSE_RULE}`
}
function classify(protocol, marketCap = protocol.mcap_usd) {
	if (marketCap !== null && marketCap > 0) {
		return {status: "traded", reason: "The family records a positive market cap."}
	}
	const fields = tokenFields(protocol)
	if (fields !== null) {
		return {
			status: "token-unpriced",
			reason: `The protocol records a token via ${fields} without a positive market cap.`
		}
	}
	const reason = exclusionReason(protocol)
	if (reason !== null) return {status: "excluded", reason}
	return {status: "pre-token", reason: "The protocol records no token."}
}
function buildCensus(protocols, families = groupFamilies(protocols)) {
	const marketCaps = new Map(families.map(({key, mcap_usd}) => [key, mcap_usd]))
	return protocols.map(protocol => {
		const key = familyKey(protocol)
		return {protocol, familyKey: key, ...classify(protocol, marketCaps.get(key) ?? null)}
	})
}
function houseRuleMembership({protocols, floor_usd, watchlist}) {
	const watchlisted = new Set(watchlist)
	const matches = new Set(
		protocols
			.filter(protocol => protocol.tvl_usd >= floor_usd && tokenFields(protocol) === null && exclusionReason(protocol) === null)
			.map(({slug}) => slug)
			.sort(compareText)
	)
	const truePositives = []
	const falsePositives = []
	for (const slug of matches) {
		;(watchlisted.has(slug) ? truePositives : falsePositives).push(slug)
	}
	const falseNegatives = [...watchlisted].filter(slug => !matches.has(slug)).sort(compareText)
	return {truePositives, falsePositives, falseNegatives}
}
function boardEntries(census, watchlist) {
	const watchlisted = new Set(watchlist)
	const entries = []
	for (const entry of census) {
		const boardReasons = []
		if (entry.status === "pre-token") boardReasons.push("pre-token")
		if (watchlisted.has(entry.protocol.slug)) boardReasons.push("watchlist")
		if (boardReasons.length > 0) entries.push({...entry, boardReasons})
	}
	return entries
}

function refitValue(rows, fit) {
	return fitValueModel(rows, fit.lambda, valueOptions(fit.terms), fit.category)
}

function radarInputs({protocols, as_of}) {
	const families = groupFamilies(protocols)
	const entries = buildCensus(protocols, families)
	const comparables = comparablesFromFamilies(families, as_of)
	return {families, entries, comparables, population: oddsPopulation(entries, as_of)}
}
function rankRadar({watchlist, as_of}, entries, model, odds, tables) {
	checkClockCoefficient(odds.coefficients[1])
	const candidates = boardEntries(entries, watchlist).map(entry => ({
		...entry,
		...protocolOdds(odds, entry.protocol, as_of)
	}))
	const thresholds = farmExitThresholds(entries, tables.playbooks)
	return rankBoard(candidates, as_of, model).map(row => {
		const {protocol, launch_value_usd, launchProbability12: p12} = row
		const plan = makeFarmPlan(protocol, tables, {
			launchProbability12: p12,
			exitThreshold: thresholds.get(farmGroup(protocol.category, tables.playbooks)) ?? null
		})
		return {
			...row,
			plan,
			economics: estimateFarmEconomics(plan, launch_value_usd, protocol.tvl_usd, p12)
		}
	})
}
function recomputeRadar(snapshot, valueFit, oddsTerms, tables) {
	const {families, entries, comparables, population} = radarInputs(snapshot)
	const model = refitValue(comparables, valueFit)
	const odds = fitOddsModel(population, oddsTerms)
	return {
		model,
		odds,
		board: rankRadar(snapshot, entries, model, odds, tables),
		families,
		houseRule: houseRuleMembership(snapshot)
	}
}

function readPublishedSnapshot({meta, protocols, watchlist}) {
	if (!Array.isArray(protocols) || !Array.isArray(watchlist) || protocols.length !== meta?.protocolCount) {
		return null
	}
	const {as_of, floor_usd, source} = meta
	return {as_of, floor_usd, source, protocols, watchlist}
}
var browserApi = {
	MIN_BAND_FAMILIES,
	depositAmounts,
	farmEconomicsTerms,
	makeFarmPlan,
	farmAssumptions: defaults,
	estimateFarmEconomics,
	formatUsd,
	compareText,
	daysBetween,
	logValue,
	buildRadar: recomputeRadar,
	readPublishedSnapshot
}

window.Radar = browserApi
})();
