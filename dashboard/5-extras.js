(() => {
function options(values, esc) {
	return [...new Set(values)]
		.sort()
		.map(value => {
			const label = esc(value)
			return `<option value="${label}">${label}</option>`
		})
		.join("")
}

var columns = {
	rank: "Rank",
	name: "Protocol",
	value: "Implied value",
	launchValue: "Launch value",
	odds: "Odds 12m",
	tvl: "TVL",
	growth: "7d %",
	age: "Days with no token",
	cost: "Plan",
	verdict: "Verdict",
	netPerHour: "Net/h",
	watchlist: "Watchlist"
}
var statusLabels = {
	traded: "Token trades",
	"token-unpriced": "Records an unpriced token",
	"pre-token": "Records no token",
	excluded: "Excluded by the house rule"
}
var defaultCensus = {status: "", sort: "tvl", dir: "desc"}
var defaultSort = "rank"
var defaultState = {
	sort: defaultSort,
	dir: "asc",
	cat: "",
	chain: "",
	wl: false,
	q: ""
}
function censusHash({status, sort, dir, unranked}) {
	const params = new URLSearchParams()
	if (status) params.set("status", status)
	if (unranked) params.set("unranked", "1")
	if (sort !== defaultCensus.sort || dir !== defaultCensus.dir) {
		params.set("sort", sort)
		params.set("dir", dir)
	}
	return `#/census${params.size ? `?${params}` : ""}`
}
function boardHash(state) {
	const params = new URLSearchParams()
	if (state.sort !== defaultState.sort || state.dir !== defaultState.dir) {
		params.set("sort", state.sort)
		params.set("dir", state.dir)
	}
	if (state.cat) params.set("cat", state.cat)
	if (state.chain) params.set("chain", state.chain)
	if (state.wl) params.set("wl", "1")
	if (state.q) params.set("q", state.q)
	const query = params.toString()
	return query ? `#/?${query}` : "#/"
}

function bindControls(main, draw, {isCensusSortKey: isCensusSortKey2, isSortKey: isSortKey2, parseRoute: parseRoute2}) {
	main.addEventListener("click", event => {
		if (!(event.target instanceof Element)) return
		const sort = event.target.closest("button[data-sort]")?.dataset.sort
		const route = parseRoute2(location.hash)
		const dir = "state" in route && route.state.sort === sort && route.state.dir === "asc" ? "desc" : "asc"
		if (route.page === "board" && isSortKey2(sort)) {
			location.hash = boardHash({...route.state, sort, dir})
		} else if (route.page === "census" && isCensusSortKey2(sort)) {
			location.hash = censusHash({...route.state, sort, dir})
		} else if (!event.target.closest("a") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
			const link = event.target.closest("tr[data-protocol]")?.querySelector("a")
			if (link) location.hash = link.hash
		}
	})
	main.addEventListener("submit", event => event.preventDefault())
	main.addEventListener("input", ({target}) => {
		if (!(target instanceof HTMLInputElement) || target.name !== "q") return
		const route = parseRoute2(location.hash)
		if (route.page !== "board") return
		history.replaceState(null, "", boardHash({...route.state, q: target.value}))
		draw()
	})
	main.addEventListener("change", event => {
		const target = event.target
		const route = parseRoute2(location.hash)
		if (route.page === "census" && target instanceof HTMLSelectElement && target.name === "status") {
			location.hash = censusHash({
				...route.state,
				status: target.value,
				unranked: false
			})
			return
		}
		if (route.page !== "board") return
		const {state} = route
		if (target instanceof HTMLSelectElement && (target.name === "cat" || target.name === "chain")) {
			location.hash = boardHash({...state, [target.name]: target.value})
		} else if (target instanceof HTMLInputElement && target.name === "wl") {
			location.hash = boardHash({...state, wl: target.checked})
		}
	})
}
function setSelect(select, value) {
	select.querySelector("[data-temporary]")?.remove()
	select.value = value
	if (select.selectedIndex < 0) {
		const option = new Option(value, value, false, true)
		option.dataset.temporary = ""
		select.add(option)
	}
}
function boardControls(main, {element, escapeHtml}, rows) {
	const search = element('[name="q"]', main)
	const category = element('[name="cat"]', main)
	const chain = element('[name="chain"]', main)
	category.insertAdjacentHTML(
		"beforeend",
		options(
			rows.flatMap(({category: category2}) => category2 ?? []),
			escapeHtml
		)
	)
	chain.insertAdjacentHTML(
		"beforeend",
		options(
			rows.flatMap(({chains}) => chains),
			escapeHtml
		)
	)
	const watchlist = element('[name="wl"]', main)
	const buttons = main.querySelectorAll("button[data-sort]")
	return state => {
		if (search.value !== state.q) search.value = state.q
		setSelect(category, state.cat)
		setSelect(chain, state.chain)
		watchlist.checked = state.wl
		for (const button of buttons) {
			const th = button.parentElement
			if (th) th.ariaSort = button.dataset.sort !== state.sort ? null : state.dir === "asc" ? "ascending" : "descending"
		}
	}
}

function methodFarmAssumptions(farm, usd, pct) {
	return {
		title: `Farm assumptions · ${farm.asOf}`,
		rows: [
			["Hold", "Until launch or one year, whichever comes first. Count whole review periods."],
			["Airdrop share of launch cap", pct(farm.airdropShareOfLaunchCap)],
			["Farmer haircut (retained)", pct(farm.farmerHaircut)],
			["Labor", `${usd(farm.hourlyRateUsd)}/h`],
			["Capital APR", `${pct(farm.capitalApr.yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`],
			["Verdict test deposits", farm.depositsUsd.map(usd).join(" · ")],
			["Verdicts", `FARM > ${usd(farm.hourlyRateUsd)}/h · THIN if net > $0 · SKIP if net ≤ $0`]
		]
	}
}
function methodNotes(houseRule, farm, usd, pct, panel) {
	const assumptions = methodFarmAssumptions(farm, usd, pct)
	const rule = panel(
		"House watchlist rule",
		["TP", "FP", "FN"],
		[[houseRule.truePositives, houseRule.falsePositives, houseRule.falseNegatives].map(({length}) => String(length))],
		"DefiLlama marks extra matches with parentProtocol, absent from the snapshot."
	)
	const farmPanel = panel(assumptions.title, ["Input", "Default"], assumptions.rows)
	return `<details class="panel"><summary>Watchlist and farm assumptions</summary>${rule}${farmPanel}</details>`
}

var sliderLimits = {share: 100, haircut: 100, rate: 250, yield: 50, carry: 50}
function limit(value, fallback) {
	const number = Number(value)
	return value?.trim() && Number.isFinite(number) && number >= 0 ? number : fallback
}
function parsePlanState(hash) {
	const query = hash.split(/\?(.*)/s, 2)[1]
	const params = new URLSearchParams(query)
	const list = /(?:^|&)chains=([^&]*)/.exec(query ?? "")?.[1] ?? ""
	const chains = list.split(",").map(part => new URLSearchParams(`c=${part}`).get("c") ?? "")
	const sliders = {}
	for (const key of Object.keys(sliderLimits)) {
		const value = limit(params.get(key), -1)
		if (value >= 0 && value <= sliderLimits[key]) sliders[key] = value
	}
	return {
		budgetUsd: limit(params.get("budget"), 5e3),
		hoursPerWeek: limit(params.get("hours"), 3),
		chains: [...new Set(chains.filter(Boolean))],
		sliders
	}
}
function planHash({budgetUsd, hoursPerWeek, chains, sliders}) {
	const list = chains.map(encodeURIComponent).join(",")
	const params = new URLSearchParams({budget: String(budgetUsd), hours: String(hoursPerWeek)})
	for (const key of Object.keys(sliderLimits)) {
		if (sliders[key] !== void 0) params.set(key, String(sliders[key]))
	}
	return `#/plan?${params}${list ? `&chains=${list}` : ""}`
}

var sliderLabels = {
	share: "Airdrop share of launch cap (%)",
	haircut: "Farmer haircut, retained (%)",
	rate: "Labor rate (USD/h)",
	yield: "Yield-bearing capital APR (%)",
	carry: "Non-yielding capital APR (%)"
}
function sliderValues(farm) {
	return {
		share: farm.airdropShareOfLaunchCap * 100,
		haircut: farm.farmerHaircut * 100,
		rate: farm.hourlyRateUsd,
		yield: farm.capitalApr.yieldBearing * 100,
		carry: farm.capitalApr.nonYielding * 100
	}
}
function plannerSettings(farm, sliders) {
	const values = {...sliderValues(farm), ...sliders}
	return {
		...farm,
		airdropShareOfLaunchCap: values.share / 100,
		farmerHaircut: values.haircut / 100,
		hourlyRateUsd: values.rate,
		capitalApr: {yieldBearing: values.yield / 100, nonYielding: values.carry / 100}
	}
}
function plannerForm(chains, escapeHtml) {
	return `<section class="panel farm portfolio"><h2>Farm portfolio</h2>
    <p class="plan-meta">12-month estimates. Net deducts cash fees and capital carry.</p>
    <form>
      <div class="filters">
        <label class="field">Cash budget (USD)<input name="budget" type="number" min="0" step="any" required></label>
        <label class="field">Weekly hours cap<input name="hours" type="number" min="0" step="any" required></label>
        <label class="field">Chains · leave empty for all<select name="chains" multiple size="4">${options(chains, escapeHtml)}</select></label>
      </div>
      <fieldset class="sliders"><legend>Farm assumptions</legend>
        ${Object.entries(sliderLimits)
					.map(([key, max]) => `<label for="${key}">${sliderLabels[key]} <output aria-hidden="true"></output><input type="range" id="${key}" name="${key}" min="0" max="${max}" step="any"></label>`)
					.join("")}
        <button type="button" data-reset>Reset to defaults</button>
      </fieldset>
    </form>
    <div id="portfolio-results" aria-live="polite"></div>
  </section>`
}
var reasons = {
	"over-budget": "Over budget",
	"over-hours": "Over hours",
	"chain-excluded": "Chain excluded",
	"non-positive": "No positive net value at any deposit"
}
function plannerResults({positions, totals, rejected, closest}, economics, getName, usd, {escapeHtml: esc, table}) {
	const name = slug => esc(getName(slug))
	const values = ({depositUsd, expectedValueUsd, costUsd, netUsd}) => [depositUsd, expectedValueUsd, costUsd, netUsd].map(usd)
	const chainName = chain => esc(chain ?? "Unlisted")
	const labels = ["FARM", "THIN", "SKIP"]
	const verdicts = table(
		["Deposit", ...labels],
		economics[0]?.deposits.map(({depositUsd}, i) => {
			const counts = {FARM: 0, THIN: 0, SKIP: 0}
			for (const {deposits: deposits2} of economics) counts[deposits2[i]?.verdict ?? "SKIP"]++
			return [usd(depositUsd), ...labels.map(label => String(counts[label]))]
		}) ?? []
	)
	const chosen = positions.length
		? `<p class="plan-meta">${usd(totals.cashUsd)} cash · ${usd(totals.feesUsd)} fees · ${totals.hoursPerWeek.toFixed(2)} average hours/week</p>
      <div class="portfolio-table">${table(
				["Protocol", "Chain", "Deposit", "Expected value", "Cost", "Net"],
				positions.map(p => [name(p.slug), chainName(p.chain), ...values(p)]),
				{total: ["Total", "", ...values(totals)]}
			)}</div>`
		: "<p><strong>No candidate with positive net value fits these limits.</strong></p>"
	const near = closest.length
		? `<h3>Closest to break-even</h3><ul>${closest.map(p => `<li>${name(p.slug)} · ${chainName(p.chain)} · ${usd(p.depositUsd)} deposit · ${usd(p.shortfallUsd)} shortfall</li>`).join("")}</ul>`
		: ""
	const skipped = rejected.length ? `<h3>Top-ranked protocols skipped</h3><ul>${rejected.map(({slug, reason}) => `<li>${name(slug)} · ${reasons[reason]}</li>`).join("")}</ul>` : ""
	return `<div class="verdicts"><h3>Verdicts for all board plans</h3>${verdicts}</div><h3>Portfolio under your limits</h3>${chosen}${near}${skipped}`
}

function mountPlanner(main, board, tables, api) {
	const {estimateFarmEconomics, farmAssumptions, formatUsd: formatUsd2, planPortfolio, view} = api
	if (!planPortfolio || !view) throw new Error("Missing portfolio optimizer.")
	const {element, escapeHtml, table} = view
	const optimize = planPortfolio
	const names = new Map(board.map(({protocol}) => [protocol.slug, protocol.name]))
	main.innerHTML = plannerForm(
		board.flatMap(({protocol}) => protocol.chains),
		escapeHtml
	)
	const form = element("form", main)
	const budget = element('[name="budget"]', form)
	const hours = element('[name="hours"]', form)
	const select = element('[name="chains"]', form)
	const results = element("#portfolio-results", main)
	const sliders = form.querySelectorAll('input[type="range"]')
	let state
	const save = () => {
		if (!form.checkValidity()) return
		location.hash = planHash({
			budgetUsd: budget.valueAsNumber,
			hoursPerWeek: hours.valueAsNumber,
			chains: Array.from(select.selectedOptions, option => option.value),
			sliders: state.sliders
		})
	}
	form.onchange = save
	form.onsubmit = event => {
		event.preventDefault()
		save()
	}
	const setSliders = sliders2 => {
		const next = {...state, sliders: sliders2}
		history.replaceState(null, "", planHash(next))
		update(next)
	}
	form.oninput = ({target}) => {
		if (target instanceof HTMLInputElement && target.type === "range") {
			setSliders({...state.sliders, [target.name]: target.valueAsNumber})
		}
	}
	element("[data-reset]", form).onclick = () => setSliders({})
	function update(next) {
		state = next
		budget.value = String(state.budgetUsd)
		hours.value = String(state.hoursPerWeek)
		for (const chain of state.chains) {
			if (![...select.options].some(option => option.value === chain)) {
				select.add(new Option(chain, chain))
			}
		}
		for (const option of select.options) option.selected = state.chains.includes(option.value)
		const {budgetUsd, hoursPerWeek} = state
		const values = {...sliderValues(farmAssumptions), ...state.sliders}
		for (const slider of sliders) {
			slider.value = String(values[slider.name])
			const output = slider.previousElementSibling
			output.value = slider.value
		}
		const assumptions = {...plannerSettings(farmAssumptions, state.sliders), tables}
		const economics = board.map(({plan, launch_value_usd, protocol, launchProbability12}) => estimateFarmEconomics(plan, launch_value_usd, protocol.tvl_usd, launchProbability12, assumptions))
		const result = optimize(board, {
			budgetUsd,
			hoursPerWeek,
			assumptions,
			...(state.chains.length ? {chains: state.chains} : {})
		})
		results.innerHTML = plannerResults(result, economics, slug => names.get(slug) ?? slug, formatUsd2, {escapeHtml, table})
	}
	return hash => update(parsePlanState(hash))
}

function ageSparkline(maxAge, age, odds, oddsAt, svgView) {
	const y = fraction => ((1 - fraction) * 40).toFixed(2)
	const marker = (age / maxAge) * 100
	const line = Array.from({length: 33}, (_, index) => {
		const x = (index / 32) * 100
		return `${x.toFixed(2)},${y(oddsAt((x / 100) * maxAge))}`
	}).join(" ")
	return svgView(100, 40, `<polyline points="${line}"></polyline><circle cx="${marker.toFixed(2)}" cy="${y(odds)}" r="2" class="age-point"></circle>`)
}

var reasonLabels = {
	"pre-token": "Meets the pre-token rule",
	watchlist: "House watchlist"
}
var flagLabels = {
	"growth-missing": "Missing TVL change. The model uses zero growth.",
	"age-missing": "Missing listing date. The model uses median comparable age.",
	"outside-comps-range": "TVL or age falls outside the comparable range."
}
function protocolFacts({protocol, status, reason, boardReasons, flags}, age, usd, {escapeHtml: esc, formatInteger, growthText, statusLabels: statusLabels2}) {
	const facts = [
		["TVL", usd(protocol.tvl_usd)],
		["7d TVL change", growthText(protocol.change_7d)],
		["Listed", esc(protocol.listed_at ?? "Unlisted")],
		[status === "traded" || status === "token-unpriced" ? "Days since listing" : "Days with no token", formatInteger(age)]
	]
	return `<section class="panel"><h3>Protocol record</h3><dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p><strong>${statusLabels2[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(reason)}`}</p>
    <p class="muted">Included · ${boardReasons.map(key => reasonLabels[key]).join(" · ")}</p>
    ${flags.length ? `<ul class="flags">${flags.map(flag => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}</section>`
}
function protocolClock(populationMaxAge, clockAge, odds, usesMedianAge, oddsAt, {formatInteger, formatOdds, svg}) {
	const maxAge = Math.max(1, clockAge, populationMaxAge)
	return `<section class="panel clock"><h3>12-month launch odds</h3>
    ${ageSparkline(maxAge, clockAge, odds, oddsAt, svg)}
    <p><strong>P₁₂ · ${formatOdds(odds)}</strong></p>
    <p class="caption">Age marker · ${formatInteger(clockAge)} days${usesMedianAge ? " (population median)" : ""}</p>
  </section>`
}
function nearestComparables(slugs, families, usd, {escapeHtml: esc, table}) {
	const rows = slugs.map(slug => {
		const family = families.get(slug)
		return [esc(family?.representative.name ?? slug), family?.mcap_usd ? usd(family.mcap_usd) : "—"]
	})
	return `<section class="panel compact"><h3>Nearest comparables</h3>${table(["Twin", "Family market cap"], rows)}</section>`
}

window.Radar = Object.assign(window.Radar ?? {}, {
	bindControls,
	boardControls,
	methodNotes,
	mountPlanner,
	protocolFacts,
	protocolClock,
	nearestComparables,
	boardHash
})

function compareText(first, second) {
	if (first < second) return -1
	if (first > second) return 1
	return 0
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

function isSortKey(value) {
	return value === "time" || Object.hasOwn(columns, value ?? "")
}
function isCensusSortKey(value) {
	return value === "tvl" || value === "name" || value === "status" || value === "reason"
}
function parseRoute(hash) {
	const [path, query] = hash.slice(1).split(/\?(.*)/s, 2)
	if (path === "/method") return {page: "method"}
	if (path === "/plan") return {page: "plan"}
	const params = new URLSearchParams(query)
	if (path === "/census") {
		const status = params.get("status")
		const sort2 = params.get("sort")
		return {
			page: "census",
			state: {
				status: status && Object.hasOwn(statusLabels, status) ? status : "",
				sort: isCensusSortKey(sort2) ? sort2 : "tvl",
				dir: params.get("dir") === "asc" ? "asc" : "desc",
				unranked: params.get("unranked") === "1"
			}
		}
	}
	const sort = params.get("sort")
	const state = {
		sort: isSortKey(sort) ? sort : defaultState.sort,
		dir: params.get("dir") === "desc" ? "desc" : "asc",
		cat: params.get("cat") ?? "",
		chain: params.get("chain") ?? "",
		wl: params.get("wl") === "1",
		q: params.get("q") ?? ""
	}
	if (!path || path === "/") return {page: "board", state}
	const segment = /^\/p\/([^/]+)$/.exec(path)?.[1]
	try {
		if (segment) return {page: "protocol", slug: decodeURIComponent(segment), state}
	} catch {}
	return {page: "unknown", state}
}

function boot(start) {
	const root = document.querySelector("main")
	if (!root) return
	const fallback = root.innerHTML
	const fail = () => {
		delete root.dataset.ready
		root.innerHTML = fallback
	}
	try {
		const {RADAR_DATA: data, Radar} = window
		const input = data && Radar.readPublishedSnapshot(data)
		if (!data || !input) throw new Error("Missing snapshot")
		const {board, census, model, odds} = data
		const validation = model?.validation
		if (
			![board?.rows, odds?.terms, odds?.validation?.steps, model?.fit?.terms, model?.selection?.steps, census].every(Array.isArray) ||
			census.length !== input.protocols.length ||
			[validation?.leaveOneFamilyOut, validation?.seededFiveFold, validation?.walkForward].some(scheme => !scheme?.model || !scheme.flatMultiple || !scheme.categoryMultiple)
		)
			throw new Error("Incomplete snapshot")
		start(root, input, data, Radar, fail)
	} catch {
		fail()
	}
}

function shorten(text, max) {
	const normalized = text.trim().replace(/\s+/g, " ")
	return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`
}
function formatFarmStep({action, chain, costUsd, minutes, cadence, exitCondition}, usd) {
	const exit = exitCondition ? ` | ${shorten(exitCondition, 245)}` : ""
	return `${shorten(action, 190)} | ${shorten(chain ?? "Chain unlisted", 100)} | Est. fee ${usd(costUsd)} | ${minutes} minutes | ${cadence}${exit}`
}
function formatEconomics({deposits: deposits2, breakEvenDepositUsd}, holdWeeks, usd, {airdropShareOfLaunchCap}) {
	const net = deposits2.map(({depositUsd, netUsd, netPerHourUsd, verdict}) => `${usd(depositUsd)}: ${usd(netUsd)} net, ${usd(netPerHourUsd)}/h ${verdict}`)
	const breakEven = breakEvenDepositUsd === "never" ? "never" : `≈ ${usd(breakEvenDepositUsd)}`
	return `Economics for an expected ${holdWeeks.toFixed(1)}-week hold · ${net.join(" · ")}. Break-even deposit ${breakEven} (net reaches $0 after cash fees and capital carry). Assumes ${airdropShareOfLaunchCap * 100}% of circulating launch cap for the drop pool. Hold until launch or one year, whichever comes first.`
}
function boardFarmSteps({plan, economics}, {formatUsd: usd, farmAssumptions}) {
	return [...plan.steps.map(step => formatFarmStep(step, usd)), formatEconomics(economics, plan.holdWeeks, usd, farmAssumptions)]
}

var deposits = [1e3, 2500, 5e3, 1e4]
function scheduleFarmMinutes({steps, reviewCounts, holdWeeks}, settings) {
	const weeks = Array(Math.max(1, Math.ceil(holdWeeks))).fill(0)
	const weeksPerMonth = settings.weeksPerYear / settings.monthsPerYear
	for (const {cadence, minutes, exitCondition} of steps) {
		if (cadence === "once") {
			const week = exitCondition ? weeks.length - 1 : 0
			weeks[week] = (weeks[week] ?? 0) + minutes
			continue
		}
		const period = cadence === "weekly" ? 1 : weeksPerMonth
		for (let occurrence = 1; occurrence <= reviewCounts[cadence]; occurrence++) {
			const week = Math.ceil(occurrence * period) - 1
			weeks[week] = (weeks[week] ?? 0) + minutes
		}
	}
	return weeks
}
function optimizePortfolio(rows, {budgetUsd, hoursPerWeek, chains, assumptions}, api) {
	const {compareText: compareText2, depositAmounts: depositAmounts2, farmEconomicsTerms: farmEconomicsTerms2, makeFarmPlan: makeFarmPlan2, farmAssumptions} = api
	if (assumptions.horizonMonths !== farmAssumptions.horizonMonths) {
		throw new Error("The farm planner only supports a 12-month horizon.")
	}
	const permitted = chains && new Set(chains)
	const usedMinutesByWeek = Array(farmAssumptions.weeksPerYear).fill(0)
	const weeklyCapMinutes = hoursPerWeek * assumptions.minutesPerHour
	const minutesPerAverageWeeklyHour = usedMinutesByWeek.length * assumptions.minutesPerHour
	const candidates = rows.map(({protocol, rank, plan, economics, launch_value_usd}) => {
		const supported = [...new Set(protocol.chains)].sort(compareText2)
		const choices = supported.length ? supported : [null]
		const plans = choices.flatMap(chain => {
			if (permitted && (chain === null || !permitted.has(chain))) return []
			const option =
				chain === plan.chain || chain === null
					? plan
					: makeFarmPlan2({...protocol, chains: [chain]}, assumptions.tables, {
							depositUsd: plan.depositUsd,
							launchProbability12: economics.launchProbability12,
							exitThreshold: plan.exitThreshold
						})
			return [{option, schedule: scheduleFarmMinutes(option, farmAssumptions)}]
		})
		return {
			slug: protocol.slug,
			rank,
			plans,
			valueUsd: launch_value_usd,
			tvlUsd: protocol.tvl_usd,
			probability: economics.launchProbability12
		}
	})
	const funded = new Set()
	const selected = new Set()
	const positions = []
	let feesCents = 0
	const totals = {
		depositUsd: 0,
		feesUsd: 0,
		cashUsd: 0,
		hoursPerWeek: 0,
		expectedValueUsd: 0,
		costUsd: 0,
		netUsd: 0
	}
	function offers({slug, plans, valueUsd, tvlUsd, probability}) {
		return plans.flatMap(({option, schedule}) => {
			const {chain, fundingStep} = option
			const waived = chain !== null && funded.has(chain) ? fundingStep : null
			const feeCents = Math.round((option.totalCostUsd - (waived?.costUsd ?? 0)) * 100)
			const totalMinutes = option.totalMinutes - (waived?.minutes ?? 0)
			const weeklyMinutes = waived ? schedule.map((minutes, week) => (week === 0 ? minutes - waived.minutes : minutes)) : schedule
			const withinHours = weeklyMinutes.every((minutes, week) => (usedMinutesByWeek[week] ?? 0) + minutes <= weeklyCapMinutes)
			const terms = farmEconomicsTerms2({totalCostUsd: feeCents / 100, totalMinutes, capitalApr: option.capitalApr}, valueUsd, tvlUsd, probability, assumptions)
			return deposits.map(depositUsd => {
				const {expectedValueUsd, costUsd, netUsd} = depositAmounts2(terms, depositUsd)
				const position = {
					slug,
					chain,
					depositUsd,
					feesUsd: feeCents / 100,
					hoursPerWeek: totalMinutes / minutesPerAverageWeeklyHour,
					expectedValueUsd,
					costUsd,
					netUsd
				}
				return {
					position,
					feeCents,
					weeklyMinutes,
					fundsChain: fundingStep !== null,
					score: netUsd / (depositUsd + position.feesUsd),
					affordable: totals.depositUsd + depositUsd + (feesCents + feeCents) / 100 <= budgetUsd,
					withinHours
				}
			})
		})
	}
	for (;;) {
		let best
		for (const candidate of candidates) {
			if (selected.has(candidate.slug)) continue
			for (const offer of offers(candidate)) {
				if (!(offer.position.netUsd > 0 && offer.affordable && offer.withinHours)) continue
				if (!best || offer.score > best.score || (offer.score === best.score && compareText2(candidate.slug, best.position.slug) < 0)) {
					best = offer
				}
			}
		}
		if (!best) break
		const {position} = best
		positions.push(position)
		selected.add(position.slug)
		if (position.chain !== null && best.fundsChain) funded.add(position.chain)
		feesCents += best.feeCents
		for (const [week, minutes] of best.weeklyMinutes.entries()) {
			usedMinutesByWeek[week] = (usedMinutesByWeek[week] ?? 0) + minutes
		}
		totals.depositUsd += position.depositUsd
		totals.expectedValueUsd += position.expectedValueUsd
		totals.costUsd += position.costUsd
		totals.netUsd += position.netUsd
	}
	totals.feesUsd = feesCents / 100
	totals.cashUsd = totals.depositUsd + totals.feesUsd
	totals.hoursPerWeek = usedMinutesByWeek.reduce((sum, minutes) => sum + minutes, 0) / minutesPerAverageWeeklyHour
	const remaining = candidates.filter(({slug}) => !selected.has(slug))
	const rejected = remaining
		.sort((a, b) => a.rank - b.rank || compareText2(a.slug, b.slug))
		.slice(0, 15)
		.map(candidate => {
			const options2 = offers(candidate)
			const positive = options2.filter(({position}) => position.netUsd > 0)
			const feasible = positive.length ? positive : options2
			const affordable = feasible.filter(offer => offer.affordable)
			let reason = "non-positive"
			if (!options2.length) reason = "chain-excluded"
			else if (!affordable.length) reason = "over-budget"
			else if (!affordable.some(offer => offer.withinHours)) reason = "over-hours"
			return {slug: candidate.slug, reason}
		})
	const closest = positions.length
		? []
		: remaining
				.flatMap(candidate => {
					let best
					for (const {position, affordable, withinHours} of offers(candidate)) {
						if (affordable && withinHours && (!best || position.netUsd > best.netUsd)) {
							best = position
						}
					}
					return best ? [{...best, shortfallUsd: Math.max(0, -best.netUsd)}] : []
				})
				.sort((a, b) => a.shortfallUsd - b.shortfallUsd || compareText2(a.slug, b.slug))
				.slice(0, 5)
	return {positions, totals, rejected, closest}
}

window.Radar.support = {compareText, clamp, featureStats, median, fitRidge, fitLogistic, linearScore, sigmoid, isCensusSortKey, isSortKey, parseRoute, boot}
window.Radar.boardFarmSteps = row => boardFarmSteps(row, window.Radar)
window.Radar.planPortfolio = (rows, options2) => optimizePortfolio(rows, options2, window.Radar)
})();
