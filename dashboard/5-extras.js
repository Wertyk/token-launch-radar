(() => {
function formatFarmStep({action, chain, costUsd, minutes, cadence, exitCondition}, usd, shortenText) {
	const exit = exitCondition ? ` | Exit · ${shortenText(exitCondition, 100)}` : ""
	return `${shortenText(action, 280)} | ${shortenText(chain ?? "Chain unlisted", 110)} | Est. fee ${usd(costUsd)} | ${minutes} minutes | ${cadence}${exit}`
}
function formatEconomics({deposits: [{depositUsd, netUsd, netPerHourUsd, verdict}], breakEvenDepositUsd}, usd, {horizonMonths, airdropShareOfLaunchCap}) {
	const breakEven = breakEvenDepositUsd === "never" ? "never" : `≈ ${usd(breakEvenDepositUsd)}`
	return `Economics at ${usd(depositUsd)} over ${horizonMonths} months · ${usd(netUsd)} net · ${usd(netPerHourUsd)}/h → ${verdict}. Break-even deposit ${breakEven} (where net reaches $0 after cash fees and capital carry). Assumes ${airdropShareOfLaunchCap * 100}% of circulating launch cap because a mostly unlocked airdrop can account for much of a small launch float.`
}
function boardFarmSteps({plan, economics}, deps) {
	return [...plan.steps.map(step => formatFarmStep(step, deps.formatUsd, deps.shorten)), formatEconomics(economics, deps.formatUsd, deps.farmAssumptions)]
}

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
	depositsUsd: [1e3, 1e4],
	tradeVolumeUsd: 200,
	tradingFeeRate: 6e-4,
	setupMinutes: 5,
	bridgeMinutes: 10
}

var horizonYears = defaults.horizonMonths / defaults.monthsPerYear
var occurrences = {
	once: 1,
	weekly: Math.floor(defaults.weeksPerYear * horizonYears),
	monthly: defaults.horizonMonths
}

var deposits = [1e3, 2500, 5e3, 1e4]
function scheduleFarmMinutes({steps}, cadenceCounts) {
	const weeks = Array(cadenceCounts.weekly).fill(0)
	for (const {cadence, minutes, exitCondition} of steps) {
		const count = cadenceCounts[cadence]
		for (let occurrence = 1; occurrence <= count; occurrence++) {
			const week = cadence === "once" && exitCondition === void 0 ? 0 : Math.ceil((occurrence * weeks.length) / count) - 1
			weeks[week] = (weeks[week] ?? 0) + minutes
		}
	}
	return weeks
}
function optimizePortfolio(rows, {budgetUsd, hoursPerWeek, chains, assumptions}, api) {
	const {compareText: compareText2, depositAmounts: depositAmounts2, farmEconomicsTerms: farmEconomicsTerms2, makeFarmPlan: makeFarmPlan2, farmAssumptions, occurrences: occurrences2} = api
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
			const option = chain === plan.chain || chain === null ? plan : makeFarmPlan2({...protocol, chains: [chain]}, assumptions.tables)
			return [{option, schedule: scheduleFarmMinutes(option, occurrences2)}]
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

function compareRows(a, b, sort, direction, compareText2) {
	if (sort === "name") return direction * compareText2(a.name.toLowerCase(), b.name.toLowerCase())
	const first = a[sort]
	const second = b[sort]
	if (first === second) return 0
	if (first === null) return 1
	if (second === null) return -1
	return direction * (Number(first) - Number(second))
}
function selectRows(rows, state, compareText2) {
	const {sort, dir, cat, chain, wl} = state
	const query = state.q.trim().toLowerCase()
	const direction = dir === "asc" ? 1 : -1
	return rows
		.filter(row => (!cat || row.category === cat) && (!chain || row.chains.includes(chain)) && (!wl || row.watchlist) && (!query || row.name.toLowerCase().includes(query)))
		.sort((a, b) => compareRows(a, b, sort, direction, compareText2) || compareText2(a.slug, b.slug))
}

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
	cost: "12-mo fees",
	time: "Plan time",
	watchlist: "Watchlist"
}
var defaultCensus = {status: "", sort: "tvl", dir: "desc"}
var defaultState = {
	sort: "rank",
	dir: "asc",
	cat: "",
	chain: "",
	wl: false,
	q: ""
}
function isSortKey(value) {
	return value !== void 0 && Object.hasOwn(columns, value)
}
function readBoardState(params) {
	const sort = params.get("sort") ?? void 0
	return {
		sort: isSortKey(sort) ? sort : defaultState.sort,
		dir: params.get("dir") === "desc" ? "desc" : "asc",
		cat: params.get("cat") ?? "",
		chain: params.get("chain") ?? "",
		wl: params.get("wl") === "1",
		q: params.get("q") ?? ""
	}
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

function bindControls(main, draw, {isCensusSortKey, parseRoute}) {
	main.addEventListener("click", event => {
		if (!(event.target instanceof Element)) return
		const sort = event.target.closest("button[data-sort]")?.dataset.sort
		const route = parseRoute(location.hash)
		const dir = "state" in route && route.state.sort === sort && route.state.dir === "asc" ? "desc" : "asc"
		if (route.page === "board" && isSortKey(sort)) {
			location.hash = boardHash({...route.state, sort, dir})
		} else if (route.page === "census" && isCensusSortKey(sort)) {
			location.hash = censusHash({...route.state, sort, dir})
		} else if (!event.target.closest("a") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
			const link = event.target.closest("tr[data-protocol]")?.querySelector("a")
			if (link) location.hash = link.hash
		}
	})
	main.addEventListener("submit", event => event.preventDefault())
	main.addEventListener("input", ({target}) => {
		if (!(target instanceof HTMLInputElement) || target.name !== "q") return
		const route = parseRoute(location.hash)
		if (route.page !== "board") return
		history.replaceState(null, "", boardHash({...route.state, q: target.value}))
		draw()
	})
	main.addEventListener("change", event => {
		const target = event.target
		const route = parseRoute(location.hash)
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

function fixedScore(value) {
	return value?.toFixed(4) ?? "—"
}
function termTrials(selection, kind, tableView) {
	const errors = kind === "Value" ? ["LOO log error", "Walk-forward log error"] : ["10-fold Brier", "Walk-forward Brier"]
	const rows = selection.steps.flatMap(({baseline, trials}, i) => [
		[String(i + 1), "Current terms", ...baseline.map(fixedScore), "—"],
		...trials.map(({term, scores, kept}) => [String(i + 1), term, ...scores.map(fixedScore), kept ? "Kept" : "Not kept"])
	])
	return `<details class="panel"><summary>${kind} term selection</summary>
    <p class="caption">A term stays only if it lowers both held-out errors.</p>
    ${tableView(["Step", "Term", ...errors, "Decision"], rows)}</details>`
}
function methodFarmAssumptions(farm, usd, pct) {
	return {
		title: `Farm assumptions · ${farm.asOf}`,
		rows: [
			["Horizon", `${farm.horizonMonths} months`],
			["Airdrop share of launch cap", pct(farm.airdropShareOfLaunchCap)],
			["Farmer haircut (retained)", pct(farm.farmerHaircut)],
			["Labor", `${usd(farm.hourlyRateUsd)}/h`],
			["Capital APR", `${pct(farm.capitalApr.yieldBearing)} yield-bearing · ${pct(farm.capitalApr.nonYielding)} non-yielding`],
			["Verdict test deposits", farm.depositsUsd.map(usd).join(" · ")],
			["Verdicts", `FARM ≥ ${usd(farm.hourlyRateUsd)}/h · THIN if net > $0 · SKIP if net ≤ $0`]
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
function protocolFacts({protocol, status, reason, boardReasons, flags}, age, usd, {escapeHtml: esc, formatInteger, growthText, statusLabels}) {
	const facts = [
		["TVL", usd(protocol.tvl_usd)],
		["7d TVL change", growthText(protocol.change_7d)],
		["Listed", esc(protocol.listed_at ?? "Unlisted")],
		[status === "traded" || status === "token-unpriced" ? "Days since listing" : "Days with no token", formatInteger(age)]
	]
	return `<section class="panel"><h3>Protocol record</h3><dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${esc(reason)}`}</p>
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

Object.assign(window.Radar, {
	bindControls,
	boardControls,
	selectRows,
	methodNotes,
	termTrials,
	mountPlanner,
	protocolFacts,
	protocolClock,
	nearestComparables,
	boardHash,
	readBoardState
})

window.Radar.boardFarmSteps = row => boardFarmSteps(row, window.Radar)
window.Radar.planPortfolio = (rows, options2) => optimizePortfolio(rows, options2, window.Radar)
})();
