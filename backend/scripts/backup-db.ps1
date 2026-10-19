# Saves a copy of the Masroof database to "%USERPROFILE%\Masroof backups".
#
#   powershell -ExecutionPolicy Bypass -File backup-db.ps1            # back up now
#   powershell -ExecutionPolicy Bypass -File backup-db.ps1 -IfOlderThanHours 20
#
# The second form backs up only when the newest copy is older than that,
# which is how the launcher and the daily scheduled task call it.
# Keeps the newest 30 copies. Restore one with restore-db.ps1.
#
# The copies hold your real financial data: they stay on this computer and
# are never part of the repo.

param(
  [int]$IfOlderThanHours = 0,
  [int]$Keep = 30,
  [string]$Folder = (Join-Path $env:USERPROFILE 'Masroof backups'),
  [switch]$Quiet
)

$ErrorActionPreference = 'Continue'
$Container = 'financial_app_db'

function Say($text, $color = 'Gray') { if (-not $Quiet) { Write-Host $text -ForegroundColor $color } }

# Database name and user from the backend .env (no secrets are read or shown).
$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$dbUser = 'financial'
$dbName = 'financial_app'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*POSTGRES_USER\s*=\s*(\S+)') { $dbUser = $Matches[1].Trim('"', "'") }
    if ($line -match '^\s*POSTGRES_DB\s*=\s*(\S+)') { $dbName = $Matches[1].Trim('"', "'") }
  }
}

New-Item -ItemType Directory -Force -Path $Folder | Out-Null

if ($IfOlderThanHours -gt 0) {
  $newest = Get-ChildItem $Folder -Filter 'masroof-*.dump' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($newest -and $newest.LastWriteTime -gt (Get-Date).AddHours(-$IfOlderThanHours)) {
    Say "Latest backup is recent ($($newest.Name)); nothing to do."
    exit 0
  }
}

# The container must be running; when Docker is off there is nothing new to save.
$running = (cmd /c "docker inspect -f {{.State.Running}} $Container 2>nul")
if ($running -ne 'true') {
  Say 'Database is not running; skipped the backup.' 'Yellow'
  exit 0
}

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$file = Join-Path $Folder "masroof-$stamp.dump"
$inside = '/tmp/masroof-backup.dump'

# Dump inside the container, then copy the file out. Piping a binary dump
# through PowerShell 5.1 would corrupt it.
cmd /c "docker exec $Container pg_dump -U $dbUser -d $dbName -Fc -f $inside >nul 2>&1"
if ($LASTEXITCODE -ne 0) { Say 'Backup failed: pg_dump did not finish.' 'Red'; exit 1 }
cmd /c "docker cp ${Container}:$inside `"$file`" >nul 2>&1"
$copyExit = $LASTEXITCODE
cmd /c "docker exec $Container rm -f $inside >nul 2>&1"
if ($copyExit -ne 0 -or -not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
  Say 'Backup failed: could not copy the file out of the container.' 'Red'
  exit 1
}

# Keep the newest $Keep copies.
Get-ChildItem $Folder -Filter 'masroof-*.dump' | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | Remove-Item -ErrorAction SilentlyContinue

$kb = [math]::Round((Get-Item $file).Length / 1KB)
Say "Backed up to $file ($kb KB)" 'Green'
