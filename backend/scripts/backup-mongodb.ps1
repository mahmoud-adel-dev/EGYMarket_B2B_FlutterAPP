param(
  [Parameter(Mandatory = $false)]
  [string]$OutputDirectory = ".\backups"
)

$databaseUri = $env:MONGODB_URI
if ([string]::IsNullOrWhiteSpace($databaseUri)) {
  throw "MONGODB_URI is required."
}
if (-not (Get-Command mongodump -ErrorAction SilentlyContinue)) {
  throw "mongodump was not found. Install MongoDB Database Tools first."
}

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archivePath = Join-Path $resolvedOutput "seals-$timestamp.archive.gz"

# Pass the URI via the environment (mongodump reads MONGODB_URI) instead of the
# command line, where credentials would be visible in process listings.
$env:MONGODB_URI = $databaseUri
& mongodump --archive=$archivePath --gzip
if ($LASTEXITCODE -ne 0) {
  throw "MongoDB backup failed with exit code $LASTEXITCODE."
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath
Write-Output "Backup created: $archivePath"
Write-Output "SHA256: $($hash.Hash)"
