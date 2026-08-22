param(
  [int]$BackendPort = 3000,
  [int]$WebPort = 5173,
  [string]$WebHost = 'localhost'
)

$ErrorActionPreference = 'Stop'

$workspaceDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendDirectory = [System.IO.Path]::GetFullPath((Join-Path $workspaceDirectory 'backend'))
$appDirectory = [System.IO.Path]::GetFullPath((Join-Path $workspaceDirectory 'app'))
# Resolve flutter from PATH; fall back to a conventional install location.
$flutterCmd = Get-Command flutter -ErrorAction SilentlyContinue
if ($flutterCmd) {
  $flutterExecutable = $flutterCmd.Source
} elseif (Test-Path 'C:\src\flutter\bin\flutter.bat') {
  $flutterExecutable = 'C:\src\flutter\bin\flutter.bat'
} else {
  throw 'flutter was not found on PATH (and C:\src\flutter is absent).'
}
$chromeCandidate = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chromeCandidate) { throw 'Chrome was not found in standard locations.' }
$chromeExecutable = $chromeCandidate
$appUrl = "http://$WebHost`:$WebPort"
$launchUrl = "$appUrl/?dev_run=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"

if (-not (Test-Path -LiteralPath $backendDirectory -PathType Container)) {
  throw "Backend directory was not found: $backendDirectory"
}
if (-not (Test-Path -LiteralPath $appDirectory -PathType Container)) {
  throw "Flutter directory was not found: $appDirectory"
}
if (-not (Test-Path -LiteralPath $flutterExecutable -PathType Leaf)) {
  throw "Flutter executable was not found: $flutterExecutable"
}
if (-not (Test-Path -LiteralPath $chromeExecutable -PathType Leaf)) {
  throw "Chrome executable was not found: $chromeExecutable"
}

function Get-ListeningProcess([int]$Port) {
  return Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

$backendListener = Get-ListeningProcess -Port $BackendPort
if (-not $backendListener) {
  $env:APP_ORIGIN = $appUrl
  $env:APP_ORIGINS = "http://127.0.0.1:$WebPort"
  $backendProcess = Start-Process `
    -FilePath 'node' `
    -ArgumentList @('node_modules/next/dist/bin/next', 'dev', '-p', $BackendPort.ToString()) `
    -WorkingDirectory $backendDirectory `
    -WindowStyle Hidden `
    -PassThru
  Write-Output "Backend started (PID $($backendProcess.Id))."
} else {
  Write-Output "Backend already listening on port $BackendPort."
}

$webListener = Get-ListeningProcess -Port $WebPort
if (-not $webListener) {
  $flutterProcess = Start-Process `
    -FilePath $flutterExecutable `
    -ArgumentList @('run', '--profile', '--dart-define=ALLOW_LOCAL_PRODUCT_MODE=true', '-d', 'web-server', '--web-hostname', $WebHost, '--web-port', $WebPort.ToString()) `
    -WorkingDirectory $appDirectory `
    -WindowStyle Hidden `
    -PassThru

  for ($attempt = 0; $attempt -lt 240; $attempt += 1) {
    if (Get-ListeningProcess -Port $WebPort) { break }
    if ($flutterProcess.HasExited) {
      throw "Flutter web process exited before it opened port $WebPort."
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not (Get-ListeningProcess -Port $WebPort)) {
    throw "Flutter web did not open port $WebPort within two minutes."
  }
  Write-Output "Flutter web started (PID $($flutterProcess.Id))."
} else {
  Write-Output "Flutter web already listening on port $WebPort."
}

Start-Process -FilePath $chromeExecutable -ArgumentList @($launchUrl)
Write-Output "Chrome opened at $launchUrl"
