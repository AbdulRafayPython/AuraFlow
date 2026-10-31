# Fixes Docker Desktop on Windows failing to start with:
#   "initializing Inference manager: listening on unix://.../dockerInference: remove ...: The file cannot be accessed by the system"
#   "initializing Secrets Engine: ... engine.sock: remove ...: The file cannot be accessed by the system"
#
# Cause: a previous Docker Desktop run was not shut down cleanly and left AF_UNIX
# socket files (reparse points) behind. Docker cannot delete them on start-up.
# Windows can still RENAME their parent folder, so this script moves the stale
# folders aside (nothing is deleted) and lets Docker create fresh ones.
#
# Usage (PowerShell, no admin needed):
#   .\scripts\docker-fix-stale-sockets.ps1
#
# Do NOT click "Reset to factory defaults" in the Docker error dialog: it deletes
# all images, containers and volumes.

$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

Get-Process | Where-Object { $_.ProcessName -match '^(Docker Desktop|com\.docker\.|dockerd|vpnkit)' } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4

$dirs = @(
    "$env:LOCALAPPDATA\Docker\run",
    "$env:LOCALAPPDATA\docker-secrets-engine"
)

foreach ($dir in $dirs) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    $leaf = Split-Path $dir -Leaf
    Rename-Item -LiteralPath $dir -NewName "$leaf.stale-$stamp"
    New-Item -ItemType Directory -Path $dir | Out-Null
    Write-Host "moved aside: $dir -> $leaf.stale-$stamp"
}

$exe = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
if (Test-Path $exe) {
    Start-Process $exe
    Write-Host 'Docker Desktop started. Wait until `docker info` works, then run: docker compose up'
}
