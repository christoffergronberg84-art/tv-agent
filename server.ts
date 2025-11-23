import express from "express";
import * as z from "zod/v4";
import axios from "axios";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "tradingview-agent",
  version: "1.0.0",
});

// TradingView URL Tool
server.registerTool(
  "tradingview_chart_url",
  {
    title: "TradingView chart URL",
    description: "Return TradingView chart URL",
    inputSchema: {
      symbol: z.string(),
      interval: z.string().optional()
    },
    outputSchema: {
      url: z.string()
    }
  },
  async ({ symbol, interval }) => {
    const safeSymbol = encodeURIComponent(symbol.toUpperCase());
    const safeInterval = encodeURIComponent(interval ?? "1D");
    const url = `https://www.tradingview.com/chart/?symbol=${safeSymbol}&interval=${safeInterval}`;
    return {
      content: [{ type: "text", text: JSON.stringify({ url }) }],
      structuredContent: { url }
    };
  }
);

// OHLCV Data Tool
server.registerTool(
  "get_ohlcv",
  {
    title: "Get OHLCV candles",
    description: "Fetch OHLCV from Stooq",
    inputSchema: {
      symbol: z.string(),
      interval: z.enum(["1m","5m","15m","30m","1h","4h","1D","1W","1M"]).default("1D"),
      limit: z.number().min(10).max(5000).default(500)
    },
    outputSchema: {
      symbol: z.string(),
      interval: z.string(),
      candles: z.array(
        z.object({
          time: z.string(),
          open: z.number(),
          high: z.number(),
          low: z.number(),
          close: z.number(),
          volume: z.number().optional()
        })
      ),
      source: z.string()
    }
  },
  async ({ symbol, interval, limit }) => {
    const tfMap = {
      "1m": "1", "5m": "5", "15m": "15",
      "30m": "30", "1h": "60", "4h": "240",
      "1D": "d", "1W": "w", "1M": "m"
    };

    const stooqInterval = tfMap[interval];
    const csvUrl = `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=${stooqInterval}`;
    const resp = await axios.get(csvUrl, { responseType: "text" });

    const lines = resp.data.trim().split("\n").slice(1);
    const candles = lines.map(r => {
      const p = r.split(",");
      return {
        time: p[0],
        open: Number(p[1]),
        high: Number(p[2]),
        low: Number(p[3]),
        close: Number(p[4]),
        volume: p[5] ? Number(p[5]) : undefined
      };
    }).slice(-limit);

    return {
      content: [{ type: "text", text: JSON.stringify({ symbol, interval, candles, source: "stooq.com" }) }],
      structuredContent: { symbol, interval, candles, source: "stooq.com" }
    };
  }
);

// Placeholder Tool
server.registerTool(
  "tv_backtest_in_ui",
  {
    title: "Playwright TradingView backtest",
    description: "Placeholder until Playwright integration",
    inputSchema: {
      pineCode: z.string(),
      chartUrl: z.string()
    },
    outputSchema: {
      ok: z.boolean(),
      note: z.string()
    }
  },
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify({ ok: true, note: "Playwright integration coming later." }) }],
      structuredContent: { ok: true, note: "Playwright integration coming later." }
    };
  }
);

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    res.status(500).json({ error: "MCP server error", details: err.toString() });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCP server running at http://localhost:${PORT}/mcp`));
