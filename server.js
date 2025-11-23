import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

// ---------- MCP: health/ping ----------
app.get("/mcp/ping", (req, res) => {
  res.json({ ok: true, message: "pong", ts: new Date().toISOString() });
});

// ---------- MCP: list tools ----------
app.post("/mcp/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "get_ohlcv",
        description: "Fetch OHLCV from Stooq (daily/minute depending on symbol availability).",
        input_schema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "Stooq symbol, e.g. omxs30, omxs30.ix, ^spx" },
            interval: { type: "string", description: "1D, 1H, 15m etc (best-effort)" },
            limit: { type: "integer", description: "Number of bars, default 200", default: 200 }
          },
          required: ["symbol"]
        }
      },
      {
        name: "tradingview_chart_url",
        description: "Return a TradingView chart URL for given symbol and interval.",
        input_schema: {
          type: "object",
          properties: {
            symbol: { type: "string", description: "TradingView symbol, e.g. OMXSTO:OMXS30" },
            interval: { type: "string", description: "TradingView interval, e.g. 15m, 1D" }
          },
          required: ["symbol"]
        }
      },
      {
        name: "tv_backtest_in_ui",
        description: "Placeholder until Playwright integration; returns instructions.",
        input_schema: { type: "object", properties: {} }
      }
    ]
  });
});

// ---------- Helpers ----------
function toStooqUrl(symbol, interval) {
  const s = String(symbol || "").toLowerCase();
  let i = "d";
  if (interval) {
    const m = String(interval).toLowerCase();
    if (m.includes("1h") || m.includes("60")) i = "60";
    else if (m.includes("30")) i = "30";
    else if (m.includes("15")) i = "15";
    else if (m.includes("5")) i = "5";
    else if (m.includes("1d") || m.includes("d")) i = "d";
  }
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=${i}`;
}

function csvToOhlcv(csvText, limit=200) {
  const lines = String(csvText || "").trim().split(/\r?\n/);
  const out = [];
  for (let k=1; k<lines.length; k++) {
    const row = lines[k].split(",");
    if (row.length < 5) continue;
    const [date, open, high, low, close, volume] = row;
    out.push({
      time: date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: volume !== undefined ? Number(volume) : null
    });
  }
  return out.slice(-limit);
}

function tvUrl(symbol, interval) {
  const base = "https://www.tradingview.com/chart/";
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  if (interval) params.set("interval", interval.replace("m",""));
  return `${base}?${params.toString()}`;
}

// ---------- MCP: run tool ----------
app.post("/mcp/run", async (req, res) => {
  try {
    const { tool, input } = req.body || {};
    if (!tool) return res.status(400).json({ error: "Missing tool" });

    if (tool === "get_ohlcv") {
      const symbol = input?.symbol || "omxs30.ix";
      const interval = input?.interval || "1D";
      const limit = Number(input?.limit ?? 200);
      const url = toStooqUrl(symbol, interval);
      const r = await axios.get(url, { responseType: "text" });
      const data = csvToOhlcv(r.data, limit);
      return res.json({ tool, input: { symbol, interval, limit }, result: data, source: "stooq" });
    }

    if (tool === "tradingview_chart_url") {
      const symbol = input?.symbol || "OMXSTO:OMXS30";
      const interval = input?.interval || "15m";
      const url = tvUrl(symbol, interval);
      return res.json({ tool, input: { symbol, interval }, result: url });
    }

    if (tool === "tv_backtest_in_ui") {
      return res.json({
        tool,
        result: "Placeholder. Playwright UI automation will be added in Phase 3."
      });
    }

    return res.status(400).json({ error: `Unknown tool: ${tool}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// ---------- Root ----------
app.get("/", (req, res) => {
  res.type("text").send("tv-agent MCP server is running. Try /mcp/ping");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MCP server running on port", PORT));
