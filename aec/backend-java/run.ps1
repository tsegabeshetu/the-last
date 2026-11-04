# Runs the AEC Java dispatch service (builds first if needed).
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$output = Join-Path $root "out"

if (-not (Test-Path (Join-Path $output "aec\dispatch\Main.class"))) {
    & (Join-Path $root "build.ps1")
}

$port = if ($env:AEC_JAVA_PORT) { $env:AEC_JAVA_PORT } else { "8081" }
Write-Host "Starting AEC dispatch service on http://127.0.0.1:$port"
& java -cp $output aec.dispatch.Main
