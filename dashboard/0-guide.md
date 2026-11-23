# Token Launch Radar

- **1-board, working radar.** `buildRadar` recomputes 198 board rows from the bundled snapshot. `integrityChecks` checks ranks, values and farm steps against board.json.
- **3-method and 4-census, value and classification.** `buildCensus` separates traded tokens from protocols recording no token. `fitValueModel` fits 128 traded token families. `rankBoard` uses each protocol’s TVL, 7-day TVL growth and days since listing to estimate value at launch if its record stays as it is.
- **2-detail, farm economics.** `makeFarmPlan` gives actions, fees, minutes and cadence. `estimateFarmEconomics` prices labour and capital and uses separate launch odds to derive verdicts. `planPortfolio` applies cash, time and chain limits in the planner.
- **1-board, 2-detail and 4-census, browsing.** `boardView` and `selectRows` support sorting and filtering. `protocolView` shows the value breakdown, P10–P90 range and comparables. `censusView` shows classification reasons in TVL order.
- **1-board, design.** `boardRows` draws dark value bars and lighter interval bands on the same log scale. The shared styles use a teal palette, tabular numbers and 4/8 spacing.

Leave-one-family-out (LOO) median error was ×3.46 vs ×5.07 for a flat TVL multiple. The held-out P10–P90 covered 104/128 families. The house rule recovered 40/40 watchlist entries, with 20 extra matches marked parentProtocol.

Category was tested and rejected.

Most rows are SKIP at $1K because labour dominates.
