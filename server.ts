import express from "express";
import * as z from "zod";
import axios from "axios";
import dotenv from "dotenv";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { runTvBacktest } from "./tv-runner.js";

import yahooFinance from "yahoo-finance2"; // <-- ADDED

dotenv.config();

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "tradingview-agent",
  version: "0.1.0",
});

/* -------------------------------------------------------------------------- */
/*                               SYMBOL NORMALIZER                            */
/* -------------------------------------------------------------------------- */

function normalizeSymbol(sym: string) {
  const s = sym.trim().toUpperCase();

  // Common Swedish index mappings
  if (s === "OMXS30" || s === "OMXSTO:OMXS30") {
    return { stooq: "omxs30", yahoo: "^OMX" };
  }

  if (s === "^OMX") {
    return { stooq: "omxs30", yahoo: "^OMX" };
  }

  if (s === "OMXSPI" || s === "^OMXSPI") {
    return { stooq: "omxspi", yahoo: "^OMXSPI" };
  }

  // Default: same symbol to both
  return { stooq: s.toLowerCase(), yahoo: s };
}

/* -------------------------------------------------------------------------- */
/*                                YAHOO FALLBACK                              */
/* -------------------------------------------------------------------------- */

async function fetchYahooOHLCV(symbol: string, interval = "1D", limit = 200) {
  const yInterval =
    interval === "1D" ? "1d" :
    interval === "1h" ? "1h" :
    interval === "30m" ? "30m" :
    interval === "15m" ? "15m" :
    interval === "5m"  ? "5m"  :
    "1d";

  const range = yInterval === "1d" ? `${Math.max(limit, 5)}d` : "60d";

  try {
    const res = await yahooFinance.chart(symbol, { interval: yInterval as any, range });
    const t = res.timestamp ?? [];
    const q = res.indicators?.quote?.[0] ?? {};

    const out = t.map((ts: number, i: number) => ({
      time: new Date(ts * 1000).toISOString(),
      open: q.open?.[i] ?? null,
      high: q.high?.[i] ?? null,
      low: q.low?.[i] ?? null,
      close: q.close?.[i] ?? null,
      volume: q.volume?.[i] ?? null,
    }))
    .filter((c) => c.open !== null)
    .slice(-limit);

    return out;
  } catch (err) {
    console.error("Yahoo error:", err);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                          TRADINGVIEW CHART URL TOOL                        */
/* -------------------------------------------------------------------------- */

server.registerTool(
  "tradingview_chart_url",
  {
    title: "TradingView chart URL",
    description: "Return a TradingView chart URL for a symbol+interval.",
    inputSchema: {
      symbol: z.string(),
      interval: z.string().optional(),
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

/* -------------------------------------------------------------------------- */
/*                         STOOQ + YAHOO OHLCV TOOL                           */
/* -------------------------------------------------------------------------- */

server.registerTool(
  "get_ohlcv",
  {
    title: "Get OHLCV candles",
    description: "Fetch OHLCV using Stooq with Yahoo Finance fallback.",
    inputSchema: {
      symbol: z.string(),
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
        volume: z.number().nullable().optional(),
      })),
      source: z.string(),
    },
  },
  async ({ symbol, interval, limit }) => {
    const { stooq, yahoo } = normalizeSymbol(symbol);

    /* ---------------------------- TRY STOOQ FIRST ---------------------------- */

    try {
      const tfMap: Record<string, string> = {
        "1m": "1", "5m": "5", "15m": "15", "30m": "30",
        "1h": "60", "4h": "240", "1D": "d", "1W": "w", "1M": "m",
      };
      const stqInt = tfMap[interval] ?? "d";

      const csvUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=${stqInt}`;
      const resp = await axios.get<string>(csvUrl, { responseType: "text" });
      const rows = resp.data.trim().split("\n").slice(1);

      let candles = rows
        .map((r) => r.split(","))
        .filter((p) => p.length >= 5)
        .map((p) => ({
          time: p[0],
          open: Number(p[1]),
          high: Number(p[2]),
          low: Number(p[3]),
          close: Number(p[4]),
          volume: p[5] ? Number(p[5]) : null,
        }))
        .filter((c) => Number.isFinite(c.open))
        .slice(-limit);

      if (candles.length > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify({ symbol, interval, candles, source: "stooq" }) }],
          structuredContent: { symbol, interval, candles, source: "stooq" },
        };
      }
    } catch (e) {
      console.warn("Stooq failed, fallback to Yahoo");
    }

    /* ----------------------------- FALLBACK: YAHOO ---------------------------- */

    const yahooData = await fetchYahooOHLCV(yahoo, interval, limit);

    return {
      content: [{ type: "text", text: JSON.stringify({ symbol, interval, candles: yahooData, source: "yahoo" }) }],
      structuredContent: {
        symbol,
        interval,
        candles: yahooData,
        source: "yahoo"
      },
    };
  }
);

/* -------------------------------------------------------------------------- */
/*                         TRADINGVIEW UI BACKTEST TOOL                       */
/* -------------------------------------------------------------------------- */

server.registerTool(
  "tv_backtest_in_ui",
  {
    title: "Backtest Pine in TradingView UI",
    description: "Opens TradingView in your local browser, pastes Pine code, runs Strategy Tester, and returns key metrics.",
    inputSchema: {
      pineCode: z.string(),
      chartUrl: z.string().optional(),
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

/* -------------------------------------------------------------------------- */
/*                                  MCP ROUTE                                 */
/* -------------------------------------------------------------------------- */

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

