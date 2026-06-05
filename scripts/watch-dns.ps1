# Watch NS propagation: poker-hub.city -> Cloudflare.
# Polls 8.8.8.8 every 30s. On success: beep + auto-close in 5s.

$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'poker-hub.city NS watcher'

$domain = 'poker-hub.city'
$dnsServer = '8.8.8.8'
$intervalSec = 30
$start = Get-Date
$checks = 0

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host "  Watching NS propagation: $domain -> Cloudflare" -ForegroundColor Cyan
Write-Host "  Polling $dnsServer every $intervalSec sec" -ForegroundColor Cyan
Write-Host '  Window auto-closes 5s after success.' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ''

while ($true) {
  $checks++
  $stamp = Get-Date -Format 'HH:mm:ss'
  $out = nslookup -type=NS $domain $dnsServer 2>&1 | Out-String

  if ($out -match 'cloudflare\.com') {
    $nsLines = ($out -split "`n" | Where-Object { $_ -match 'cloudflare\.com' } | ForEach-Object { $_.Trim() })
    Write-Host ''
    Write-Host "[$stamp] *** SUCCESS: NS propagation reached Cloudflare ***" -ForegroundColor Green
    foreach ($ns in $nsLines) {
      Write-Host "    $ns" -ForegroundColor Green
    }
    Write-Host ''
    Write-Host '-> Go back to Claude, continue with tunnel.' -ForegroundColor Yellow
    [console]::beep(1000, 200); Start-Sleep -Milliseconds 100
    [console]::beep(1200, 200); Start-Sleep -Milliseconds 100
    [console]::beep(1500, 300)
    Start-Sleep -Seconds 5
    break
  }

  $elapsed = [int]((Get-Date) - $start).TotalMinutes
  Write-Host "[$stamp] check #$checks (elapsed $elapsed min) - still on old NS, waiting..." -ForegroundColor DarkGray
  Start-Sleep -Seconds $intervalSec
}
