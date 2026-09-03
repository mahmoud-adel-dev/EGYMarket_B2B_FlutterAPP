param(
  [int]$BackendPort = 3000,
  [int]$AdminPort = 3100,
  [int]$FlutterPort = 5173,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'start-local.ps1') `
  -BackendPort $BackendPort `
  -AdminPort $AdminPort `
  -FlutterPort $FlutterPort `
  -Build:$Build
