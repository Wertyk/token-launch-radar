(() => {
function compareText(a, b) {
	return a < b ? -1 : Number(a > b)
}
function compareRows(a, b, sort, direction) {
	if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase())
	const first = a[sort]
	const second = b[sort]
	if (first === second) return 0
	if (first === null) return 1
	if (second === null) return -1
	return direction * (Number(first) - Number(second))
}
function selectRows(rows, state) {
	const {sort, dir, cat, chain, wl} = state
	const query = state.q.trim().toLowerCase()
	const direction = dir === "asc" ? 1 : -1
	return rows
		.filter(row => (!cat || row.category === cat) && (!chain || row.chains.includes(chain)) && (!wl || row.watchlist) && (!query || row.name.toLowerCase().includes(query)))
		.sort((a, b) => compareRows(a, b, sort, direction) || compareText(a.slug, b.slug))
}

function formatInteger(value) {
	return value === null ? "—" : value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
function formatCompactUsd(value) {
	const scale = Math.min(4, Math.floor(Math.log10(value) / 3))
	return scale < 1 ? `$${value}` : `$${(value / 1e3 ** scale).toFixed(2)}${" KMBT"[scale]}`
}
function signedTerm(value, decimals = 3) {
	return `${value < 0 ? "−" : "+"} ${Math.abs(value).toFixed(decimals)}`
}
function formatOdds(value) {
	return `${(value * 100).toFixed(1)}%`
}
function formatPercent(value) {
	if (value === null) return "—"
	const magnitude = Math.abs(value).toFixed(1)
	const sign = magnitude === "0.0" ? "" : value < 0 ? "−" : "+"
	return `${sign}${magnitude}%`
}
function escapeHtml(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;")
}

function tableBody(rows, columns2, options2 = {}) {
	if (!rows.length && options2.empty) {
		return `<tr><td colspan="${columns2}" class="empty">${escapeHtml(options2.empty)}</td></tr>`
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
function svg(width, height, content) {
	return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${content}</svg>`
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
var statusLabels = {
	traded: "Token trades",
	"token-unpriced": "Records an unpriced token",
	"pre-token": "Records no token",
	excluded: "Excluded by the house rule"
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
	const sort = params.get("sort") ?? void 0
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
	if (segment) {
		try {
			return {page: "protocol", slug: decodeURIComponent(segment), state}
		} catch {
			return {page: "unknown", state}
		}
	}
	return {page: "unknown", state}
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
function protocolHash(slug, state) {
	return `#/p/${encodeURIComponent(slug)}${boardHash(state).slice(2)}`
}

function boardTable() {
	return `<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(columns), [], {className: "ranking"})}</section>`
}
function chip(label, className = "chip") {
	return `<span class="${className}">${escapeHtml(label)}</span>`
}
function growthText(growth) {
	const text = formatPercent(growth)
	const trend = text.startsWith("+") ? "gain" : text.startsWith("−") ? "loss" : ""
	return `<span class="${trend}">${text}</span>`
}
function boardRows(rows, state, maxLogValue, usd) {
	const scale = value => (Math.log1p(value) / maxLogValue) * 100
	return tableBody(
		rows.map(row => {
			const href = escapeHtml(protocolHash(row.slug, state))
			const remaining = row.chains.length - 2
			const [low, high] = row.interval ?? [0, 0]
			const band = row.interval ? `<rect class="band" x="${scale(low).toFixed(2)}" y="5" width="${(scale(high) - scale(low)).toFixed(2)}" height="3"></rect>` : ""
			return [
				formatInteger(row.rank),
				`<a class="protocol-name" href="${href}">${escapeHtml(row.name)}</a>
       <div class="chips" title="${escapeHtml(row.chains.join(", "))}">${chip(row.category ?? "Unlisted category")}${row.chains
					.slice(0, 2)
					.map(chain => chip(chain))
					.join("")}${remaining > 0 ? chip(`+${remaining}`) : ""}</div>`,
				`<div class="value" ${row.interval ? `title="P10–P90: ${usd(low)}–${usd(high)}"` : ""}><strong>${usd(row.value)}</strong>
        ${svg(100, 8, `<rect width="${scale(row.value).toFixed(2)}" height="3"></rect>${band}`)}</div>`,
				usd(row.launchValue),
				formatOdds(row.odds),
				usd(row.tvl),
				growthText(row.growth),
				formatInteger(row.age),
				usd(row.cost),
				`${formatInteger(row.time)} min`,
				row.watchlist ? chip("Watchlist", "badge") : "—"
			]
		}),
		Object.keys(columns).length,
		{linked: true, empty: "No protocols match these filters."}
	)
}

function censusSummary(rows, ranked) {
	const counts = {"pre-token": 0, traded: 0, "token-unpriced": 0, excluded: 0}
	for (const {slug, status} of rows) if (!ranked?.has(slug)) counts[status]++
	if (!ranked && Object.values(counts).reduce((sum, count) => sum + count, 0) !== rows.length) throw new Error("Census counts do not add up")
	const link = (status, label = status) => `<a href="#/census?status=${status}${ranked ? "&amp;unranked=1" : ""}">${formatInteger(counts[status])} ${label}</a>`
	const parts = [link("traded"), link("token-unpriced", "token, unpriced"), link("excluded")]
	return `<p class="census-summary">${ranked ? `Not ranked: ${parts.join(" · ")} (wrapped, staked, bridged, exchange)` : `${formatInteger(rows.length)} protocols = ${link("pre-token", "pre-token (ranked)")} + ${parts.join(" + ")}`}</p>`
}
function selectCensus(rows, {status, sort, dir, unranked}, ranked) {
	const direction = dir === "asc" ? 1 : -1
	const label = (row, key) => (key === "status" ? statusLabels[row.status] : row[key].toLowerCase())
	return rows
		.filter(row => (!status || row.status === status) && (!unranked || !ranked?.has(row.slug)))
		.sort((a, b) => {
			const order = sort === "tvl" ? a.tvl_usd - b.tvl_usd : compareText(label(a, sort), label(b, sort))
			return direction * order || compareText(a.slug, b.slug)
		})
}
function censusView(rows, state, usd, ranked) {
	const selected = selectCensus(rows, state, ranked)
	return `<h2>Protocol census</h2>${censusSummary(rows)}
    <div class="filters">
      <label class="field">Status <select name="status"><option value="">All statuses</option>${Object.entries(statusLabels)
				.map(([key, label]) => `<option value="${key}"${state.status === key ? " selected" : ""}>${label}</option>`)
				.join("")}</select></label>
      <output id="results">${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols</output>
    </div>
    ${table(
			[
				["name", "Protocol"],
				["status", "Status"],
				["reason", "Reason"],
				["tvl", "TVL"]
			],
			selected.map(({name, status, reason, tvl_usd}) => [escapeHtml(name), statusLabels[status], escapeHtml(reason), usd(tvl_usd)]),
			{...state, className: "ranking census", empty: "No matching protocols."}
		)}`
}

function element(selector, root = document) {
	const found = root.querySelector(selector)
	if (!found) throw new Error(`Missing dashboard element ${selector}`)
	return found
}

function boardMismatches(computed, published) {
	const slugs = published.slice(computed.length).map(({slug}) => slug)
	for (const [index, row] of computed.entries()) {
		const other = published[index]
		const farm = other?.farm_economics
		const {airdropYieldApr, launchProbability12: p12, breakEvenDepositUsd, deposits} = row.economics
		if (
			!other ||
			row.protocol.slug !== other.slug ||
			row.rank !== other.rank ||
			row.launch_value_usd !== other.launch_value_usd ||
			row.implied_value_usd !== other.implied_value_usd ||
			row.farm_steps.length !== other.farm_steps.length ||
			row.farm_steps.some((step, i) => step !== other.farm_steps[i]) ||
			airdropYieldApr !== other.airdrop_yield_apr ||
			p12 !== other.launch_p12 ||
			p12 !== farm?.launchProbability12 ||
			breakEvenDepositUsd !== farm.breakEvenDepositUsd ||
			deposits.length !== farm.deposits?.length ||
			deposits.some((deposit, i) => {
				const prior = farm.deposits[i]
				return !prior || Object.entries(deposit).some(([key, value]) => prior[key] !== value)
			})
		) {
			slugs.push(row.protocol.slug)
		}
	}
	return slugs
}

function integrityChecks(computed, published, watchlist, {fitted, houseRule, intervalCounts, loo}) {
	const mismatches = boardMismatches(computed, published)
	const count = mismatches.length
	const slugs = new Set(published.map(({slug}) => slug))
	const unique = [...new Set(watchlist)]
	const covered = unique.filter(slug => slugs.has(slug)).length
	const {missLow, covered: inside, missHigh} = intervalCounts ?? {missLow: 0, covered: 0, missHigh: 0}
	const samples = missLow + inside + missHigh
	const matches = houseRule.truePositives.length
	const extra = houseRule.falsePositives.length
	const {model, flatMultiple: flat} = loo
	const samePopulation = model.n === fitted && flat.n === fitted
	return [
		{
			pass: count === 0,
			label: `Recompute ${count ? "≠" : "="} board.json · launch values, odds, implied values, ranks, plans, economics (${count ? `${count} mismatched · ${mismatches[0]}` : published.length})`
		},
		{pass: covered === unique.length, label: `Watchlist ${covered}/${unique.length} on board`},
		{
			pass: matches === unique.length && unique.length > 0,
			label: `House rule ${matches}/${unique.length} recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`
		},
		{
			pass: samples === fitted && inside / samples >= 0.8,
			label: `${inside}/${samples} launch values inside P10–P90${samples === fitted ? "" : ` · ${samples}/${fitted} families`}`
		},
		{
			pass: samePopulation && model.medianMultiplier !== null && flat.medianMultiplier !== null && model.medianMultiplier < flat.medianMultiplier,
			label: `Launch value LOO error ${multiplier(model.medianMultiplier)} vs ${multiplier(flat.medianMultiplier)} flat${samePopulation ? "" : ` · model n=${model.n}/${fitted}, flat n=${flat.n}/${fitted}`}`
		}
	]
}
function integrityStrip(checks) {
	return `<ul class="integrity">${checks.map(({pass, label}) => `<li class="${pass ? "check" : "check-failed"}">${pass ? "✓" : "✗"} ${escapeHtml(label)}</li>`).join("")}</ul>`
}
function multiplier(value) {
	return value === null ? "—" : `×${value.toFixed(2)}`
}

function relativeScore(variant, full) {
	if (variant === null || full === null) return "unavailable"
	return variant === full ? "unchanged" : variant < full ? "lower" : "higher"
}
function methodView({model, houseRule, intervalCounts, launchClock}, farm, usd) {
	const {coefficients, validation, ablation} = model
	const {intercept, lnTvl, lnAge} = coefficients
	const {leaveOneFamilyOut, seededFiveFold, walkForward} = validation
	const {full, withoutTvl, withoutAge, withoutMomentum, withCategory, ols} = ablation
	const score = ({medianMultiplier, spearman}) => [multiplier(medianMultiplier), spearman?.toFixed(3) ?? "—"]
	const section = (title, headers, rows, note = "") => `<section class="panel"><h3>${title}</h3>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`
	const {truePositives, falsePositives, falseNegatives} = houseRule
	return `<h2>Method</h2><div class="method compact">
    ${section(
			"Launch value model",
			["Term in ln V", "Coefficient"],
			[
				["Intercept", intercept.toFixed(6)],
				["ln(TVL·(1+g₇))", lnTvl.toFixed(6)],
				["ln(age)", lnAge.toFixed(6)],
				["Ridge penalty λ", String(model.lambda)]
			],
			`Huber ridge on ${model.n} traded families.`
		)}
    ${section(
			"Out-of-sample validation",
			["Scheme", "Model", "Flat", "Category"],
			[
				["Leave one family out", leaveOneFamilyOut],
				["Seeded five-fold", seededFiveFold],
				["Walk-forward", walkForward]
			].map(([label, {model: fitted, flatMultiple, categoryMultiple}]) => [label, ...[fitted, flatMultiple, categoryMultiple].map(s => score(s).join(" · "))]),
			"Launch value on traded families · median error ×k and Spearman ρ."
		)}
    ${section(
			"Leave-one-family-out ablation",
			["Variant", "Median error", "Spearman ρ"],
			[
				["Full", full],
				["−TVL", withoutTvl],
				["−Age", withoutAge],
				["−Momentum", withoutMomentum],
				["+Category", withCategory],
				["OLS", ols]
			].map(([label, metrics]) => [label, ...score(metrics)]),
			`Without age, median error is ${relativeScore(withoutAge.medianMultiplier, full.medianMultiplier)} and Spearman is ${relativeScore(withoutAge.spearman, full.spearman)}.`
		)}
    ${section(
			"Held-out P10–P90 coverage",
			["Below P10", "Inside", "Above P90"],
			intervalCounts ? [[intervalCounts.missLow, intervalCounts.covered, intervalCounts.missHigh].map(String)] : [],
			"Jackknife+ launch value bands on traded families."
		)}
    ${section(
			"Launch clock F(t)",
			["Mean age (days)", "Fitted token share", "Count"],
			launchClock.points.map(({ageDays, share, count}) => [ageDays.toFixed(0), formatOdds(share), String(count)]),
			"The clock estimates 12-month odds. Its tail uses the last rising segment’s constant conditional hazard, or the pooled annual rate for a flat fit. The snapshot cannot validate future launch odds."
		)}
    ${section(
			"House watchlist rule",
			["TP", "FP", "FN"],
			[[truePositives.length, falsePositives.length, falseNegatives.length].map(String)],
			"DefiLlama marks extra matches with parentProtocol, absent from the snapshot."
		)}
    ${section(
			`Farm assumptions · ${farm.asOf}`,
			["Input", "Default"],
			[
				["Horizon", `${farm.horizonMonths} months`],
				["Airdrop share of launch cap", formatOdds(farm.airdropShareOfLaunchCap)],
				["Farmer haircut (retained)", formatOdds(farm.farmerHaircut)],
				["Labor", `${usd(farm.hourlyRateUsd)}/h`],
				["Capital APR", `${formatOdds(farm.capitalApr.yieldBearing)} yield-bearing · ${formatOdds(farm.capitalApr.nonYielding)} non-yielding`],
				["Verdict test deposits", farm.depositsUsd.map(usd).join(" · ")],
				["EV / cost cutoffs", `FARM ≥ ${farm.farmThreshold} · THIN ≥ ${farm.thinThreshold}`]
			]
		)}
  </div>`
}

function ageSparkline(maxAge, age, odds, oddsAt) {
	const y = fraction => ((1 - fraction) * 40).toFixed(2)
	const marker = (age / maxAge) * 100
	const line = Array.from({length: 33}, (_, index) => {
		const x = (index / 32) * 100
		return `${x.toFixed(2)},${y(oddsAt((x / 100) * maxAge))}`
	}).join(" ")
	return svg(100, 40, `<polyline points="${line}"></polyline><circle cx="${marker.toFixed(2)}" cy="${y(odds)}" r="2" class="age-point"></circle>`)
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
function decomposition(row, usd) {
	const {base, multipliers} = row.decomposition
	const {lnTvl, growth, lnAge} = multipliers
	const afterTvl = base * lnTvl
	const stages = [
		["Base", base],
		["TVL", afterTvl, lnTvl],
		["7d growth", afterTvl * growth, growth],
		["Age", row.valueUsd, lnAge],
		["Launch value", row.launch_value_usd],
		["× launch odds 12m", null, row.launchProbability12],
		["Implied value", row.implied_value_usd]
	]
	const largest = Math.max(1, ...stages.map(([, value]) => (Number.isFinite(value) ? (value ?? 0) : 0)))
	return `<ol class="waterfall">${stages
		.map(([label, value, factor]) => {
			if (value === null) return `<li><span>${label}</span><span>(${formatOdds(factor)})</span></li>`
			const finite = Number.isFinite(value)
			const width = finite ? ((value / largest) * 100).toFixed(2) : "0"
			const term = factor === void 0 ? "" : `×${factor.toPrecision(4)}`
			return `<li><span>${label}</span><span>${term}</span>${svg(100, 6, `<rect width="${width}" height="6"></rect>`)}<strong>${finite ? usd(Math.round(value)) : "—"}</strong></li>`
		})
		.join("")}</ol>`
}
function valueEquation(row, {intercept, lnTvl, lnAge}, lnValue, clockAge, usd) {
	const growth = Math.exp(row.features.growth).toFixed(3)
	const days = Math.exp(row.features.lnAge).toFixed(0)
	return `<p class="value-equation">ln V ≈ ${intercept.toFixed(4)} ${signedTerm(lnTvl, 4)} × ln(${formatCompactUsd(row.protocol.tvl_usd)} × ${growth}) ${signedTerm(lnAge, 4)} × ln(${days} d) ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)} × P₁₂(${clockAge.toFixed(0)} d) ${formatOdds(row.launchProbability12)} → ${usd(row.implied_value_usd)}</p>`
}
function protocolView(row, {age, coefficients, lnValue, back, usd, farm, diagnostics, families, launchClock, launchProbability12}) {
	const {protocol, plan, economics, status} = row
	const {hourlyRateUsd, farmerHaircut} = farm
	const {airdropYieldApr, breakEvenDepositUsd} = economics
	const facts = [
		["TVL", usd(protocol.tvl_usd)],
		["7d TVL change", growthText(protocol.change_7d)],
		["Listed", escapeHtml(protocol.listed_at ?? "Unlisted")],
		[status === "traded" || status === "token-unpriced" ? "Days since listing" : "Days with no token", formatInteger(age)]
	]
	const interval = diagnostics ? `${usd(diagnostics.interval_p10_usd)}–${usd(diagnostics.interval_p90_usd)}` : "—"
	const influence = diagnostics?.influence
	const comparable = influence && families.get(influence.slug)?.representative.name
	const influenceLine =
		influence?.rank_delta === 0 ? "No single comparable moves this rank" : influence && comparable ? `Without ${escapeHtml(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}` : ""
	const clockAge = Math.max(0, age ?? launchClock.medianAgeDays ?? 0)
	const {points} = launchClock
	const p12 = row.launchProbability12
	const maxAge = Math.max(1, clockAge, points.at(-1)?.ageDays ?? 0)
	const twins = (diagnostics?.twins ?? []).map(slug => {
		const family = families.get(slug)
		return [escapeHtml(family?.representative.name ?? slug), family?.mcap_usd ? usd(family.mcap_usd) : "—"]
	})
	const steps = table(
		["Action", "Est. fee", "Minutes", "Cadence"],
		plan.steps.map(step => [escapeHtml(step.action) + (step.exitCondition ? `<small>${escapeHtml(step.exitCondition)}</small>` : ""), usd(step.costUsd), formatInteger(step.minutes), step.cadence]),
		{total: ["Total planned", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "All"]}
	)
	return `<a class="back" href="${escapeHtml(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${escapeHtml(protocol.name)}</h2>
      <div class="chips">${chip(protocol.category ?? "Unlisted category")}${protocol.chains.map(chain => chip(chain)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`, "badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p>P10–P90 · ${interval}</p>
          ${decomposition(row, usd)}
          ${valueEquation(row, coefficients, lnValue, clockAge, usd)}
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        <section class="panel"><h3>Protocol record</h3>
          <dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
          <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${escapeHtml(row.reason)}`}</p>
          <p class="muted">Included · ${row.boardReasons.map(reason => reasonLabels[reason]).join(" · ")}</p>
          ${row.flags.length ? `<ul class="flags">${row.flags.map(flag => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="panel clock"><h3>Launch clock</h3>
          ${ageSparkline(maxAge, clockAge, p12, days => launchProbability12(points, days))}
          <p><strong>P₁₂ · ${formatOdds(p12)}</strong></p>
          <p class="caption">Age marker · ${formatInteger(clockAge)} days${age === null ? " (median proxy)" : ""}</p>
        </section>
      </div>
      <div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${escapeHtml(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.horizonMonths} months</p>
          <div class="chips">${economics.deposits.map(({depositUsd, verdict}) => chip(`${usd(depositUsd)} ${verdict}`, "badge")).join("")}</div>
          <p class="caption">${usd(hourlyRateUsd)}/h for labor · ${farmerHaircut * 100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
          ${steps}
          <p class="caption">Per-occurrence minutes and fees. Assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · fallback fees" : ""}.</p>
        </section>
        <section class="panel compact"><h3>Nearest comparables</h3>
          ${table(["Twin", "Family market cap"], twins)}
        </section>
      </div>
    </div>`
}

function mountBoard(main2, rows, summary, usd) {
	main2.innerHTML = summary + element("#board-filters").innerHTML + boardTable()
	const search = element('[name="q"]', main2)
	const category = element('[name="cat"]', main2)
	const chain = element('[name="chain"]', main2)
	category.insertAdjacentHTML("beforeend", options(rows.flatMap(({category: category2}) => category2 ?? [])))
	chain.insertAdjacentHTML("beforeend", options(rows.flatMap(({chains}) => chains)))
	const watchlist = element('[name="wl"]', main2)
	const results = element("#results", main2)
	const body = element("tbody", main2)
	const buttons = main2.querySelectorAll("button[data-sort]")
	const maxLogValue = Math.log1p(Math.max(1, ...rows.flatMap(({value, interval}) => [value, interval?.[1] ?? 0])))
	function setSelect(select, value) {
		select.querySelector("[data-temporary]")?.remove()
		select.value = value
		if (select.selectedIndex < 0) {
			const option = new Option(value, value, false, true)
			option.dataset.temporary = ""
			select.add(option)
		}
	}
	return state => {
		if (search.value !== state.q) search.value = state.q
		setSelect(category, state.cat)
		setSelect(chain, state.chain)
		watchlist.checked = state.wl
		for (const button of buttons) {
			const th = button.parentElement
			if (th) th.ariaSort = button.dataset.sort !== state.sort ? null : state.dir === "asc" ? "ascending" : "descending"
		}
		const selected = selectRows(rows, state)
		results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`
		body.innerHTML = boardRows(selected, state, maxLogValue, usd)
	}
}
function start(main2, snapshot2, data2, api2) {
	const {buildRadar, daysBetween, farmAssumptions, formatUsd} = api2
	const {launchClock, meta} = data2
	const radar = buildRadar(snapshot2, data2.model.lambda, launchClock, meta)
	const published = data2.board.rows
	const families = new Map(radar.families.map(family => [family.representative.slug, family]))
	const evidence = new Map(published.map(row => [row.slug, row]))
	const checks = integrityChecks(radar.board, published, snapshot2.watchlist, {
		fitted: radar.model.n,
		houseRule: radar.houseRule,
		intervalCounts: data2.intervalCounts,
		loo: data2.model.validation.leaveOneFamilyOut
	})
	const watchlisted = new Set(snapshot2.watchlist)
	const protocols = new Map(radar.board.map(row => [row.protocol.slug, row]))
	const age = ({listed_at}) => (listed_at === null ? null : daysBetween(listed_at, snapshot2.as_of))
	const rows = radar.board.map(({protocol, rank, status, implied_value_usd: value, launch_value_usd: launchValue, launchProbability12: odds, plan}) => {
		const {slug, name, tvl_usd, change_7d, category, chains} = protocol
		const diagnostics = evidence.get(slug)
		return {
			slug,
			name,
			rank,
			category,
			chains,
			value,
			launchValue,
			odds,
			tvl: tvl_usd,
			growth: change_7d,
			interval: diagnostics ? [diagnostics.interval_p10_usd, diagnostics.interval_p90_usd] : null,
			age: status === "traded" || status === "token-unpriced" ? null : age(protocol),
			cost: plan.totalCostUsd,
			time: plan.totalMinutes,
			watchlist: watchlisted.has(slug)
		}
	})
	element("#snapshot-date").textContent = `Snapshot · ${snapshot2.as_of}`
	const counts = [snapshot2.protocols.length, radar.model.n, rows.length]
	document.querySelectorAll("#summary dd").forEach((count, i) => {
		count.textContent = formatInteger(counts[i] ?? null)
	})
	const {intercept, lnTvl, lnAge} = radar.model.coefficients
	element("#formula").textContent = `ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)`
	element("#checks").innerHTML = integrityStrip(checks)
	let updateBoard
	let updatePlan
	let lastPage
	function draw() {
		delete main2.dataset.ready
		const route = parseRoute(location.hash)
		const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page
		const changedPage = lastPage && lastPage !== page
		lastPage = page
		if (route.page !== "board") updateBoard = void 0
		if (route.page !== "plan") updatePlan = void 0
		if (route.page === "board") {
			updateBoard ??= mountBoard(main2, rows, censusSummary(data2.census, protocols), formatUsd)
			updateBoard(route.state)
		} else if (route.page === "plan") {
			updatePlan ??= api2.mountPlanner(main2, radar.board, meta, api2)
			updatePlan(location.hash)
		} else if (route.page === "census") {
			main2.innerHTML = censusView(data2.census, route.state, formatUsd, protocols)
		} else if (route.page === "method") {
			main2.innerHTML = methodView({...data2, houseRule: radar.houseRule}, farmAssumptions, formatUsd)
		} else {
			const back = boardHash(route.state)
			const detail = route.page === "protocol" ? protocols.get(route.slug) : void 0
			main2.innerHTML = detail
				? protocolView(detail, {
						age: age(detail.protocol),
						coefficients: data2.model.coefficients,
						lnValue: api2.logValue(detail.features, data2.model),
						back,
						usd: formatUsd,
						farm: farmAssumptions,
						diagnostics: evidence.get(detail.protocol.slug),
						families,
						launchClock,
						launchProbability12: api2.launchProbability12
					})
				: `<h2>Page unavailable</h2><a href="${escapeHtml(back)}">Back to board</a>`
		}
		if (changedPage) {
			window.scrollTo(0, 0)
			main2.focus({preventScroll: true})
		}
		main2.dataset.ready = ""
	}
	main2.addEventListener("click", event => {
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
	main2.addEventListener("submit", event => event.preventDefault())
	main2.addEventListener("input", ({target}) => {
		if (!(target instanceof HTMLInputElement) || target.name !== "q") return
		const route = parseRoute(location.hash)
		if (route.page !== "board") return
		history.replaceState(null, "", boardHash({...route.state, q: target.value}))
		draw()
	})
	main2.addEventListener("change", event => {
		const target = event.target
		const route = parseRoute(location.hash)
		if (route.page === "census" && target instanceof HTMLSelectElement && target.name === "status") {
			location.hash = censusHash({
				...route.state,
				status: target.value
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
	window.addEventListener("hashchange", draw)
	draw()
}
var main = element("main")
var {RADAR_DATA: data, Radar: api} = window
var snapshot = data && api.readPublishedSnapshot(data)
if (data && snapshot) {
	start(main, snapshot, data, api)
} else {
	main.innerHTML = "<h2>Snapshot data unavailable</h2><p>Generate it with <code>pnpm radar</code>.</p>"
}
})();
