import { chromium } from "playwright";

/**
 * Opens TradingView locally, pastes Pine code, adds to chart, opens Strategy Tester,
 * and scrapes basic metrics.
 *
 * NOTE: TradingView DOM changes over time. You may need to tweak selectors in here.
 */
export async function runTvBacktest(pineCode: string, chartUrl: string) {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(chartUrl, { waitUntil: "domcontentloaded" });

  // Give the page a moment to settle
  await page.waitForTimeout(1500);

  // 1) Open Pine Editor tab
  await page.getByText("Pine Editor", { exact: false }).click();
  await page.waitForTimeout(1500);

  // 2) Focus editor
  const editor = page.locator("textarea, .monaco-editor textarea").first();
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(pineCode, { delay: 1 });

  // 3) Add to chart / Save
  const addOrSaveBtn = page.getByRole("button", { name: /Add to chart|Save/i }).first();
  await addOrSaveBtn.click();
  await page.waitForTimeout(2500);

  // 4) Open Strategy Tester
  await page.getByText("Strategy Tester", { exact: false }).click();
  await page.waitForTimeout(2500);

  // 5) Scrape metrics (best effort)
  const grabAround = async (labelRegex: RegExp) => {
    const el = page.locator(`text=${labelRegex.source}`).first();
    const txt = await el.textContent().catch(() => null);
    return txt;
  };

  const netProfit = await grabAround(/Net Profit/i);
  const winRate = await grabAround(/Win Rate/i);
  const drawdown = await grabAround(/Max Drawdown/i);

  await browser.close();
  return { netProfit, winRate, drawdown };
}

// Allow quick manual run: `npx tsx mcp-server/tv-runner.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = `//@version=5
strategy("Demo", overlay=true)
if ta.crossover(ta.sma(close, 10), ta.sma(close, 20))
    strategy.entry("L", strategy.long)
if ta.crossunder(ta.sma(close,10), ta.sma(close,20))
    strategy.close("L")
`;
  runTvBacktest(demo, process.env.TV_CHART_URL || "https://www.tradingview.com/chart/").then(console.log);
}
