# Starts the whole app on this computer with one double-click:
#   1. the database (Docker), 2. the API (port 3002), 3. the web app (port 3001),
# then opens the dashboard in the browser and prints the address for your phone.
#
# The web app runs as a production build (fast, no dev overlay). It is rebuilt
# only when the code changed since the last build.
#
# Finds the backend next to this folder: ..\backend (the combined
# Financial_Tracker repo) or ..\46-financial_app (separate repos).
# Stop everything with scripts\stop-local.ps1.

# Continue, not Stop: in Windows PowerShell a native tool writing to stderr
# (docker, npm, git) would otherwise abort the script. Each step checks its
# own exit code instead.
$ErrorActionPreference = 'Continue'
$Host.UI.RawUI.WindowTitle = 'Masroof - starting'

$Web = Split-Path -Parent $PSScriptRoot
$Parent = Split-Path -Parent $Web
$Api = Join-Path $Parent 'backend'
if (-not (Test-Path (Join-Path $Api 'package.json'))) { $Api = Join-Path $Parent '46-financial_app' }
$WebPort = 3001
$ApiPort = 3002
$PidFile = Join-Path $env:TEMP 'finance-app-pids.txt'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Fail($text) {
  Say ''
  Say "Could not start: $text" 'Red'
  Read-Host 'Press Enter to close'
  exit 1
}

function Test-Port($port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

# Any HTTP answer (even 401 or 404) means the server is up.
function Wait-Http($url, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      if ($_.Exception.Response) { return $true }
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

# This PC's address on the home network: a private address handed out by the
# router (DHCP), skipping VPN and virtual adapters (Radmin, WSL, Hyper-V...),
# whose addresses a phone on the Wi-Fi can't reach.
function Get-LanAddress {
  $skip = 'VPN|Radmin|vEthernet|Virtual|Hyper-V|WSL|VMware|VirtualBox|Tailscale|ZeroTier|Hamachi|Loopback|Bluetooth'
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.InterfaceAlias -notmatch $skip -and
      ($_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' -or $_.IPAddress -match '^172\.(1[6-9]|2[0-9]|3[01])\.')
    } |
    Sort-Object @{ Expression = { if ($_.PrefixOrigin -eq 'Dhcp') { 0 } else { 1 } } }, InterfaceMetric
  $first = $candidates | Select-Object -First 1
  if ($first) { return $first.IPAddress }
  return $null
}

if (-not (Test-Path (Join-Path $Api 'package.json'))) { Fail "backend folder not found at $Api" }

Say ''
Say '  Masroof' 'Cyan'
Say '  Starting your app...' 'Cyan'
Say ''

# --- 1. Database ----------------------------------------------------------
Say '[1/3] Database'
cmd /c "docker info >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
  $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dockerDesktop)) { Fail 'Docker is not running and Docker Desktop was not found.' }
  Say '      Opening Docker Desktop (this can take a minute)...'
  Start-Process $dockerDesktop
  $deadline = (Get-Date).AddSeconds(180)
  do {
    Start-Sleep -Seconds 3
    cmd /c "docker info >nul 2>&1"
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) { Fail 'Docker did not start in time. Open Docker Desktop, then try again.' }
}
Push-Location $Api
cmd /c "docker compose up -d >nul 2>&1"
$composeExit = $LASTEXITCODE
Pop-Location
if ($composeExit -ne 0) { Fail 'the database container did not start (docker compose up).' }
Say '      ready' 'Green'

$lan = Get-LanAddress
$origins = "http://localhost:$WebPort"
if ($lan) { $origins = "$origins,http://${lan}:$WebPort" }

$pids = @()

# --- 2. API -----------------------------------------------------------------
Say '[2/3] API'
if (Test-Port $ApiPort) {
  Say "      already running on port $ApiPort" 'Green'
} else {
  $apiCommand = "`$Host.UI.RawUI.WindowTitle = 'Masroof API (keep open)'; " +
    "`$env:PORT = '$ApiPort'; `$env:CORS_ORIGIN = '$origins'; " +
    "Set-Location '$Api'; npm run dev"
  $p = Start-Process powershell -WindowStyle Minimized -PassThru `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand)
  $pids += $p.Id
  if (-not (Wait-Http "http://localhost:$ApiPort/api/auth/me" 90)) { Fail 'the API did not answer. Open the minimized "Masroof API" window to see why.' }
  Say '      ready' 'Green'
}

# --- 3. Web app -------------------------------------------------------------
Say '[3/3] Web app'
if (Test-Port $WebPort) {
  Say "      already running on port $WebPort" 'Green'
} else {
  $env:API_PROXY_TARGET = "http://localhost:$ApiPort"

  # Rebuild only when the code changed since the last build.
  # Uncommitted changes always rebuild; a clean checkout rebuilds once per commit.
  $head = (cmd /c "git -C `"$Web`" rev-parse HEAD 2>nul")
  $dirty = (cmd /c "git -C `"$Web`" status --porcelain 2>nul")
  $stamp = "$head|$env:API_PROXY_TARGET"
  if ($dirty) { $stamp = "dirty-$((Get-Date).Ticks)" }
  $stampFile = Join-Path $Web '.next\local-build-stamp.txt'
  $built = (Test-Path (Join-Path $Web '.next\BUILD_ID')) -and (Test-Path $stampFile) -and ((Get-Content $stampFile -Raw).Trim() -eq $stamp)
  if (-not $built) {
    Say '      building (about a minute, only after code changes)...'
    Push-Location $Web
    $log = Join-Path $env:TEMP 'finance-app-build.log'
    cmd /c "npm run build > `"$log`" 2>&1"
    $buildExit = $LASTEXITCODE
    Pop-Location
    if ($buildExit -ne 0) { Fail "the build failed. Details: $env:TEMP\finance-app-build.log" }
    Set-Content -Path $stampFile -Value $stamp
  }

  $webCommand = "`$Host.UI.RawUI.WindowTitle = 'Masroof web app (keep open)'; " +
    "`$env:API_PROXY_TARGET = 'http://localhost:$ApiPort'; " +
    "Set-Location '$Web'; npx next start -p $WebPort -H 0.0.0.0"
  $p = Start-Process powershell -WindowStyle Minimized -PassThru `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $webCommand)
  $pids += $p.Id
  if (-not (Wait-Http "http://localhost:$WebPort/" 90)) { Fail 'the web app did not answer. Open the minimized "Masroof web app" window to see why.' }
  Say '      ready' 'Green'
}

# Only this run's windows; stop-local.ps1 also stops anything on the ports.
if ($pids.Count -gt 0) { Set-Content -Path $PidFile -Value $pids }

Start-Process "http://localhost:$WebPort/dashboard"

$Host.UI.RawUI.WindowTitle = 'Masroof - running'
Say ''
Say '  Your app is running.' 'Green'
Say ''
Say "  On this computer:  http://localhost:$WebPort"
if ($lan) {
  Say "  On your phone:     http://${lan}:$WebPort" 'Yellow'
  Say '                     (same Wi-Fi; then Share > Add to Home Screen for the app icon)'
}
Say ''
Say '  Keep the two minimized Masroof windows open while you use it.'
Say '  To stop everything: double-click "Stop Masroof".'
Say ''
Read-Host 'Press Enter to close this window (the app keeps running)'
