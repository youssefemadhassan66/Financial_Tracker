# Puts "Start Finance" and "Stop Finance" on the Windows desktop, with the app
# icon. Run once: right-click > Run with PowerShell.

$ErrorActionPreference = 'Stop'
$scripts = $PSScriptRoot
$icon = Join-Path $scripts 'finance.ico'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

function New-Shortcut($name, $script, $description) {
  $link = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
  $link.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$(Join-Path $scripts $script)`""
  $link.WorkingDirectory = $scripts
  $link.Description = $description
  if (Test-Path $icon) { $link.IconLocation = "$icon,0" }
  $link.Save()
}

New-Shortcut 'Start Finance' 'start-local.ps1' 'Start the Finance app (database, API and web app)'
New-Shortcut 'Stop Finance' 'stop-local.ps1' 'Stop the Finance app'
Write-Host "Shortcuts added to $desktop" -ForegroundColor Green
