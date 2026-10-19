# Puts "Start Masroof" and "Stop Masroof" on the Windows desktop, with the app
# icon, and schedules a daily database backup. Run once (again after moving
# the folder): right-click > Run with PowerShell.

$ErrorActionPreference = 'Stop'
$scripts = $PSScriptRoot
$icon = Join-Path $scripts 'masroof.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function New-Shortcut($name, $script, $description) {
  $link = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
  $link.TargetPath = $powershell
  $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $scripts $script)`""
  $link.WorkingDirectory = $scripts
  $link.Description = $description
  if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
  $link.Save()
}

New-Shortcut 'Start Masroof' 'start-local.ps1' 'Start the Masroof app (database, API and web app)'
New-Shortcut 'Stop Masroof' 'stop-local.ps1' 'Stop the Masroof app'
Write-Host "Shortcuts added to $desktop" -ForegroundColor Green

# Daily backup at 21:00 (or as soon as the PC is on after a missed run).
# It only saves when the newest copy is older than 20 hours and the
# database is running, so it is harmless when the app is off.
$parent = Split-Path -Parent (Split-Path -Parent $scripts)
$backup = Join-Path $parent 'backend\scripts\backup-db.ps1'
if (-not (Test-Path $backup)) { $backup = Join-Path $parent '46-financial_app\scripts\backup-db.ps1' }
if (Test-Path $backup) {
  $action = New-ScheduledTaskAction -Execute $powershell `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$backup`" -IfOlderThanHours 20 -Quiet"
  $trigger = New-ScheduledTaskTrigger -Daily -At '21:00'
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
  Register-ScheduledTask -TaskName 'Masroof daily backup' -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Saves a copy of the Masroof database to your "Masroof backups" folder.' -Force | Out-Null
  Write-Host "Daily backup scheduled (folder: $env:USERPROFILE\Masroof backups)" -ForegroundColor Green
}
