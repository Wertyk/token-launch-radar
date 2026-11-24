# Token Launch Radar

- **Criterion 1 (1-board).** `buildRadar` rebuilds all 198 rows from the snapshot in the page. `integrityChecks` confirms values, ranks, plans and economics equal board.json. Watchlist 40/40.
- **Criterion 2 (2-detail, 4-method).** ln V ≈ 6.5363 + 0.5515 × ln(TVL × (1 + g₇)) − 0.0102 × ln(age). `fitValueModel` fits 128 traded token families. Every card shows its equation. Leaving one family out, median error is ×3.46 vs ×5.07 for a flat TVL multiple. P10–P90 covers 104/128.
- **Separation (3-filtered).** `buildCensus` assigns one status per protocol (758 = 198 + 128 + 288 + 144). WBTC, Binance staked ETH, Coinbase Bridge and USDT0 are excluded as bridged, wrapped or staked products of traded tokens and are never ranked.
- **Tokenless age.** Fitted value weight −0.010. Held out, age adds nothing (×3.35 without it). `launchProbability12` uses age in the fitted launch clock to supply 12-month odds for farm economics.
- **Criterion 3 (2-detail).** `makeFarmPlan` prices each step (fees, minutes, cadence) on the cheapest chain. `estimateFarmEconomics` gives FARM/THIN/SKIP at $1K and $10K and the break-even deposit. At $1K every row is SKIP. Labour is the largest cost for 175 rows, and 178 stay SKIP at $0/h.
- **Criteria 4–5.** `selectRows` and `selectCensus` sort on every column and filter rows. Each ranked protocol has a card. `planPortfolio` allocates budget. Design tokens are in `1-tokens.css`.
