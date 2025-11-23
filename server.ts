import express from "express";
import * as z from "zod";
import axios from "axios";
import dotenv from "dotenv";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runTvBacktest } from "./tv-runner.js";

dotenv.config();

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "tradingview-agent",
  version: "0.1.0",
});

/**
 * Tool: Return TradingView chart URL
 */
server.registerTool(
  "tradingview_chart_url",
  {
    title: "TradingView chart URL",
    description: "Return a TradingView chart URL for a symbol+interval.",
    inputSchema: {
      symbol: z.string().describe("Eg AAPL, BTCUSD, OMX30"),
      interval: z.string().optional().describe("1m, 15m, 1h, 4h, 1D, etc"),
    },
    outputSchema: { url: z.string() },
  },
  async ({ symbol, interval }) => {
    const safeSymbol = encodeURIComponent(symbol.toUpperCase());
    const safeInterval = encodeURIComponent(interval ?? "1D");
    const url = `https://www.tradingview.com/chart/?symbol=${safeSymbol}&interval=${safeInterval}`;
    const output = { url };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: Get OHLCV candles from Stooq
 */
server.registerTool(
  "get_ohlcv",
  {
    title: "Get OHLCV candles",
    description: "Fetch OHLCV candles via Stooq free data.",
    inputSchema: {
      symbol: z.string().describe("Stooq symbol, e.g. aapl.us, spy.us, btcusd"),
      interval: z.enum(["1m","5m","15m","30m","1h","4h","1D","1W","1M"]).default("1D"),
      limit: z.number().int().min(10).max(5000).default(500),
    },
    outputSchema: {
      symbol: z.string(),
      interval: z.string(),
      candles: z.array(z.object({
        time: z.string(),
        open: z.number(),
        high: z.number(),
        low: z.number(),
        close: z.number(),
        volume: z.number().optional(),
      })),
      source: z.string(),
    },
  },
  async ({ symbol, interval, limit }) => {
    const tfMap: Record<string, string> = {
      "1m": "1",
      "5m": "5",
      "15m": "15",
      "30m": "30",
      "1h": "60",
      "4h": "240",
      "1D": "d",
      "1W": "w",
      "1M": "m",
    };

    const stooqInterval = tfMap[interval] ?? "d";
    const s = symbol.trim().toLowerCase();
    const csvUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=${stooqInterval}`;
    const resp = await axios.get<string>(csvUrl, { responseType: "text" });

    const lines = resp.data.trim().split("\n");
    const rows = lines.slice(1);
    const candles = rows
      .map((r) => r.split(","))
      .filter((p) => p.length >= 5)
      .map((p) => ({
        time: p[0],
        open: Number(p[1]),
        high: Number(p[2]),
        low: Number(p[3]),
        close: Number(p[4]),
        volume: p[5] ? Number(p[5]) : undefined,
      }))
      .filter((c) => Number.isFinite(c.open))
      .slice(-limit);

    const output = { symbol: s, interval, candles, source: "stooq.com" };
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
  }
);

/**
 * Tool: Run Pine backtest in your local TradingView UI using Playwright.
 * Requires you to be logged in in the opened browser window.
 */
server.registerTool(
  "tv_backtest_in_ui",
  {
    title: "Backtest Pine in TradingView UI",
    description: "Opens TradingView in your local browser, pastes Pine code, runs Strategy Tester, and returns key metrics.",
    inputSchema: {
      pineCode: z.string().describe("Full Pine v5 script"),
      chartUrl: z.string().optional().describe("TradingView chart URL. Defaults to TV_CHART_URL in .env"),
    },
    outputSchema: {
      netProfit: z.string().nullable(),
      winRate: z.string().nullable(),
      drawdown: z.string().nullable(),
    },
  },
  async ({ pineCode, chartUrl }) => {
    const url = chartUrl ?? process.env.TV_CHART_URL ?? "https://www.tradingview.com/chart/";
    const res = await runTvBacktest(pineCode, url);
    return {
      content: [{ type: "text", text: JSON.stringify(res) }],
      structuredContent: res,
    };
  }
);

// MCP endpoint
app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`MCP server running at http://localhost:${PORT}/mcp`);
});
