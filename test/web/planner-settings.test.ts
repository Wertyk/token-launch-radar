import { expect, test } from "vitest";
import { toBoardRows } from "../../src/application/board-rows.ts";
import * as api from "../../src/application/browser-api.ts";
import { buildRadar } from "../../src/application/build-radar.ts";
import { farmTables } from "../../src/domain/farming/playbook-data.ts";
import { planPortfolio } from "../../src/domain/farming/portfolio.ts";
import { parseSnapshot } from "../../src/domain/snapshot.ts";
import { parsePlanState, planHash } from "../../src/presentation/web/plan-state.ts";
import { plannerSettings } from "../../src/presentation/web/plan-view.ts";
import { readKitSnapshot } from "../radar-fixtures.ts";

test("recomputes verdicts and the portfolio through the core, then resets to published defaults", () => {
  const snapshot = parseSnapshot(readKitSnapshot());
  const tables = farmTables();
  const published = buildRadar(snapshot, tables);
  const board = toBoardRows(published);
  const radar = api.buildRadar(snapshot, published.model.fit, published.odds.terms, tables);

  function calculate(hash: string) {
    const state = parsePlanState(hash);
    const { budgetUsd, hoursPerWeek, sliders } = state;
    const assumptions = { ...plannerSettings(api.farmAssumptions, sliders), tables };
    return {
      state,
      plan: planPortfolio(radar.board, { budgetUsd, hoursPerWeek, assumptions }),
      economics: radar.board.map(({ plan, launch_value_usd, protocol, economics }) =>
        api.estimateFarmEconomics(
          plan,
          launch_value_usd,
          protocol.tvl_usd,
          economics.launchProbability12,
          assumptions,
        ),
      ),
    };
  }

  const changed = calculate(
    "#/plan?budget=12000&hours=3&share=100&haircut=100&rate=0&yield=0&carry=0",
  );
  const reset = calculate(planHash({ ...changed.state, sliders: {} }));
  expect(reset.state.sliders).toEqual({});
  expect(reset.economics).toEqual(
    board.rows.map(({ farm_economics, airdrop_yield_apr }) => ({
      ...farm_economics,
      airdropYieldApr: airdrop_yield_apr,
    })),
  );
  expect(
    changed.economics.map(({ deposits }) => deposits.map(({ verdict }) => verdict)),
  ).not.toEqual(reset.economics.map(({ deposits }) => deposits.map(({ verdict }) => verdict)));
  expect(changed.plan).not.toEqual(reset.plan);
  expect(reset.plan).toEqual(calculate("#/plan?budget=12000&hours=3").plan);
}, 90_000);
