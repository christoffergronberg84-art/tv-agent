# tv-agent MCP server (Render-ready)

Minimal MCP-compatible server for TradingView Agentmode.

## Endpoints
- `GET /mcp/ping`
- `POST /mcp/tools`
- `POST /mcp/run`

## Tools
- `get_ohlcv(symbol, interval, limit)`
- `tradingview_chart_url(symbol, interval)`
- `tv_backtest_in_ui()`

## Local run
```bash
npm install
npm start
# open http://localhost:3000/mcp/ping
```

## Deploy on Render
- Root Directory: repo root
- Build Command: `npm install`
- Start Command: `npm start`
