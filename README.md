# tv-agent (TradingView Agentmode starter)

This bundle gives you a local MCP server + Playwright TradingView UI runner.

## What you get
- MCP server at `/mcp` with tools:
  - `tradingview_chart_url`
  - `get_ohlcv`
  - `tv_backtest_in_ui` (Playwright, local UI)
- Playwright TradingView runner (`mcp-server/tv-runner.ts`)
- Placeholders for execution engine and state store

## Prereqs (Windows)
1. Install Node.js LTS (includes npm)
2. Install Git (already done)
3. Optional: VS Code

## Setup
```powershell
cd tv-agent
copy .env.example .env
npm install
npx playwright install chromium
```

## Run MCP server
```powershell
npm run dev:mcp
```
You should see:
`MCP server running at http://localhost:3000/mcp`

## Add to ChatGPT Agentmode
Use URL:
`http://localhost:3000/mcp`

If you need a public https URL, use cloudflared/ngrok:
`cloudflared tunnel --url http://localhost:3000`

## Next steps
- We will stabilize selectors in tv-runner for your TradingView layout.
- Then build optimization loop and broker adapters.
