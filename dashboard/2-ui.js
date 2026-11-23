(() => {
  // src/presentation/web/board.ts
  function compareText(a, b) {
    return a < b ? -1 : Number(a > b);
  }
  function compareRows(a, b, sort, direction) {
    if (sort === "name") return direction * compareText(a.name.toLowerCase(), b.name.toLowerCase());
    const first = a[sort];
    const second = b[sort];
    if (first === second) return 0;
    if (first === null) return 1;
    if (second === null) return -1;
    return direction * (Number(first) - Number(second));
  }
  function selectRows(rows, state) {
    const { sort, dir, cat, chain, wl } = state;
    const query = state.q.trim().toLowerCase();
    const direction = dir === "asc" ? 1 : -1;
    return rows.filter(
      (row) => (!cat || row.category === cat) && (!chain || row.chains.includes(chain)) && (!wl || row.watchlist) && (!query || row.name.toLowerCase().includes(query))
    ).sort((a, b) => compareRows(a, b, sort, direction) || compareText(a.slug, b.slug));
  }

  // src/presentation/web/format.ts
  function formatInteger(value) {
    return value === null ? "—" : value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function formatPercent(value) {
    if (value === null) return "—";
    const magnitude = Math.abs(value).toFixed(1);
    const sign = magnitude === "0.0" ? "" : value < 0 ? "−" : "+";
    return `${sign}${magnitude}%`;
  }
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // src/presentation/web/state.ts
  var columns = {
    rank: "Rank",
    name: "Protocol",
    value: "Implied value",
    tvl: "TVL",
    growth: "7d %",
    age: "Days with no token",
    cost: "Plan cost",
    time: "Plan time",
    watchlist: "Watchlist"
  };
  var defaultState = {
    sort: "rank",
    dir: "asc",
    cat: "",
    chain: "",
    wl: false,
    q: ""
  };
  function isSortKey(value) {
    return value !== void 0 && Object.hasOwn(columns, value);
  }
  function parseRoute(hash) {
    const [path, query] = hash.slice(1).split(/\?(.*)/s, 2);
    const params = new URLSearchParams(query);
    const sort = params.get("sort") ?? void 0;
    const state = {
      sort: isSortKey(sort) ? sort : defaultState.sort,
      dir: params.get("dir") === "desc" ? "desc" : "asc",
      cat: params.get("cat") ?? "",
      chain: params.get("chain") ?? "",
      wl: params.get("wl") === "1",
      q: params.get("q") ?? ""
    };
    if (!path || path === "/") return { page: "board", state };
    const segment = /^\/p\/([^/]+)$/.exec(path)?.[1];
    if (segment) {
      try {
        return { page: "protocol", slug: decodeURIComponent(segment), state };
      } catch {
        return { page: "unknown", state };
      }
    }
    return { page: "unknown", state };
  }
  function boardHash(state) {
    const params = new URLSearchParams();
    if (state.sort !== defaultState.sort || state.dir !== defaultState.dir) {
      params.set("sort", state.sort);
      params.set("dir", state.dir);
    }
    if (state.cat) params.set("cat", state.cat);
    if (state.chain) params.set("chain", state.chain);
    if (state.wl) params.set("wl", "1");
    if (state.q) params.set("q", state.q);
    const query = params.toString();
    return query ? `#/?${query}` : "#/";
  }
  function protocolHash(slug, state) {
    return `#/p/${encodeURIComponent(slug)}${boardHash(state).slice(2)}`;
  }

  // src/presentation/web/board-view.ts
  function options(values) {
    return [...new Set(values)].sort().map((value) => {
      const label = escapeHtml(value);
      return `<option value="${label}">${label}</option>`;
    }).join("");
  }
  function boardView(rows) {
    const categories = rows.flatMap(({ category }) => category === null ? [] : [category]);
    return `
    <form class="filters" aria-label="Board filters">
      <div class="field">
        <label for="protocol-search">Search protocol</label>
        <input id="protocol-search" type="search" name="q" placeholder="Protocol name" autocomplete="off">
      </div>
      <div class="field">
        <label for="category-filter">Category</label>
        <select id="category-filter" name="cat"><option value="">All categories</option>${options(categories)}</select>
      </div>
      <div class="field">
        <label for="chain-filter">Chain</label>
        <select id="chain-filter" name="chain"><option value="">All chains</option>${options(rows.flatMap(({ chains }) => chains))}</select>
      </div>
      <label class="toggle"><input type="checkbox" name="wl"> Watchlist only</label>
      <output id="results" aria-live="polite"></output>
    </form>
    <section class="table-window" aria-label="Protocol rankings" tabindex="0">
      <table class="ranking" aria-label="Ranked protocols">
        <thead><tr>${Object.entries(columns).map(
      ([key, label]) => `<th scope="col" class="col-${key}"><button type="button" data-sort="${key}">${label}<span class="sort-arrow" aria-hidden="true"></span></button></th>`
    ).join("")}</tr></thead>
        <tbody></tbody>
      </table>
    </section>`;
  }
  function chip(label) {
    return `<span class="chip">${escapeHtml(label)}</span>`;
  }
  function growthText(growth) {
    const text = formatPercent(growth);
    const trend = text.startsWith("+") ? "gain" : text.startsWith("−") ? "loss" : "";
    return `<span class="${trend}">${text}</span>`;
  }
  function boardRows(rows, state, maxLogValue, usd) {
    if (!rows.length) {
      return `<tr><td colspan="${Object.keys(columns).length}" class="empty">No protocols match these filters.</td></tr>`;
    }
    return rows.map((row) => {
      const href = escapeHtml(protocolHash(row.slug, state));
      const remaining = row.chains.length - 2;
      const logShare = Math.log1p(row.value) / maxLogValue * 100;
      return `
        <tr data-protocol>
          <td class="rank">${formatInteger(row.rank)}</td>
          <td><a class="protocol-name" href="${href}">${escapeHtml(row.name)}</a>
            <div class="chips" title="${escapeHtml(row.chains.join(", "))}">
              ${chip(row.category ?? "Unlisted category")}
              ${row.chains.slice(0, 2).map(chip).join("")}
              ${remaining > 0 ? chip(`+${remaining}`) : ""}
            </div>
          </td>
          <td class="value"><strong>${usd(row.value)}</strong>
            <div class="value-track" aria-hidden="true"><span style="width:${logShare.toFixed(2)}%"></span></div>
          </td>
          <td>${usd(row.tvl)}</td>
          <td>${growthText(row.growth)}</td>
          <td>${formatInteger(row.age)}</td>
          <td>${usd(row.cost)}</td>
          <td>${formatInteger(row.time)} min</td>
          <td>${row.watchlist ? '<span class="badge">Watchlist</span>' : '<span class="muted">—</span>'}</td>
        </tr>`;
    }).join("");
  }

  // src/presentation/web/protocol-view.ts
  var statusLabels = {
    traded: "Token trades",
    "token-unpriced": "Records an unpriced token",
    "pre-token": "Records no token",
    excluded: "Excluded by the house rule"
  };
  var reasonLabels = {
    "pre-token": "Meets the pre-token rule",
    watchlist: "On the house watchlist"
  };
  var flagLabels = {
    "growth-missing": "7-day TVL change is missing. The model uses zero growth.",
    "age-missing": "Listing date is missing. The model uses the comparable median age.",
    "outside-comps-range": "TVL or age falls outside the range of the traded comparables."
  };
  function decomposition(row, usd) {
    const { base, multipliers } = row.decomposition;
    const afterTvl = base * multipliers.lnTvl;
    const afterGrowth = afterTvl * multipliers.growth;
    const stages = [
      { label: "Base", value: base },
      { label: "TVL", factor: multipliers.lnTvl, value: afterTvl },
      { label: "7d growth", factor: multipliers.growth, value: afterGrowth },
      { label: "Age", factor: multipliers.lnAge, value: row.valueUsd },
      { label: "Board value", value: row.implied_value_usd }
    ];
    const largest = Math.max(1, ...stages.map(({ value }) => Number.isFinite(value) ? value : 0));
    return `<ol class="waterfall">${stages.map(({ label, factor, value }) => {
      const finite = Number.isFinite(value);
      const width = finite ? (value / largest * 100).toFixed(2) : "0";
      return `<li>
        <span>${label}</span>
        <span>${factor === void 0 ? "" : `×${factor.toPrecision(4)}`}</span>
        <svg viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
          <rect width="${width}" height="6"></rect>
        </svg>
        <strong>${finite ? usd(Math.round(value)) : "—"}</strong>
      </li>`;
    }).join("")}</ol>`;
  }
  function protocolView(row, age, back, usd) {
    const { protocol, plan, status } = row;
    const isTokenRecorded = status === "traded" || status === "token-unpriced";
    const facts = [
      ["TVL", usd(protocol.tvl_usd)],
      ["7d TVL change", growthText(protocol.change_7d)],
      ["Listed", escapeHtml(protocol.listed_at ?? "Unlisted")],
      [isTokenRecorded ? "Days since listing" : "Days with no token", formatInteger(age)]
    ];
    return `
    <a class="back" href="${escapeHtml(back)}">← Back to board</a>
    <div class="protocol-heading">
      <div>
        <h2 tabindex="-1">${escapeHtml(protocol.name)}</h2>
        <div class="chips">
          ${chip(protocol.category ?? "Unlisted category")}
          ${protocol.chains.map(chip).join("")}
        </div>
      </div>
      <span class="badge">Board rank ${formatInteger(row.rank)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-facts">
        <section class="panel">
          <h3>Protocol record</h3>
          <dl class="facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
          <p><strong>${statusLabels[status]}</strong>${status === "pre-token" ? "" : ` · ${escapeHtml(row.reason)}`}</p>
          <p class="muted">Board inclusion · ${row.boardReasons.map((reason) => reasonLabels[reason]).join(" · ")}</p>
          ${row.flags.length ? `<ul class="flags">${row.flags.map((flag) => `<li>${flagLabels[flag]}</li>`).join("")}</ul>` : ""}
        </section>
        <section class="panel valuation">
          <h3>Conditional value at launch</h3>
          <p class="figure">${usd(row.implied_value_usd)}</p>
          <p class="muted">If the protocol’s record stays as it is.</p>
          ${decomposition(row, usd)}
          <p class="caption">Bars show cumulative dollar values. The board rounds to whole dollars and bounds values from $1 to $100T.</p>
        </section>
      </div>
      <section class="panel farm">
        <h3>Farm plan</h3>
        <p class="plan-meta"><strong>${escapeHtml(plan.chain ?? "Chain unlisted")}</strong> · ${usd(plan.depositUsd)} planned deposit</p>
        <table>
          <thead><tr><th scope="col">Action</th><th scope="col">Est. fee</th><th scope="col">Minutes</th></tr></thead>
          <tbody>${plan.steps.map(
      (step) => `<tr><td>${escapeHtml(step.action)}${step.note ? `<small>${escapeHtml(step.note)}</small>` : ""}</td><td>${usd(step.costUsd)}</td><td>${formatInteger(step.minutes)}</td></tr>`
    ).join("")}</tbody>
          <tfoot><tr><th scope="row">Total planned</th><td>${usd(plan.totalCostUsd)}</td><td>${formatInteger(plan.totalMinutes)}</td></tr></tfoot>
        </table>
        <p class="caption">Minutes measure active work. Fees include the bridge allowance.</p>
      </section>
    </div>`;
  }

  // src/presentation/web/recompute.ts
  function countBoardMismatches(computed, published) {
    let count = Math.abs(computed.length - published.length);
    for (const [index, row] of computed.entries()) {
      const other = published[index];
      if (other && (row.slug !== other.slug || row.rank !== other.rank || row.implied_value_usd !== other.implied_value_usd || row.farm_steps.length !== other.farm_steps.length || row.farm_steps.some((step, i) => step !== other.farm_steps[i]))) {
        count++;
      }
    }
    return count;
  }

  // src/presentation/web/main.ts
  function element(selector, root = document) {
    const found = root.querySelector(selector);
    if (!found) throw new Error(`Missing dashboard element ${selector}`);
    return found;
  }
  function signedTerm(value) {
    return `${value < 0 ? "−" : "+"} ${Math.abs(value).toFixed(3)}`;
  }
  function header(counts, coefficients, rows, mismatches) {
    const { intercept, lnTvl, lnAge } = coefficients;
    const check = mismatches ? `Page recompute differs from board.json · ${formatInteger(mismatches)} mismatched ${mismatches === 1 ? "row" : "rows"}` : `Page recompute = board.json ✓ (${formatInteger(rows)} rows)`;
    return `
    <dl class="kpis">${counts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    <section class="model" aria-label="Value model">
      <div>
        <p class="equation">ln V = ${intercept.toFixed(3)} ${signedTerm(lnTvl)}·ln(TVL·(1+g₇)) ${signedTerm(lnAge)}·ln(age)</p>
        <p class="caption">Fitted on traded comparables. Age is days since listing, minimum 1. g₇ is 7-day TVL growth clipped to −50%…+100%.</p>
      </div>
      <span class="check ${mismatches ? "check-failed" : ""}">${check}</span>
    </section>`;
  }
  function mountBoard(main2, rows, maxLogValue, usd) {
    main2.innerHTML = boardView(rows);
    const search = element('[name="q"]', main2);
    const category = element('[name="cat"]', main2);
    const chain = element('[name="chain"]', main2);
    const watchlist = element('[name="wl"]', main2);
    const results = element("#results", main2);
    const body = element("tbody", main2);
    const heads = main2.querySelectorAll("th");
    function setSelect(select, value) {
      select.querySelector("[data-unlisted]")?.remove();
      select.value = value;
      if (select.selectedIndex < 0) {
        const option = new Option(value, value, false, true);
        option.dataset.unlisted = "";
        select.add(option);
      }
    }
    return (state) => {
      if (search.value !== state.q) search.value = state.q;
      setSelect(category, state.cat);
      setSelect(chain, state.chain);
      watchlist.checked = state.wl;
      for (const th of heads) {
        if (th.querySelector("button")?.dataset.sort === state.sort) {
          th.setAttribute("aria-sort", state.dir === "asc" ? "ascending" : "descending");
        } else {
          th.removeAttribute("aria-sort");
        }
      }
      const selected = selectRows(rows, state);
      results.textContent = `${formatInteger(selected.length)} of ${formatInteger(rows.length)} protocols`;
      body.innerHTML = boardRows(selected, state, maxLogValue, usd);
    };
  }
  function start(main2, data, api) {
    const { buildRadar, daysBetween, formatUsd, parseSnapshot, toBoard } = api;
    const snapshot = parseSnapshot({
      ...data.meta,
      protocols: data.protocols,
      watchlist: data.watchlist
    });
    const radar = buildRadar(snapshot, data.model.lambda);
    const published = data.board.rows;
    const computed = toBoard(radar).rows;
    const mismatches = countBoardMismatches(computed, published);
    const watchlisted = new Set(snapshot.watchlist);
    const protocols = new Map(radar.board.map((row) => [row.protocol.slug, row]));
    const ages = new Map(
      radar.board.map(({ protocol: { slug, listed_at } }) => [
        slug,
        listed_at === null ? null : daysBetween(listed_at, snapshot.as_of)
      ])
    );
    const rows = radar.board.map(
      ({ protocol, rank, status, implied_value_usd, plan }) => ({
        slug: protocol.slug,
        name: protocol.name,
        rank,
        value: implied_value_usd,
        tvl: protocol.tvl_usd,
        growth: protocol.change_7d,
        age: status === "traded" || status === "token-unpriced" ? null : ages.get(protocol.slug) ?? null,
        cost: plan.totalCostUsd,
        time: plan.totalMinutes,
        watchlist: watchlisted.has(protocol.slug),
        category: protocol.category,
        chains: protocol.chains
      })
    );
    const maxLogValue = Math.log1p(rows.reduce((max, row) => Math.max(max, row.value), 1));
    element("#snapshot-date").textContent = `Snapshot · ${snapshot.as_of}`;
    element("#summary").innerHTML = header(
      [
        ["Protocols scanned", formatInteger(radar.census.length)],
        ["Traded comparables", formatInteger(radar.model.n)],
        ["Board rows", formatInteger(rows.length)],
        [
          "Watchlist covered",
          `${formatInteger(rows.filter((row) => row.watchlist).length)} / ${formatInteger(watchlisted.size)}`
        ]
      ],
      radar.model.coefficients,
      computed.length,
      mismatches
    );
    let updateBoard;
    let lastPage;
    function draw() {
      delete main2.dataset.ready;
      const route = parseRoute(location.hash);
      const page = route.page === "protocol" ? `protocol/${route.slug}` : route.page;
      const changedPage = lastPage !== void 0 && lastPage !== page;
      lastPage = page;
      if (route.page === "board") {
        updateBoard ??= mountBoard(main2, rows, maxLogValue, formatUsd);
        updateBoard(route.state);
      } else {
        updateBoard = void 0;
        const back = boardHash(route.state);
        const detail = route.page === "protocol" ? protocols.get(route.slug) : void 0;
        main2.innerHTML = detail ? protocolView(detail, ages.get(detail.protocol.slug) ?? null, back, formatUsd) : `<section class="panel message"><h2 tabindex="-1">Page unavailable</h2>
          <p>${route.page === "protocol" ? "This protocol is outside the ranked board." : "This address doesn’t match a dashboard page."}</p>
          <a href="${escapeHtml(back)}">Back to board</a></section>`;
      }
      if (changedPage) {
        window.scrollTo(0, 0);
        main2.querySelector('h2[tabindex="-1"]')?.focus({ preventScroll: true });
      }
      main2.dataset.ready = "";
    }
    function sortBy(sort) {
      const { state } = parseRoute(location.hash);
      const dir = state.sort === sort && state.dir === "asc" ? "desc" : "asc";
      location.hash = boardHash({ ...state, sort, dir });
    }
    main2.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const sort = event.target.closest("button[data-sort]")?.dataset.sort;
      if (isSortKey(sort)) {
        sortBy(sort);
      } else if (!event.target.closest("a") && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        const link = event.target.closest("tr[data-protocol]")?.querySelector("a");
        if (link) location.hash = link.hash;
      }
    });
    main2.addEventListener("submit", (event) => event.preventDefault());
    main2.addEventListener("input", (event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.name !== "q") return;
      const { state } = parseRoute(location.hash);
      history.replaceState(null, "", boardHash({ ...state, q: event.target.value }));
      draw();
    });
    main2.addEventListener("change", (event) => {
      const target = event.target;
      const { state } = parseRoute(location.hash);
      if (target instanceof HTMLSelectElement && (target.name === "cat" || target.name === "chain")) {
        location.hash = boardHash({ ...state, [target.name]: target.value });
      } else if (target instanceof HTMLInputElement && target.name === "wl") {
        location.hash = boardHash({ ...state, wl: target.checked });
      }
    });
    window.addEventListener("hashchange", draw);
    draw();
  }
  var main = element("main");
  if (window.RADAR_DATA) {
    start(main, window.RADAR_DATA, window.Radar);
  } else {
    main.innerHTML = `<section class="panel message"><h2>Snapshot data unavailable</h2>
    <p><code>main.ts</code> writes <code>../data.js</code>. Run <code>pnpm radar</code> and open <code>out/dashboard/index.html</code>.</p></section>`;
  }
})();
