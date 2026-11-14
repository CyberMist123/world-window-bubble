# world-window-web-ensure.ps1 - Idempotent watchdog for World Window (127.0.0.1:5184)
# Scheduled Task: WorldWindowWeb (every 15 min + AtLogOn +1m via hiddenrun.exe)
param([switch]$Stop)
$ErrorActionPreference = 'Stop'

$appDir = $PSScriptRoot
$serveJs = Join-Path $appDir 'serve.js'
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = 'C:\Program Files\nodejs\node.exe' }
$stateDir = Join-Path $appDir 'feed-profile\.cache'
$pidFile = Join-Path $stateDir 'server.pid'
$logFile = Join-Path $stateDir 'ensure.log'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function Test-WorldWindowAlive {
    try {
        $r = Invoke-RestMethod -Uri 'http://127.0.0.1:5184/api/state' -TimeoutSec 3
        return [bool]$r.ok
    } catch {
        return $false
    }
}

if ($Stop) {
    if (Test-Path $pidFile) {
        $oldPid = Get-Content $pidFile -ErrorAction SilentlyContinue
        if ($oldPid) { try { Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue } catch {} }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    try {
        Get-NetTCPConnection -LocalPort 5184 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            ForEach-Object { if ($_ -gt 4) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
    } catch {}
    "$(Get-Date -Format s) stopped" | Add-Content -Encoding UTF8 $logFile
    Write-Output 'stopped'
    exit 0
}

if (Test-WorldWindowAlive) {
    Write-Output 'alive'
    exit 0
}

# Clean up any stale listener on 5184 before starting
try {
    Get-NetTCPConnection -LocalPort 5184 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { if ($_ -gt 4) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
} catch {}

$env:PORT = '5184'
$proc = Start-Process -FilePath $nodeExe -ArgumentList @($serveJs) -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
$proc.Id | Set-Content -Encoding ASCII $pidFile

for ($i = 0; $i -lt 14; $i++) {
    Start-Sleep -Milliseconds 400
    if (Test-WorldWindowAlive) {
        "$(Get-Date -Format s) started pid $($proc.Id) on 127.0.0.1:5184" | Add-Content -Encoding UTF8 $logFile
        Write-Output "started pid $($proc.Id)"
        exit 0
    }
}

"$(Get-Date -Format s) START FAILED" | Add-Content -Encoding UTF8 $logFile
Write-Output 'start failed'
exit 1
