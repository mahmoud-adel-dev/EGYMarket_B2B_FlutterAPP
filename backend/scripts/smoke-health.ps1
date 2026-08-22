param([int]$Port = 3100)

$ErrorActionPreference = 'Stop'

$backendDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$server = Start-Process `
  -FilePath 'node' `
  -ArgumentList @('node_modules/next/dist/bin/next', 'start', '-p', $Port.ToString()) `
  -WorkingDirectory $backendDirectory `
  -WindowStyle Hidden `
  -PassThru

try {
  $live = $null
  for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
    try {
      $live = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health/live" -TimeoutSec 2
      break
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if ($null -eq $live) { throw 'Server did not become live.' }
  try {
    $ready = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health/ready" -TimeoutSec 15
  } catch {
    throw 'The application is live, but readiness failed. Verify MONGODB_URI, Atlas credentials, and Atlas network access.'
  }
  Write-Output "LIVE $($live | ConvertTo-Json -Compress)"
  Write-Output "READY $($ready | ConvertTo-Json -Compress)"
} finally {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
