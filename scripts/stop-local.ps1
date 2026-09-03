$ErrorActionPreference = 'Stop'
$workspaceDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $workspaceDirectory '.local-services.json'

if (-not (Test-Path -LiteralPath $pidFile -PathType Leaf)) {
  Write-Output 'No local service registry found. Nothing to stop.'
  exit 0
}

$entries = Get-Content -LiteralPath $pidFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $entries) {
  $process = Get-Process -Id ([int]$entry.Pid) -ErrorAction SilentlyContinue
  if (-not $process) {
    Write-Output "$($entry.Name) is already stopped."
    continue
  }

  $commandLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.Pid)" -ErrorAction SilentlyContinue).CommandLine
  $belongsToWorkspace = $commandLine -and $commandLine -match [regex]::Escape($workspaceDirectory)
  $belongsToFlutter = $entry.Name -eq 'Flutter Web' -and $commandLine -match "--web-port $($entry.Port)"
  if (-not ($belongsToWorkspace -or $belongsToFlutter)) {
    Write-Output "Skipped PID $($entry.Pid): it no longer belongs to this workspace."
    continue
  }

  Stop-Process -Id ([int]$entry.Pid) -Force
  Write-Output "Stopped $($entry.Name)."
}

Remove-Item -LiteralPath $pidFile -Force
