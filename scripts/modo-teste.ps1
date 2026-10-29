# Liga ou desliga o modo de teste do Mercado Pago no Cloudflare e publica de novo.
# Uso: powershell -ExecutionPolicy Bypass -File scripts\modo-teste.ps1 sim   (testar com cartões de teste)
#      powershell -ExecutionPolicy Bypass -File scripts\modo-teste.ps1 nao   (vendas de verdade)
param([string]$modo = 'sim')
Set-Location (Split-Path $PSScriptRoot -Parent)
if ($modo -eq 'sim') { 'sim' | npx.cmd wrangler pages secret put MP_MODO_TESTE --project-name nmaker }
else { npx.cmd wrangler pages secret delete MP_MODO_TESTE --project-name nmaker }
powershell -ExecutionPolicy Bypass -File scripts\publicar.ps1
