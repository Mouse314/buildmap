$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvPython = Join-Path $scriptDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    Write-Host 'Local venv not found, creating .venv...'
    py -m venv .venv
}

Write-Host 'Running parser in local venv...'
& $venvPython .\parser.py
