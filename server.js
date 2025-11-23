import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// ---- MCP PING ----
app.get("/mcp/ping", (req, res) => {
  res.json({ status: "ok", message: "MCP server running" });
});

// ---- MCP Tools ----
app.post("/mcp/tools", (req, res) => {
  res.json({
    tools: [
      {
        name: "get_ohlcv",
        description: "Fetch OHLCV from Stooq",
        input_schema: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            interval: { type: "string" },
            limit: { type: "number" },
          },
          required: ["symbol"],
        },
      }
    ]
  });
});

// ---- MCP Run ----
app.post("/mcp/run", async (req, res) => {
  const tool = req.body.tool;
  const input = req.body.input;

  if (tool === "get_ohlcv") {
    return res.json({
      result: `Här hade jag hämtat OHLCV för ${input.symbol} (${input.interval}, limit ${input.limit})`
    });
  }

  return res.status(400).json({ error: "Tool not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MCP server running on port", PORT));
