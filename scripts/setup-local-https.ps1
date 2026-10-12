$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $projectRoot 'server\certs'
$certificatePath = Join-Path $certificateDirectory 'localhost.pem'
$keyPath = Join-Path $certificateDirectory 'localhost-key.pem'

if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
  throw 'mkcert is required. Install it with: winget install FiloSottile.mkcert'
}

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

& mkcert -install
if ($LASTEXITCODE -ne 0) {
  throw 'mkcert could not install its local certificate authority.'
}

& mkcert -cert-file $certificatePath -key-file $keyPath localhost 127.0.0.1 ::1
if ($LASTEXITCODE -ne 0) {
  throw 'mkcert could not generate the local HTTPS certificate.'
}

Write-Host 'Local HTTPS certificates are ready and excluded from version control.'
Write-Host 'Start the API with: cd server; npm run dev'
Write-Host 'Start the frontend in another terminal with: cd client; npm run dev'
Write-Host 'Open https://localhost:5173'
