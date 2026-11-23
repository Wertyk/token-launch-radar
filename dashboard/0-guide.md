# Token Launch Radar

1. **Working radar** — The board opens in published rank order. `buildRadar` classifies the snapshot, fits the value model, and ranks protocols recording no token plus the house watchlist. `countBoardMismatches` checks slugs, ranks, values, and farm steps against board.json.
2. **Value model** — `header` shows the fitted coefficients. `fitValueModel` uses traded comparables, one per identified token family. `predictValue` applies the fitted TVL elasticity to 7-day growth. The protocol card’s `decomposition` shows how TVL, growth, and age move the base to the conditional launch value.
3. **Farm plan** — `makeFarmPlan` chooses a chain and estimates fees and minutes by action. `protocolView` shows the deposit, step assumptions, and totals.
4. **Page** — `selectRows` applies all filters and sorts each column. `boardHash` and `protocolHash` preserve the same view across navigation.
5. **Design** — `boardView` groups category and chain chips with each protocol and puts log-scale value bars alongside the dollar amounts. The card pairs the protocol record and value with the farm plan.
6. **Portfolio** — Open Farm planner to set cash, a weekly hours cap, and chains. `planPortfolio` compares net airdrop EV per dollar of cash, checks scheduled minutes week by week, shares optional funding fees and time by chain, and explains skipped positions.
