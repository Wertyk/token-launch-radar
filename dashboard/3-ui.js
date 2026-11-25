(() => {
var verdictOrder = {SKIP: 0, THIN: 1, FARM: 2}
function compareRows(a, b, sort, direction, compareText) {
	if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase())
	if (sort === "verdict") return direction * (verdictOrder[a.verdict] - verdictOrder[b.verdict])
	const first = a[sort]
	const second = b[sort]
	if (first === null || second === null) return Number(first === null) - Number(second === null)
	return direction * (Number(first) - Number(second))
}
function selectRows(rows, state, compareText) {
	const {sort, dir, cat, chain, wl} = state
	const query = state.q.trim().toLowerCase()
	const direction = dir === "asc" ? 1 : -1
	return rows
		.filter(row => (!cat || row.category === cat) && (!chain || row.chains.includes(chain)) && (!wl || row.watchlist) && (!query || row.name.toLowerCase().includes(query)))
		.sort((a, b) => compareRows(a, b, sort, direction, compareText) || compareText(a.slug, b.slug))
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
	return `${(value * 100).toFixed(value < 0.05 ? 2 : 1)}%`
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

function tableBody(rows, columns2, options = {}) {
	if (!rows.length && options.empty) {
		return `<tr><td colspan="${columns2}" class="empty">${escapeHtml(options.empty)}</td></tr>`
	}
	return rows.map(row => `<tr${options.linked ? " data-protocol" : ""}><td>${row.join("</td><td>")}</td></tr>`).join("")
}
function table(headers, rows, options = {}) {
	const head = headers.map(header => {
		if (typeof header === "string") return `<th scope="col">${escapeHtml(header)}</th>`
		const [key, label2] = header
		const direction = options.dir === "desc" ? "descending" : "ascending"
		return `<th scope="col"${options.sort === key ? ` aria-sort="${direction}"` : ""}><button type="button" data-sort="${escapeHtml(key)}">${escapeHtml(label2)}</button></th>`
	})
	const [label, ...totals] = options.total ?? []
	const foot = label === void 0 ? "" : `<tfoot><tr><th scope="row">${label}</th><td>${totals.join("</td><td>")}</td></tr></tfoot>`
	return `<table${options.className ? ` class="${options.className}"` : ""}><thead><tr>${head.join("")}</tr></thead><tbody>${tableBody(rows, headers.length, options)}</tbody>${foot}</table>`
}
function svg(width, height, content) {
	return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${content}</svg>`
}

var columns = {
	rank: "Rank",
	name: "Protocol",
	value: "Implied value",
	launchValue: "Launch value",
	odds: "Odds 12m",
	tvl: "TVL",
	growth: "7d %",
	cost: "Plan fees",
	time: "Plan time",
	verdict: "$10K verdict",
	netPerHour: "$10K net/h",
	watchlist: "Watchlist"
}
var statusLabels = {
	traded: "Token trades",
	"token-unpriced": "Records an unpriced token",
	"pre-token": "Records no token",
	excluded: "Excluded by the house rule"
}
var defaultSort = "rank"
function isSortKey(value) {
	return Object.hasOwn(columns, value ?? "")
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
		sort: isSortKey(sort) ? sort : defaultSort,
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
function protocolHref(slug, back) {
	return `#/p/${encodeURIComponent(slug)}${back.slice(2)}`
}

function boardTable() {
	return `<section class="table-window" aria-label="Protocol rankings" tabindex="0">${table(Object.entries(columns), [], {className: "ranking", sort: "rank", dir: "asc"})}</section>`
}
function chip(label, className = "chip") {
	return `<span class="${className}">${escapeHtml(label)}</span>`
}
function growthText(growth) {
	const text = formatPercent(growth)
	const trend = text.startsWith("+") ? "gain" : text.startsWith("−") ? "loss" : ""
	return `<span class="${trend}">${text}</span>`
}
function boardRows(rows, back, maxLogValue, usd) {
	const scale = value => (Math.log1p(value) / maxLogValue) * 100
	return tableBody(
		rows.map(row => {
			const {slug, chains} = row
			const href = escapeHtml(protocolHref(slug, back))
			const labels = [row.category ?? "Unlisted category", ...chains.slice(0, 2)]
			if (chains.length > 2) labels.push(`+${chains.length - 2}`)
			const [low, high] = row.interval ?? [0, 0]
			const band = row.interval ? `<rect class="band" x="${scale(low).toFixed(2)}" y="5" width="${(scale(high) - scale(low)).toFixed(2)}" height="3"></rect>` : ""
			return [
				formatInteger(row.rank),
				`<a class="protocol-name" href="${href}">${escapeHtml(row.name)}</a>
       <div class="chips" title="${escapeHtml(chains.join(", "))}">${labels.map(label => chip(label)).join("")}</div>`,
				`<div class="value" ${row.interval ? `title="P10–P90: ${usd(low)}–${usd(high)}"` : ""}><strong>${usd(row.value)}</strong>
        ${svg(100, 8, `<rect width="${scale(row.value).toFixed(2)}" height="3"></rect>${band}`)}</div>`,
				usd(row.launchValue),
				formatOdds(row.odds),
				usd(row.tvl),
				growthText(row.growth),
				usd(row.cost),
				`${formatInteger(row.time)} min`,
				row.verdict,
				usd(row.netPerHour),
				row.watchlist ? chip("Watchlist", "badge") : "—"
			]
		}),
		Object.keys(columns).length,
		{linked: true, empty: "No protocols match these filters."}
	)
}

function censusSummary(rows, ranked) {
	const counts = {"pre-token": 0, traded: 0, "token-unpriced": 0, excluded: 0}
	let included = 0
	for (const {slug, status} of rows) {
		if (!Object.hasOwn(counts, status)) throw new Error("Census counts do not add up")
		if (ranked?.has(slug)) included++
		else counts[status]++
	}
	const link = (status, label = status) => `<a href="#/census?status=${status}${ranked ? "&amp;unranked=1" : ""}">${formatInteger(counts[status])} ${label}</a>`
	const parts = [link("traded"), link("token-unpriced", "token, unpriced"), link("excluded")]
	const total = formatInteger(rows.length)
	return `<p class="census-summary">${ranked ? `All ${total} protocols accounted for: ${formatInteger(included)} ranked · ${parts.join(" · ")} (wrapped, staked, bridged, exchange or versioned names)` : `${total} protocols = ${link("pre-token", "pre-token (ranked)")} + ${parts.join(" + ")}`}</p>`
}
function selectCensus(rows, {status, sort, dir, unranked}, compareText, ranked) {
	const direction = dir === "asc" ? 1 : -1
	const label = (row, key) => (key === "status" ? statusLabels[row.status] : row[key].toLowerCase())
	return rows
		.filter(row => (!status || row.status === status) && (!unranked || !ranked?.has(row.slug)))
		.sort((a, b) => {
			const order = sort === "tvl" ? a.tvl_usd - b.tvl_usd : compareText(label(a, sort), label(b, sort))
			return direction * order || compareText(a.slug, b.slug)
		})
}
function censusView(rows, state, usd, compareText, ranked) {
	const selected = selectCensus(rows, state, compareText, ranked)
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

function integrityChecks(mismatches, published, watchlist, {fitted, houseRule, intervalCounts, invalidPoints, coverageUnavailable, loo}) {
	const count = mismatches.length
	const slugs = new Set(published.map(row => row?.slug))
	const unique = new Set(watchlist)
	const covered = [...unique].filter(slug => slugs.has(slug)).length
	const {missLow, covered: inside, missHigh} = intervalCounts
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
		{pass: covered === unique.size, label: `Watchlist ${covered}/${unique.size} on board`},
		{
			pass: matches === unique.size && unique.size > 0,
			label: `House rule ${matches}/${unique.size} recall${extra ? ` · ${extra} extra explained by parentProtocol` : ""}`
		},
		coverageUnavailable
			? {pass: null, label: "Coverage unavailable · too few traded families"}
			: {
					pass: invalidPoints === 0 && Object.values(intervalCounts).every(n => Number.isInteger(n) && n >= 0) && samples === fitted && inside / samples >= 0.8,
					label: `${inside}/${samples} held-out traded caps inside P10–P90${samples === fitted ? "" : ` · ${samples}/${fitted} families`}${invalidPoints ? ` · ${invalidPoints} invalid` : ""}`
				},
		{
			pass: samePopulation && model.medianMultiplier !== null && flat.medianMultiplier !== null && model.medianMultiplier < flat.medianMultiplier,
			label: `Launch value LOO error ${multiplier(model.medianMultiplier)} vs ${multiplier(flat.medianMultiplier)} flat${samePopulation ? "" : ` · model n=${model.n}/${fitted}, flat n=${flat.n}/${fitted}`}`
		}
	]
}
function integrityStrip(checks) {
	const items = checks.map(({pass, label}) => {
		const style = pass === null ? "check-unavailable" : pass ? "check" : "check-failed"
		const mark = pass === null ? "" : pass ? "✓ " : "✗ "
		return `<li class="${style}">${mark}${escapeHtml(label)}</li>`
	})
	return `<ul class="integrity">${items.join("")}</ul>`
}
function multiplier(value) {
	return value === null ? "—" : `×${value.toFixed(2)}`
}

function scatterCoverage(points, families) {
	const counts = {missLow: 0, covered: 0, missHigh: 0}
	const seen = new Set()
	const classified = points.flatMap(point => {
		if (!point) return []
		const {slug, actual, predicted, p10, p90} = point
		const cap = families.get(slug)?.mcap_usd ?? 0
		if (p10 === null || p90 === null || ![p10, p90, actual, predicted].every(Number.isFinite) || p10 > p90 || seen.has(slug) || Math.abs(actual - Math.log(cap)) > 1e-9) return []
		seen.add(slug)
		const result = actual < p10 ? "missLow" : actual > p90 ? "missHigh" : "covered"
		counts[result]++
		return [{actual, predicted, inside: result === "covered"}]
	})
	return {points: classified, counts, invalidPoints: points.length - classified.length}
}
function launchValueScatter({points, counts}, {model, flatMultiple}) {
	const heading = '<section class="panel scatter"><h2>Predicted launch value vs current market cap</h2>'
	if (!points.length) {
		return `${heading}<p class="caption">No valid held-out bands to display.</p></section>`
	}
	const values = points.flatMap(({actual, predicted}) => [actual, predicted])
	const min = Math.floor(Math.min(...values) / Math.LN10)
	const max = Math.max(min + 1, Math.ceil(Math.max(...values) / Math.LN10))
	const fraction = log => (log / Math.LN10 - min) / (max - min)
	const x = log => (59 + fraction(log) * 313).toFixed(2)
	const y = log => (178 - fraction(log) * 170).toFixed(2)
	const marks = []
	for (let power = min; power <= max; power += Math.ceil((max - min) / 5)) {
		const log = power * Math.LN10
		const label = formatCompactUsd(10 ** power).replace(".00", "")
		marks.push(
			`<path class="scatter-grid" d="M59 ${y(log)}H372 M${x(log)} 178V8"></path><text x="54" y="${y(log)}" dy=".35em" text-anchor="end">${label}</text><text x="${x(log)}" y="191" text-anchor="middle">${label}</text>`
		)
	}
	const circles = points.map(
		({actual, predicted, inside}) => `<circle class="${inside ? "inside" : "outside"}" cx="${x(actual)}" cy="${y(predicted)}" r="3"${inside ? "" : ' fill="none" stroke="currentColor"'}></circle>`
	)
	const plot = svg(
		400,
		204,
		`${marks.join("")}<path class="identity" d="M59 178L372 8" stroke="currentColor" stroke-dasharray="4 3"></path>${circles.join("")}<text x="216" y="201" text-anchor="middle">Actual market cap (log USD)</text><text transform="translate(10 93) rotate(-90)" text-anchor="middle">Predicted (log USD)</text>`
	)
	return `${heading}${plot}<p class="caption">● Inside band · ○ Outside band · Dashed y = x<br>${counts.covered}/${points.length} inside held-out P10–P90 · LOO median error ${multiplier(model.medianMultiplier)} vs ${multiplier(flatMultiple.medianMultiplier)} flat</p></section>`
}

function methodPanel(title, headers, rows, note) {
	return `<section class="panel"><h2>${title}</h2>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`
}
function methodView({model, odds, scatter}, notes, renderTrials) {
	const {
		coefficients: {intercept, lnTvl, lnAge},
		validation,
		selection
	} = model
	const {baselines, scores} = odds.validation
	const brier = x => x?.toFixed(4) ?? "—"
	const cards = [
		'<div class="method-value">',
		methodPanel(
			"Launch value model",
			["Term in ln V", "Coefficient"],
			[
				["Intercept", intercept.toFixed(6)],
				[model.momentum ? "ln(TVL·(1+g₇))" : "ln(TVL)", lnTvl.toFixed(6)],
				...(selection.terms.includes("age") ? [["ln(age)", lnAge.toFixed(6)]] : []),
				...Object.entries(model.categoryEffects ?? {}).map(([group, effect]) => [group, effect.toFixed(6)]),
				["Ridge penalty λ", String(model.lambda)]
			],
			`Huber ridge on ${model.n} traded families.`
		),
		methodPanel(
			"Out-of-sample validation",
			["Scheme", "Model", "Flat", "Category"],
			[
				["Leave one family out", validation.leaveOneFamilyOut],
				["Seeded five-fold", validation.seededFiveFold],
				["Walk-forward", validation.walkForward]
			].map(([label, {model: fitted, flatMultiple, categoryMultiple}]) => [
				label,
				...[fitted, flatMultiple, categoryMultiple].map(({medianMultiplier, spearman}) => `${multiplier(medianMultiplier)} · ${spearman?.toFixed(3) ?? "—"}`)
			]),
			"Current traded-family market caps proxy for launch value. Median error ×k and Spearman ρ."
		),
		renderTrials?.(selection, "Value", table) ?? "",
		"</div><div>",
		methodPanel(
			"Token-status model",
			["Term in logit F(a)", "Coefficient"],
			odds.names.map((name, i) => [name, odds.coefficients[i]?.toFixed(6) ?? "—"]),
			`S(a) is the PAVA share clamped to 0.01–0.99. P₁₂ = [F(a+365) − F(a)] / [1 − F(a)]. Flat years use the annual tail hazard. Undated age ${odds.medianAgeDays} days.`
		),
		methodPanel(
			"Held-out token status",
			["Model", "10-fold Brier", "Walk-forward Brier"],
			[
				["Base rate", baselines.baseRate],
				["Raw PAVA clock", baselines.pava],
				["Clock-only model (step 0)", baselines.clockOnly],
				["Final model", scores]
			].map(([label, pair]) => [label, ...pair.map(brier)]),
			"Each fold refits its clock. Brier scores current token status. P₁₂ assumes the cross-section behaves like a cohort."
		),
		renderTrials?.(odds.validation, "Odds", table) ?? "",
		"</div><div>",
		launchValueScatter(scatter, validation.leaveOneFamilyOut),
		notes?.(methodPanel) ?? "",
		"</div>"
	]
	return `<div class="method compact">${cards.join("")}</div>`
}

var tolerance = 1e-9
function matchesFields(a, b, field = "") {
	if (a === b) return true
	if (typeof a === "number" && typeof b === "number" && !Number.isInteger(a) && !/^plan_/.test(field)) {
		const delta = Math.abs(a - b)
		return Number.isFinite(delta) && delta <= tolerance * Math.max(1, Math.abs(a), Math.abs(b))
	}
	if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
	if (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length)) return false
	return Object.entries(a).every(([key, value]) => matchesFields(value, b[key], key))
}
function boardInterval(row) {
	if (!row) return null
	const {interval_p10_usd: low, interval_p90_usd: high} = row
	return Number.isInteger(low) && Number.isInteger(high) && low > 0 && low <= high ? [low, high] : null
}
function boardMismatches(computed, published, steps) {
	const slugs = published.slice(computed.length).map(row => (typeof row?.slug === "string" ? row.slug : "(missing slug)"))
	for (const [index, row] of computed.entries()) {
		const {
			rank,
			launch_value_usd,
			implied_value_usd,
			plan,
			protocol: {slug}
		} = row
		const saved = published[index]
		const farm_steps = steps?.(row) ?? row.farm_steps ?? saved?.farm_steps
		const {airdropYieldApr: airdrop_yield_apr, ...farm_economics} = row.economics
		const expected = {
			slug,
			rank,
			launch_value_usd,
			implied_value_usd,
			airdrop_yield_apr,
			launch_p12: farm_economics.launchProbability12,
			plan_chain: plan.chain,
			plan_one_time_cost_usd: plan.oneTimeCostUsd,
			plan_recurring_cost_usd: plan.recurringCostUsd,
			plan_total_cost_usd: plan.totalCostUsd,
			plan_total_minutes: plan.totalMinutes,
			farm_economics,
			farm_steps
		}
		if (!boardInterval(saved) || !Array.isArray(farm_steps) || !matchesFields(expected, saved)) slugs.push(slug)
	}
	return slugs
}
function prepareBoard({board, families}, published, watchlist, steps) {
	const evidence = new Map(published.flatMap(row => (row ? [[row.slug, row]] : [])))
	return {
		diagnostics: evidence,
		families: new Map(families.map(family => [family.representative.slug, family])),
		protocols: new Map(board.map(row => [row.protocol.slug, row])),
		mismatches: boardMismatches(board, published, steps),
		rows: boardViewRows(board, evidence, watchlist)
	}
}
function boardViewRows(board, evidence, watchlist) {
	const watchlisted = new Set(watchlist)
	return board.map(({protocol, rank, implied_value_usd: value, launch_value_usd: launchValue, launchProbability12: odds, plan, economics}) => {
		const {slug, name, tvl_usd, change_7d, category, chains} = protocol
		const deposit = economics.deposits.find(({depositUsd}) => depositUsd === 1e4)
		if (!deposit) throw new Error("Missing $10K farm economics.")
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
			interval: boardInterval(evidence.get(slug)),
			cost: plan.totalCostUsd,
			time: plan.totalMinutes,
			verdict: deposit.verdict,
			netPerHour: deposit.netPerHourUsd,
			watchlist: watchlisted.has(slug)
		}
	})
}

var viewTools = {
	escapeHtml,
	formatInteger,
	formatOdds,
	growthText,
	statusLabels,
	svg,
	table
}

function decomposition(row, usd) {
	const {base, multipliers} = row.decomposition
	const {lnTvl, growth, lnAge, category = 1} = multipliers
	const afterTvl = base * lnTvl
	const stages = [
		["Base", base],
		["TVL", afterTvl, lnTvl],
		...(growth === 1 ? [] : [["7d growth", afterTvl * growth, growth]]),
		...(lnAge === 1 ? [] : [["Age", afterTvl * growth * lnAge, lnAge]]),
		...(category === 1 ? [] : [["Category", row.valueUsd, category]]),
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
function valueFormula(model, row) {
	const {intercept, lnTvl, lnAge} = model.coefficients
	const decimals = row ? 4 : 3
	const tvl = row ? formatCompactUsd(row.protocol.tvl_usd) : "TVL"
	const growth = row ? Math.exp(row.features.growth).toFixed(3) : "(1+g₇)"
	const age = row ? `${Math.exp(row.features.lnAge).toFixed(0)} d` : "age"
	const ageTerm = lnAge ? ` ${signedTerm(lnAge, decimals)} × ln(${age})` : ""
	const effect = model.categoryEffects?.[row?.features.category ?? "other"] ?? 0
	const category = model.categoryEffects ? (row ? ` ${signedTerm(effect, decimals)}` : " + category effect") : ""
	return `${intercept.toFixed(decimals)} ${signedTerm(lnTvl, decimals)} × ln(${tvl}${model.momentum ? ` × ${growth}` : ""})${ageTerm}${category}`
}
function protocolView(row, {age, model, lnValue, back, usd, farm, diagnostics, families, maxOddsAge}, {nearestComparables, protocolClock, protocolFacts}) {
	const {protocol, plan, oddsAge, oddsAt, launchProbability12: p12} = row
	const {airdropYieldApr, breakEvenDepositUsd, deposits} = row.economics
	const implied = usd(row.implied_value_usd)
	const interval = boardInterval(diagnostics)?.map(usd).join("–") ?? "—"
	const influence = diagnostics?.influence
	const comparable = influence && families.get(influence.slug)?.representative.name
	const influenceLine =
		influence?.rank_delta === 0 ? "No single comparable moves this rank" : influence && comparable ? `Without ${escapeHtml(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}` : ""
	const steps = table(
		["Action", "Est. fee", "Min", "When"],
		plan.steps.map(step => [escapeHtml(step.action), usd(step.costUsd), formatInteger(step.minutes), step.cadence]),
		{total: ["Total", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "—"]}
	)
	return `<a class="back" href="${escapeHtml(back)}">← Back to board</a>
    <header class="protocol-heading"><div><h2>${escapeHtml(protocol.name)}</h2>
    <div class="chips">${[protocol.category ?? "Unlisted category", ...protocol.chains].map(label => chip(label)).join("")}</div>
    </div>${chip(`Board rank ${row.rank}`, "badge")}</header>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel"><h3>Implied value</h3>
          <p class="figure">${implied}</p>
          <p>P10–P90 · ${interval}</p>
          ${decomposition(row, usd)}
          <p class="value-equation">ln V ≈ ${valueFormula(model, row)} ≈ ${lnValue.toFixed(3)} → ${usd(row.launch_value_usd)} × P₁₂(${oddsAge.toFixed(0)} d) ${formatOdds(p12)} → ${implied}</p>
          ${influenceLine ? `<p class="caption">${influenceLine}</p>` : ""}
        </section>
        ${protocolFacts?.(row, age, usd, viewTools) ?? ""}
        ${protocolClock?.(maxOddsAge, oddsAge, p12, age === null, oddsAt, viewTools) ?? ""}
      </div><div class="detail-facts">
        <section class="panel farm"><h3>Farm plan</h3>
          <p class="plan-meta"><strong>${escapeHtml(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} plan · ${plan.holdWeeks.toFixed(1)} weeks expected</p>
          ${table(
						["Deposit", "Net", "Net per hour", "Verdict"],
						deposits.map(({depositUsd, netUsd, netPerHourUsd, verdict}) => [usd(depositUsd), usd(netUsd), usd(netPerHourUsd), verdict]),
						{className: "deposit-grid"}
					)}
          <p class="caption">${usd(farm.hourlyRateUsd)}/h for labor · ${farm.farmerHaircut * 100}% farmer haircut</p>
          <p>Expected airdrop yield ${(airdropYieldApr * 100).toFixed(2)}% APR · Capital cost ${(plan.capitalApr * 100).toFixed(2)}% APR</p>
          <p>Break-even deposit · ${breakEvenDepositUsd === "never" ? "never" : usd(breakEvenDepositUsd)}</p>
          <p class="caption">${escapeHtml(plan.steps.at(-1)?.exitCondition ?? "")}</p>
          ${steps}
          <p class="caption">Minutes and fees per occurrence. Assumptions ${plan.assumptionsAsOf}${plan.flags.length ? " · fallback fees" : ""}.</p>
        </section>
        ${nearestComparables?.(diagnostics?.twins ?? [], families, usd, viewTools) ?? ""}
      </div>
    </div>`
}

function boot(start2) {
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
		start2(root, input, data, Radar, fail)
	} catch {
		fail()
	}
}

function mountBoard(main, rows, summary, {formatUsd: usd, compareText, boardControls, view, boardHash}) {
	main.innerHTML = summary + element("#board-filters").innerHTML + boardTable()
	const sync = view && boardControls?.(main, view, rows)
	const results = element("#results", main)
	const body = element("tbody", main)
	const maxLogValue = Math.log1p(Math.max(1, ...rows.map(({value, interval}) => Math.max(value, interval?.[1] ?? 0))))
	return state => {
		sync?.(state)
		const selected = selectRows(rows, state, compareText)
		results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`
		body.innerHTML = boardRows(selected, boardHash?.(state) ?? "#/", maxLogValue, usd)
	}
}
function start(main, snapshot, data, api, fail) {
	const {buildRadar, daysBetween, farmAssumptions, formatUsd} = api
	api.view = {...viewTools, element}
	const {meta} = data
	const radar = buildRadar(snapshot, data.model.fit, data.odds.terms, meta)
	const {model, odds, houseRule} = radar
	const {
		census,
		board: {rows: published}
	} = data
	const {families, diagnostics, protocols, mismatches, rows} = prepareBoard(radar, published, snapshot.watchlist, api.boardFarmSteps)
	const scatter = scatterCoverage(data.looScatter ?? [], families)
	const checks = integrityChecks(mismatches, published, snapshot.watchlist, {
		fitted: model.n,
		houseRule,
		intervalCounts: scatter.counts,
		invalidPoints: scatter.invalidPoints,
		coverageUnavailable: data.looScatter === null && model.n < api.MIN_BAND_FAMILIES,
		loo: data.model.validation.leaveOneFamilyOut
	})
	if (checks[0] && !api.boardFarmSteps) checks[0].label += " · step text unchecked"
	element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`
	const counts = [snapshot.protocols.length, model.n, rows.length, odds.n]
	document.querySelectorAll("#summary dd, #clock-count").forEach((count, i) => {
		count.textContent = formatInteger(counts[i] ?? null)
	})
	element("#formula").textContent = `ln V = ${valueFormula(model)}`
	element("#checks").innerHTML = integrityStrip(checks)
	let updateBoard
	let updatePlan
	let lastPage
	function draw() {
		try {
			const route = parseRoute(location.hash)
			const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page
			const changedPage = lastPage && lastPage !== page
			lastPage = page
			if (changedPage) {
				updateBoard = void 0
				updatePlan = void 0
			}
			if (route.page === "board") {
				updateBoard ??= mountBoard(main, rows, censusSummary(census, protocols), api)
				updateBoard(route.state)
			} else if (route.page === "plan") {
				updatePlan ??= api.mountPlanner?.(main, radar.board, meta, api)
				if (updatePlan) updatePlan(location.hash)
				else main.innerHTML = element("#plan-unavailable").innerHTML
			} else if (route.page === "census") {
				main.innerHTML = censusView(census, route.state, formatUsd, api.compareText, protocols)
			} else if (route.page === "method") {
				main.innerHTML = methodView(
					{
						model: {...data.model, ...model},
						odds: {...data.odds, ...odds},
						scatter
					},
					panel => api.methodNotes?.(houseRule, farmAssumptions, formatUsd, formatOdds, panel) ?? "",
					api.termTrials
				)
			} else {
				const back = api.boardHash?.(route.state) ?? "#/"
				const detail = route.page === "protocol" ? protocols.get(route.slug) : void 0
				const listed = detail?.protocol.listed_at
				main.innerHTML = detail
					? protocolView(
							detail,
							{
								age: listed ? daysBetween(listed, snapshot.as_of) : null,
								model,
								lnValue: api.logValue(detail.features, model),
								back,
								usd: formatUsd,
								farm: farmAssumptions,
								diagnostics: diagnostics.get(detail.protocol.slug),
								families,
								maxOddsAge: odds.maxAgeDays
							},
							api
						)
					: `<h2>Page unavailable</h2><a href="${escapeHtml(back)}">Back to board</a>`
			}
			if (changedPage) {
				window.scrollTo(0, 0)
				main.focus({preventScroll: true})
			}
			main.dataset.ready = ""
		} catch {
			lastPage = "error"
			fail()
		}
	}
	draw()
	window.addEventListener("hashchange", draw)
	api.bindControls?.(main, draw, {isCensusSortKey, isSortKey, parseRoute})
}
boot(start)
})();
