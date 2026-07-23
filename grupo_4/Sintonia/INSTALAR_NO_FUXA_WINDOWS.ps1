param(
  [Parameter(Mandatory=$true)]
  [string]$FuxaRoot
)

$ErrorActionPreference = "Stop"
$source = Join-Path $PSScriptRoot "resources\pid-tuning"
$destination = Join-Path $FuxaRoot "_appdata\_upload_files\pid-tuning"

if (-not (Test-Path $source)) {
  throw "Pasta de origem não encontrada: $source"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $destination -Recurse -Force

Write-Host "Tela instalada em: $destination" -ForegroundColor Green
Write-Host "URL esperada: http://localhost:1881/resources/pid-tuning/index.html" -ForegroundColor Cyan
Write-Host "Reinicie o FUXA caso a tela não apareça imediatamente."
