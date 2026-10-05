# Stops the API and web app started by start-local.ps1.
# The database container keeps running (it is light); stop it with
# `npm run db:down` in the backend folder if you want.

$ErrorActionPreference = 'Continue'
$PidFile = Join-Path $env:TEMP 'finance-app-pids.txt'

# The windows start-local.ps1 opened, with everything they started.
if (Test-Path $PidFile) {
  foreach ($id in Get-Content $PidFile) {
    if ($id -notmatch '^\d+$') { continue }
    # Only a window this app opened: after a restart the same number can
    # belong to an unrelated program.
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
    if ($proc -and $proc.CommandLine -like '*Finance*') { cmd /c "taskkill /PID $id /T /F >nul 2>&1" }
  }
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}

# Anything still listening on the app ports (for example started by hand).
foreach ($port in 3001, 3002) {
  Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    ForEach-Object { cmd /c "taskkill /PID $($_.OwningProcess) /T /F >nul 2>&1" }
}

Write-Host ''
Write-Host '  Finance is stopped.' -ForegroundColor Green
Write-Host ''
Start-Sleep -Seconds 2
