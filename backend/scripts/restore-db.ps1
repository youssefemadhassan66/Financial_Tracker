# Puts a backup made by backup-db.ps1 back into the Masroof database.
#
#   powershell -ExecutionPolicy Bypass -File restore-db.ps1                 # newest backup
#   powershell -ExecutionPolicy Bypass -File restore-db.ps1 -File <path>    # a specific one
#
# EVERYTHING in the database is replaced by the backup. A fresh backup of
# the current state is taken first, so a mistaken restore can be undone.

param(
  [string]$File,
  [string]$Folder = (Join-Path $env:USERPROFILE 'Masroof backups')
)

$ErrorActionPreference = 'Continue'
$Container = 'financial_app_db'

$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$dbUser = 'financial'
$dbName = 'financial_app'
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*POSTGRES_USER\s*=\s*(\S+)') { $dbUser = $Matches[1].Trim('"', "'") }
    if ($line -match '^\s*POSTGRES_DB\s*=\s*(\S+)') { $dbName = $Matches[1].Trim('"', "'") }
  }
}

if (-not $File) {
  $newest = Get-ChildItem $Folder -Filter 'masroof-*.dump' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $newest) { Write-Host "No backups found in $Folder" -ForegroundColor Red; exit 1 }
  $File = $newest.FullName
}
if (-not (Test-Path $File)) { Write-Host "Backup not found: $File" -ForegroundColor Red; exit 1 }

$running = (cmd /c "docker inspect -f {{.State.Running}} $Container 2>nul")
if ($running -ne 'true') { Write-Host 'Start the database first (Start Masroof).' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host "  Restore from: $File" -ForegroundColor Yellow
Write-Host '  This REPLACES everything currently in the database.' -ForegroundColor Yellow
$answer = Read-Host '  Type RESTORE to continue'
if ($answer -ne 'RESTORE') { Write-Host '  Cancelled.'; exit 0 }

# Safety copy of the current state first.
& (Join-Path $PSScriptRoot 'backup-db.ps1') -Folder $Folder
if ($LASTEXITCODE -ne 0) { Write-Host 'Could not save the current state first; not restoring.' -ForegroundColor Red; exit 1 }

$inside = '/tmp/masroof-restore.dump'
cmd /c "docker cp `"$File`" ${Container}:$inside >nul 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host 'Could not copy the backup into the container.' -ForegroundColor Red; exit 1 }
cmd /c "docker exec $Container pg_restore -U $dbUser -d $dbName --clean --if-exists --no-owner $inside"
$restoreExit = $LASTEXITCODE
cmd /c "docker exec $Container rm -f $inside >nul 2>&1"
if ($restoreExit -ne 0) { Write-Host 'pg_restore reported problems (see above).' -ForegroundColor Red; exit 1 }
Write-Host '  Restored. Restart the app (Stop Masroof, then Start Masroof).' -ForegroundColor Green
