Write-Host "== tv-agent setup ==" -ForegroundColor Cyan
if (!(Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example"
}
npm install
npx playwright install chromium
Write-Host "Setup done. Run: npm run dev:mcp" -ForegroundColor Green
