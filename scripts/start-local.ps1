param(
  [int]$BackendPort = 3000,
  [int]$AdminPort = 3100,
  [int]$FlutterPort = 5173,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
$workspaceDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backendDirectory = Join-Path $workspaceDirectory 'backend'
$adminDirectory = Join-Path $workspaceDirectory 'admin-panle'
$flutterDirectory = Join-Path $workspaceDirectory 'app'
$logDirectory = Join-Path $workspaceDirectory '.local-logs'
$pidFile = Join-Path $workspaceDirectory '.local-services.json'

foreach ($directory in @($backendDirectory, $adminDirectory, $flutterDirectory)) {
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    throw "Service directory was not found: $directory"
  }
}

$npmCommand = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
$flutterCommand = (Get-Command flutter.bat -ErrorAction SilentlyContinue).Source
if (-not $npmCommand) { throw 'npm.cmd was not found on PATH.' }
if (-not $flutterCommand) { throw 'flutter.bat was not found on PATH.' }

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Get-Listener([int]$Port) {
  Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Assert-PortAvailable([int]$Port) {
  $listener = Get-Listener $Port
  if ($listener) {
    throw "Port $Port is already used by PID $($listener.OwningProcess). Stop that service or choose another port."
  }
}

foreach ($port in @($BackendPort, $AdminPort, $FlutterPort)) {
  Assert-PortAvailable $port
}

function Ensure-ProductionBuild([string]$Directory, [string]$Name) {
  $buildId = Join-Path $Directory '.next\BUILD_ID'
  if (-not (Test-Path -LiteralPath $buildId -PathType Leaf)) {
    throw "Missing production build for $Name. Run npm run local:start:build."
  }
}

function Wait-ForPort([int]$Port, [string]$Name) {
  for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
    $listener = Get-Listener $Port
    if ($listener) { return $listener }
    Start-Sleep -Milliseconds 500
  }
  throw "$Name did not open port $Port within one minute. Check .local-logs for details."
}

if ($Build) {
  foreach ($entry in @(
    @{ Directory = $backendDirectory; Name = 'Backend' },
    @{ Directory = $adminDirectory; Name = 'Admin panel' }
  )) {
    Write-Output "Building $($entry.Name)..."
    $buildProcess = Start-Process -FilePath $npmCommand -ArgumentList @('run', 'build') -WorkingDirectory $entry.Directory -Wait -PassThru
    if ($buildProcess.ExitCode -ne 0) {
      throw "$($entry.Name) build failed with exit code $($buildProcess.ExitCode)."
    }
  }
}

Ensure-ProductionBuild $backendDirectory 'Backend'
Ensure-ProductionBuild $adminDirectory 'Admin panel'

$processes = @()

function Start-ServiceProcess(
  [string]$Name,
  [string]$Directory,
  [string[]]$Arguments,
  [string]$StdoutPath,
  [string]$StderrPath
) {
  $process = Start-Process `
    -FilePath $npmCommand `
    -ArgumentList $Arguments `
    -WorkingDirectory $Directory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru
  Write-Host "$Name started with launcher PID $($process.Id)."
  return @{ Name = $Name; Pid = $process.Id; Directory = $Directory }
}

$backendLauncher = Start-ServiceProcess `
  -Name 'Backend API' `
  -Directory $backendDirectory `
  -Arguments @('run', 'start') `
  -StdoutPath (Join-Path $logDirectory 'backend.stdout.log') `
  -StderrPath (Join-Path $logDirectory 'backend.stderr.log')
$backendListener = Wait-ForPort $BackendPort 'Backend API'
$processes += @{ Name = 'Backend API'; Pid = $backendListener.OwningProcess; Port = $BackendPort; Directory = $backendDirectory }

$adminLauncher = Start-ServiceProcess `
  -Name 'Admin panel' `
  -Directory $adminDirectory `
  -Arguments @('run', 'start') `
  -StdoutPath (Join-Path $logDirectory 'admin.stdout.log') `
  -StderrPath (Join-Path $logDirectory 'admin.stderr.log')
$adminListener = Wait-ForPort $AdminPort 'Admin panel'
$processes += @{ Name = 'Admin panel'; Pid = $adminListener.OwningProcess; Port = $AdminPort; Directory = $adminDirectory }

$flutterStdout = Join-Path $logDirectory 'flutter.stdout.log'
$flutterStderr = Join-Path $logDirectory 'flutter.stderr.log'
$flutterProcess = Start-Process `
  -FilePath $flutterCommand `
  -ArgumentList @('run', '-d', 'chrome', '--web-hostname', 'localhost', '--web-port', $FlutterPort.ToString()) `
  -WorkingDirectory $flutterDirectory `
  -WindowStyle Hidden `
  -RedirectStandardOutput $flutterStdout `
  -RedirectStandardError $flutterStderr `
  -PassThru
Write-Host "Flutter Web started with launcher PID $($flutterProcess.Id)."
$flutterListener = Wait-ForPort $FlutterPort 'Flutter Web'
$processes += @{ Name = 'Flutter Web'; Pid = $flutterListener.OwningProcess; Port = $FlutterPort; Directory = $flutterDirectory }

$processes | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8
Write-Output ''
Write-Output 'Local services are starting:'
Write-Output "  Flutter Web:    http://localhost:$FlutterPort"
Write-Output "  Backend API:    http://localhost:$BackendPort"
Write-Output "  Admin panel:    http://localhost:$AdminPort/login"
Write-Output "  Logs:           $logDirectory"
Write-Output 'Stop everything with: npm run local:stop'
