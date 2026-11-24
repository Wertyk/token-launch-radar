(() => {
function element(selector, root = document) {
	const found = root.querySelector(selector)
	if (!found) throw new Error(`Missing dashboard element ${selector}`)
	return found
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

function escapeHtml(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

function tableBody(rows, columns, options2 = {}) {
	if (!rows.length && options2.empty) {
		return `<tr><td colspan="${columns}" class="empty">${escapeHtml(options2.empty)}</td></tr>`
	}
	return rows.map(row => `<tr${options2.linked ? " data-protocol" : ""}><td>${row.join("</td><td>")}</td></tr>`).join("")
}
function table(headers, rows, options2 = {}) {
	const head = headers.map(header => {
		if (typeof header === "string") return `<th scope="col">${escapeHtml(header)}</th>`
		const [key, label2] = header
		const direction = options2.dir === "desc" ? "descending" : "ascending"
		return `<th scope="col"${options2.sort === key ? ` aria-sort="${direction}"` : ""}><button type="button" data-sort="${escapeHtml(key)}">${escapeHtml(label2)}</button></th>`
	})
	const [label, ...totals] = options2.total ?? []
	const foot = label === void 0 ? "" : `<tfoot><tr><th scope="row">${label}</th><td>${totals.join("</td><td>")}</td></tr></tfoot>`
	return `<table${options2.className ? ` class="${options2.className}"` : ""}><thead><tr>${head.join("")}</tr></thead><tbody>${tableBody(rows, headers.length, options2)}</tbody>${foot}</table>`
}
function options(values) {
	return [...new Set(values)]
		.sort()
		.map(value => {
			const label = escapeHtml(value)
			return `<option value="${label}">${label}</option>`
		})
		.join("")
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
function plannerForm(chains) {
	return `<section class="panel farm portfolio"><h2>Farm portfolio</h2>
    <p class="plan-meta">12-month estimates. Costs include fees, labor and capital.</p>
    <form>
      <div class="filters">
        <label class="field">Cash budget (USD)<input name="budget" type="number" min="0" step="any" required></label>
        <label class="field">Weekly hours cap<input name="hours" type="number" min="0" step="any" required></label>
        <label class="field">Chains · leave empty for all<select name="chains" multiple size="4">${options(chains)}</select></label>
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
function plannerResults({positions, totals, rejected, closest}, economics, getName, usd) {
	const name = slug => escapeHtml(getName(slug))
	const values = ({depositUsd, expectedValueUsd, costUsd, netUsd}) => [depositUsd, expectedValueUsd, costUsd, netUsd].map(usd)
	const chainName = chain => escapeHtml(chain ?? "Unlisted")
	const labels = ["FARM", "THIN", "SKIP"]
	const verdicts = table(
		["Deposit", ...labels],
		economics[0]?.deposits.map(({depositUsd}, i) => {
			const counts = {FARM: 0, THIN: 0, SKIP: 0}
			for (const {deposits} of economics) counts[deposits[i]?.verdict ?? "SKIP"]++
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

function mountPlanner(main, board, tables, {estimateFarmEconomics, farmAssumptions, formatUsd, planPortfolio}) {
	const names = new Map(board.map(({protocol}) => [protocol.slug, protocol.name]))
	main.innerHTML = plannerForm(board.flatMap(({protocol}) => protocol.chains))
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
		const result = planPortfolio(board, {
			budgetUsd,
			hoursPerWeek,
			assumptions,
			...(state.chains.length ? {chains: state.chains} : {})
		})
		results.innerHTML = plannerResults(result, economics, slug => names.get(slug) ?? slug, formatUsd)
	}
	return hash => update(parsePlanState(hash))
}
window.Radar.mountPlanner = mountPlanner
})();
