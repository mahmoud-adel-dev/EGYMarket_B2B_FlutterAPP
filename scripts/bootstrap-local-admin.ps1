param(
  [string]$Name = 'memo',
  [string]$Email = 'memo@seals.local'
)

$ErrorActionPreference = 'Stop'
$backendDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\backend'))
$password = $null

try {
  $securePassword = Read-Host 'Enter a local admin password (12+ characters)' -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }

  if ([string]::IsNullOrWhiteSpace($password) -or $password.Length -lt 12) {
    throw 'Admin password must be at least 12 characters. The requested 123456 password is intentionally rejected.'
  }

  $oldName = $env:ADMIN_BOOTSTRAP_NAME
  $oldEmail = $env:ADMIN_BOOTSTRAP_EMAIL
  $oldPassword = $env:ADMIN_BOOTSTRAP_PASSWORD
  try {
    $env:ADMIN_BOOTSTRAP_NAME = $Name
    $env:ADMIN_BOOTSTRAP_EMAIL = $Email
    $env:ADMIN_BOOTSTRAP_PASSWORD = $password
    Push-Location $backendDirectory
    $envFiles = @('--env-file=.env')
    if (Test-Path -LiteralPath '.env.local' -PathType Leaf) {
      $envFiles += '--env-file=.env.local'
    }
    & node @envFiles scripts/create-admin.mjs
    if ($LASTEXITCODE -ne 0) { throw "Admin bootstrap failed with exit code $LASTEXITCODE." }
  } finally {
    Pop-Location
    $env:ADMIN_BOOTSTRAP_NAME = $oldName
    $env:ADMIN_BOOTSTRAP_EMAIL = $oldEmail
    $env:ADMIN_BOOTSTRAP_PASSWORD = $oldPassword
  }
} finally {
  $password = $null
}
