import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { expect, test } from "vitest";
import { defaultState, protocolHash } from "../../src/presentation/web/state.ts";
import { kitSnapshotPath } from "../radar-fixtures.ts";

const main = fileURLToPath(new URL("../../main.ts", import.meta.url));

test("runs every dashboard route offline and responds to sorting, filtering and sliders", async ({
  skip,
}) => {
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true, timeout: 10_000 });
  } catch (error) {
    skip(`Chrome could not launch. ${String(error).split("\n")[0]}`);
    return;
  }

  const out = mkdtempSync(join(tmpdir(), "radar-smoke-"));
  try {
    execFileSync(process.execPath, [main, "--input", kitSnapshotPath(), "--output", out], {
      encoding: "utf8",
      timeout: 10_000,
    });
    const url = pathToFileURL(join(out, "dashboard", "index.html"));
    const context = await browser.newContext({ serviceWorkers: "block" });
    const nonFileRequests: string[] = [];
    context.on("request", (request) => {
      if (!request.url().startsWith("file://")) nonFileRequests.push(request.url());
    });
    await context.route(/^(?!file:\/\/)/, (route) => route.abort());
    const page = await context.newPage();
    const errors: string[] = [];
    const webSockets: string[] = [];
    page.on("websocket", (socket) => webSockets.push(socket.url()));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    const ready = page.locator("main[data-ready]");
    const waitUntilReady = () => ready.waitFor({ state: "visible", timeout: 4_000 });
    const heading = async (name: string) => {
      await ready.getByRole("heading", { name, exact: true, level: 2 }).waitFor({ timeout: 4_000 });
    };
    const goTo = async (hash: string) => {
      url.hash = hash;
      await page.goto(url.href, { timeout: 4_000 });
      await waitUntilReady();
    };

    await goTo("#/?cat=Unknown&chain=Unknown");
    await page
      .locator(".integrity .check")
      .filter({ hasText: "Recompute = board.json · launch values, odds, implied values, ranks" })
      .waitFor({ timeout: 4_000 });
    expect(await page.locator(".integrity .check").count()).toBe(5);
    const definition = page.locator("#summary .model > .caption");
    await definition.waitFor({ state: "visible", timeout: 4_000 });
    expect((await definition.textContent())?.replace(/\s+/g, " ").trim()).toBe(
      "Launch value is the conditional market cap at launch. " +
        "Launch odds come from the clock fitted to the snapshot's token records by listing age. " +
        "Age is days since listing (min 1). g₇ is 7-day TVL growth clipped to −50%…+100%.",
    );
    await ready.getByRole("link", { name: "144 excluded", exact: true }).click();
    await heading("Protocol census");
    expect(await ready.locator(".census-summary").textContent()).toBe(
      "758 protocols = 198 pre-token (ranked) + 128 traded + 288 token, unpriced + 144 excluded",
    );
    expect(await ready.getByRole("combobox", { name: "Status" }).inputValue()).toBe("excluded");
    await goTo("#/?cat=Unknown&chain=Unknown");
    const category = ready.getByRole("combobox", { name: "Category" });
    const chain = ready.getByRole("combobox", { name: "Chain" });
    for (const select of [category, chain]) {
      expect(await select.inputValue()).toBe("Unknown");
      await select.selectOption("");
      await expect.poll(() => select.locator('option[value="Unknown"]').count()).toBe(0);
    }
    const rows = ready.locator("tr[data-protocol]");
    const originalCount = await rows.count();
    const firstRank = rows.first().locator("td").first();
    expect(await firstRank.textContent()).toBe("1");
    await ready.locator('button[data-sort="rank"]').click();
    await expect.poll(() => firstRank.textContent()).toBe(String(originalCount));
    await ready.getByRole("checkbox", { name: "Watchlist only" }).check();
    await expect.poll(() => rows.count()).toBeLessThan(originalCount);
    expect(await rows.count()).toBeGreaterThan(0);
    await ready.getByRole("button", { name: "Odds 12m", exact: true }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#/?sort=odds&dir=asc&wl=1");

    const firstLink = rows.first().getByRole("link");
    const protocol = await firstLink.textContent();
    if (!protocol) throw new Error("Expected the first filtered protocol to have a name");
    await firstLink.click();
    await heading(protocol);
    expect(await ready.getByText(/^P10–P90 · /).isVisible()).toBe(true);
    expect(await ready.locator(".value-equation").isVisible()).toBe(true);

    const nav = page.getByRole("navigation", { name: "Radar pages" });
    await nav.getByRole("link", { name: "Method", exact: true }).click();
    await heading("Method");
    await nav.getByRole("link", { name: "Census", exact: true }).click();
    await heading("Protocol census");
    expect(await ready.locator('th[aria-sort="descending"] button[data-sort="tvl"]').count()).toBe(
      1,
    );
    await ready.locator('button[data-sort="reason"]').click({ timeout: 4_000 });
    await expect.poll(() => new URL(page.url()).hash).toBe("#/census?sort=reason&dir=asc");
    await expect
      .poll(() => ready.locator('th[aria-sort="ascending"] button[data-sort="reason"]').count())
      .toBe(1);

    await nav.getByRole("link", { name: "Farm planner", exact: true }).click();
    await heading("Farm portfolio");
    const sliders = ready.getByRole("slider");
    expect(await sliders.count()).toBe(5);
    const names = [
      "Airdrop share of launch cap (%)",
      "Farmer haircut, retained (%)",
      "Labor rate (USD/h)",
      "Yield-bearing capital APR (%)",
      "Non-yielding capital APR (%)",
    ] as const;
    for (const name of names) {
      expect(await ready.getByRole("slider", { name, exact: true }).count()).toBe(1);
    }
    const share = ready.getByRole("slider", { name: names[0], exact: true });
    const verdicts = ready.locator(".verdicts tbody");
    const before = await verdicts.textContent();
    await share.press("Home");
    await expect.poll(() => share.inputValue()).toBe("0");
    await expect.poll(() => verdicts.textContent()).not.toBe(before);

    await goTo("#/unknown");
    await heading("Page unavailable");
    await ready.getByRole("link", { name: "Back to board" }).click();
    await rows.first().waitFor();
    await goTo(protocolHash("/unknown", defaultState));
    await heading("Page unavailable");

    expect(errors).toEqual([]);
    expect(nonFileRequests).toEqual([]);
    expect(webSockets).toEqual([]);
  } finally {
    try {
      await browser.close();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }
}, 45_000);
