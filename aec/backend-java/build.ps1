# Builds the AEC Java dispatch service with a plain JDK (no Maven/Gradle).
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $root "src"
$output = Join-Path $root "out"

if (-not (Get-Command javac -ErrorAction SilentlyContinue)) {
    Write-Error "javac was not found. Install a JDK 17+ and add it to PATH, then run this script again."
}

if (Test-Path $output) { Remove-Item -Recurse -Force $output }
New-Item -ItemType Directory -Force -Path $output | Out-Null

$files = Get-ChildItem -Path $source -Filter *.java -Recurse | ForEach-Object { $_.FullName }
& javac -encoding UTF-8 -d $output $files
if ($LASTEXITCODE -ne 0) { Write-Error "Compilation failed." }

Write-Host "Built AEC Java dispatch service -> $output"
Write-Host "Run it with: .\run.ps1"
