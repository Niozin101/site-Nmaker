# Publica o site no Cloudflare Pages (projeto "nmaker").
# Uso: powershell -ExecutionPolicy Bypass -File scripts\publicar.ps1
Set-Location (Split-Path $PSScriptRoot -Parent)
npm run build
if (-not $?) { exit 1 }
npx.cmd wrangler pages deploy site --project-name nmaker --branch main --commit-dirty=true
