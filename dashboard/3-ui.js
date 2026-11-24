(() => {
function compareRows(a, b, sort, direction, compareText) {
	if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase())
	const first = a[sort]
	const second = b[sort]
	if (first === second) return 0
	if (first === null) return 1
	if (second === null) return -1
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

function clockSampleSize(points) {
	return points.reduce((total, {count}) => total + count, 0)
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

function element(selector, root = document) {
	const found = root.querySelector(selector)
	if (!found) throw new Error(`Missing dashboard element ${selector}`)
	return found
}

function integrityChecks(mismatches, published, watchlist, {fitted, houseRule, intervalCounts, invalidPoints, loo}) {
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
		{
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
	return `<ul class="integrity">${checks.map(({pass, label}) => `<li class="${pass ? "check" : "check-failed"}">${pass ? "✓" : "✗"} ${escapeHtml(label)}</li>`).join("")}</ul>`
}
function multiplier(value) {
	return value === null ? "—" : `×${value.toFixed(2)}`
}

function scatterCoverage(points) {
	const counts = {missLow: 0, covered: 0, missHigh: 0}
	const seen = new Set()
	const classified = points.flatMap(point => {
		if (!point) return []
		const {slug, actual, predicted, p10, p90} = point
		if (p10 === null || p90 === null || ![p10, p90, actual, predicted].every(Number.isFinite) || p10 > p90 || seen.has(slug)) return []
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
		return `${heading}<p class="caption">Too few traded families for held-out bands.</p></section>`
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

function methodView({model, houseRule, scatter, launchClock}, farm) {
	const {
		coefficients: {intercept, lnTvl, lnAge},
		validation,
		ablation
	} = model
	const score = ({medianMultiplier, spearman}) => [multiplier(medianMultiplier), spearman?.toFixed(3) ?? "—"]
	const section = (title, headers, rows, note) => `<section class="panel"><h2>${title}</h2>${table(headers, rows)}${note ? `<p class="caption">${note}</p>` : ""}</section>`
	const {points} = launchClock
	const cards = [
		'<div class="method-value">',
		section(
			"Launch value model",
			["Term in ln V", "Coefficient"],
			[
				["Intercept", intercept.toFixed(6)],
				["ln(TVL·(1+g₇))", lnTvl.toFixed(6)],
				["ln(age)", lnAge.toFixed(6)],
				["Ridge penalty λ", String(model.lambda)]
			],
			`Huber ridge on ${model.n} traded families.`
		),
		section(
			"Out-of-sample validation",
			["Scheme", "Model", "Flat", "Category"],
			[
				["Leave one family out", validation.leaveOneFamilyOut],
				["Seeded five-fold", validation.seededFiveFold],
				["Walk-forward", validation.walkForward]
			].map(([label, {model: fitted, flatMultiple, categoryMultiple}]) => [label, ...[fitted, flatMultiple, categoryMultiple].map(s => score(s).join(" · "))]),
			"Current traded-family market caps proxy for launch value. Median error ×k and Spearman ρ."
		),
		"</div><div>",
		section(
			"Launch clock F(t)",
			["Mean listing age (days)", "Fitted token share (PAVA)", "Count"],
			points.map(({ageDays, share, count}) => [ageDays.toFixed(0), formatOdds(share), String(count)]),
			`${formatInteger(clockSampleSize(points))} protocols · P₁₂(t) = [F(t+365) − F(t)] / [1 − F(t)]<br>Flat windows and the tail use the last rising segment’s constant conditional hazard, or the pooled annual rate for a flat fit. The snapshot cannot validate future launch odds.`
		),
		section(
			"House watchlist rule",
			["TP", "FP", "FN"],
			[["truePositives", "falsePositives", "falseNegatives"].map(key => String(houseRule[key].length))],
			"DefiLlama marks extra matches with parentProtocol, absent from the snapshot."
		),
		"</div><div>",
		section(
			"Leave-one-family-out ablation",
			["Variant", "Median error", "Spearman ρ"],
			[
				["Full", ablation.full],
				["−TVL", ablation.withoutTvl],
				["−Age", ablation.withoutAge],
				["−Momentum", ablation.withoutMomentum],
				["+Category", ablation.withCategory],
				["OLS", ablation.ols]
			].map(([label, metrics]) => [label, ...score(metrics)])
		),
		launchValueScatter(scatter, validation.leaveOneFamilyOut),
		farm ? section(farm.title, ["Input", "Default"], farm.rows) : "",
		"</div>"
	]
	return `<div class="method compact">${cards.join("")}</div>`
}

function matchesFields(expected, actual) {
	if (!expected || typeof expected !== "object") return expected === actual
	if (!actual || typeof actual !== "object") return false
	if (Array.isArray(expected) && (!Array.isArray(actual) || expected.length !== actual.length)) {
		return false
	}
	return Object.entries(expected).every(([key, value]) => matchesFields(value, actual[key]))
}
function boardInterval(row) {
	if (!row) return null
	const {interval_p10_usd: low, interval_p90_usd: high} = row
	return Number.isFinite(low) && Number.isFinite(high) && low <= high ? [low, high] : null
}
function boardMismatches(computed, published) {
	const slugs = published.slice(computed.length).map(row => (typeof row?.slug === "string" ? row.slug : "(missing slug)"))
	for (const [index, row] of computed.entries()) {
		const {
			protocol: {slug},
			rank,
			launch_value_usd,
			implied_value_usd,
			plan,
			economics,
			farm_steps
		} = row
		const {airdropYieldApr: airdrop_yield_apr, ...farm_economics} = economics
		const expected = {
			slug,
			rank,
			launch_value_usd,
			implied_value_usd,
			farm_steps,
			airdrop_yield_apr,
			launch_p12: farm_economics.launchProbability12,
			plan_chain: plan.chain,
			plan_one_time_cost_usd: plan.oneTimeCostUsd,
			plan_recurring_cost_usd: plan.recurringCostUsd,
			plan_total_cost_usd: plan.totalCostUsd,
			plan_total_minutes: plan.totalMinutes,
			farm_economics
		}
		if (!boardInterval(published[index]) || !matchesFields(expected, published[index])) slugs.push(slug)
	}
	return slugs
}
function prepareBoard({board, families}, published, watchlist, age) {
	const evidence = new Map(published.flatMap(row => (row ? [[row.slug, row]] : [])))
	return {
		diagnostics: evidence,
		families: new Map(families.map(family => [family.representative.slug, family])),
		protocols: new Map(board.map(row => [row.protocol.slug, row])),
		mismatches: boardMismatches(board, published),
		rows: boardViewRows(board, evidence, watchlist, age)
	}
}
function boardViewRows(board, evidence, watchlist, age) {
	const watchlisted = new Set(watchlist)
	return board.map(({protocol, rank, status, implied_value_usd: value, launch_value_usd: launchValue, launchProbability12: odds, plan}) => {
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
			interval: boardInterval(diagnostics),
			age: status === "traded" || status === "token-unpriced" ? null : age(protocol),
			cost: plan.totalCostUsd,
			time: plan.totalMinutes,
			watchlist: watchlisted.has(slug)
		}
	})
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
function protocolView(row, {age, coefficients, lnValue, back, usd, farm, diagnostics, families, launchClock, launchProbability12}, {nearestComparables, protocolClock, protocolFacts}) {
	const {protocol, plan, economics} = row
	const {hourlyRateUsd, farmerHaircut} = farm
	const {airdropYieldApr, breakEvenDepositUsd} = economics
	const interval = boardInterval(diagnostics)?.map(usd).join("–") ?? "—"
	const influence = diagnostics?.influence
	const comparable = influence && families.get(influence.slug)?.representative.name
	const influenceLine =
		influence?.rank_delta === 0 ? "No single comparable moves this rank" : influence && comparable ? `Without ${escapeHtml(comparable)}, rank moves by ${Math.abs(influence.rank_delta)}` : ""
	const clockAge = Math.max(0, age ?? launchClock.medianAgeDays ?? 0)
	const steps = table(
		["Action", "Est. fee", "Min", "When"],
		plan.steps.map(step => [escapeHtml(step.action) + (step.exitCondition ? `<small>${escapeHtml(step.exitCondition)}</small>` : ""), usd(step.costUsd), formatInteger(step.minutes), step.cadence]),
		{total: ["Total", usd(plan.totalCostUsd), formatInteger(plan.totalMinutes), "—"]}
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
        ${
					protocolFacts
						? `<section class="panel"><h3>Protocol record</h3>
          ${protocolFacts(row, age, usd)}
        </section>`
						: ""
				}
        ${protocolClock?.(launchClock.points, clockAge, row.launchProbability12, age === null, launchProbability12) ?? ""}
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
        ${nearestComparables?.(diagnostics?.twins ?? [], families, usd) ?? ""}
      </div>
    </div>`
}

function boot(start2) {
	const root = document.querySelector("main")
	if (!root) return
	try {
		const {RADAR_DATA: publishedData, Radar: core} = window
		const input = publishedData && core.readPublishedSnapshot(publishedData)
		const validation = publishedData?.model?.validation
		if (
			!publishedData ||
			!input ||
			!Array.isArray(publishedData.board?.rows) ||
			!Array.isArray(publishedData.launchClock?.points) ||
			[validation?.leaveOneFamilyOut, validation?.seededFiveFold, validation?.walkForward].some(scheme => !scheme?.model || !scheme.flatMultiple || !scheme.categoryMultiple) ||
			!Array.isArray(publishedData.census) ||
			publishedData.census.length !== input.protocols.length
		)
			throw new Error("Incomplete snapshot")
		start2(root, input, publishedData, core)
	} catch {
		root.innerHTML = '<h2 role="alert">Snapshot data unavailable</h2><p>Generate it with <code>pnpm radar</code>.</p>'
	}
}

function mountBoard(main, rows, summary, {formatUsd: usd, compareText}) {
	main.innerHTML = summary + element("#board-filters").innerHTML + boardTable()
	const search = element('[name="q"]', main)
	const category = element('[name="cat"]', main)
	const chain = element('[name="chain"]', main)
	category.insertAdjacentHTML("beforeend", options(rows.flatMap(({category: category2}) => category2 ?? [])))
	chain.insertAdjacentHTML("beforeend", options(rows.flatMap(({chains}) => chains)))
	const watchlist = element('[name="wl"]', main)
	const results = element("#results", main)
	const body = element("tbody", main)
	const buttons = main.querySelectorAll("button[data-sort]")
	const maxLogValue = Math.log1p(Math.max(1, ...rows.flatMap(({value, interval}) => [value, interval?.[1] ?? 0])))
	return state => {
		if (search.value !== state.q) search.value = state.q
		setSelect(category, state.cat)
		setSelect(chain, state.chain)
		watchlist.checked = state.wl
		for (const button of buttons) {
			const th = button.parentElement
			if (th) th.ariaSort = button.dataset.sort !== state.sort ? null : state.dir === "asc" ? "ascending" : "descending"
		}
		const selected = selectRows(rows, state, compareText)
		results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`
		body.innerHTML = boardRows(selected, state, maxLogValue, usd)
	}
}
function start(main, snapshot, data, api) {
	const {buildRadar, daysBetween, farmAssumptions, formatUsd} = api
	const {launchClock, meta} = data
	const radar = buildRadar(snapshot, data.model.lambda, launchClock, meta)
	const {validation, ablation} = data.model
	const scatter = scatterCoverage(data.looScatter)
	const published = data.board.rows
	const age = ({listed_at}) => (listed_at === null ? null : daysBetween(listed_at, snapshot.as_of))
	const {families, diagnostics, protocols, mismatches, rows} = prepareBoard(radar, published, snapshot.watchlist, age)
	const checks = integrityChecks(mismatches, published, snapshot.watchlist, {
		fitted: radar.model.n,
		houseRule: radar.houseRule,
		intervalCounts: scatter.counts,
		invalidPoints: scatter.invalidPoints,
		loo: validation.leaveOneFamilyOut
	})
	element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`
	const counts = [snapshot.protocols.length, radar.model.n, rows.length, clockSampleSize(launchClock.points)]
	document.querySelectorAll("#summary dd, #clock-count").forEach((count, i) => {
		count.textContent = formatInteger(counts[i] ?? null)
	})
	const {intercept, lnTvl, lnAge} = radar.model.coefficients
	element("#formula").textContent = `ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)`
	element("#checks").innerHTML = integrityStrip(checks)
	let updateBoard
	let updatePlan
	let lastPage
	function draw() {
		delete main.dataset.ready
		const route = parseRoute(location.hash)
		const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page
		const changedPage = lastPage && lastPage !== page
		lastPage = page
		if (changedPage) {
			updateBoard = void 0
			updatePlan = void 0
		}
		if (route.page === "board") {
			updateBoard ??= mountBoard(main, rows, censusSummary(data.census, protocols), api)
			updateBoard(route.state)
		} else if (route.page === "plan") {
			if (api.mountPlanner) {
				updatePlan ??= api.mountPlanner(main, radar.board, meta, api)
				updatePlan(location.hash)
			} else {
				main.innerHTML = "<h2>Farm planner unavailable</h2>"
			}
		} else if (route.page === "census") {
			main.innerHTML = censusView(data.census, route.state, formatUsd, api.compareText, protocols)
		} else if (route.page === "method") {
			main.innerHTML = methodView(
				{
					model: {...radar.model, validation, ablation},
					launchClock,
					houseRule: radar.houseRule,
					scatter
				},
				api.methodFarmAssumptions?.(farmAssumptions, formatUsd)
			)
		} else {
			const back = boardHash(route.state)
			const detail = route.page === "protocol" ? protocols.get(route.slug) : void 0
			main.innerHTML = detail
				? protocolView(
						detail,
						{
							age: age(detail.protocol),
							coefficients: radar.model.coefficients,
							lnValue: api.logValue(detail.features, radar.model),
							back,
							usd: formatUsd,
							farm: farmAssumptions,
							diagnostics: diagnostics.get(detail.protocol.slug),
							families,
							launchClock,
							launchProbability12: api.launchProbability12
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
	}
	draw()
	window.addEventListener("hashchange", draw)
	api.bindControls?.(main, draw, {boardHash, censusHash, isCensusSortKey, isSortKey, parseRoute})
}
boot(start)
})();
