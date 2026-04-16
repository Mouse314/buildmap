param(
    [switch]$Download,
    [string]$Date
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvPython = Join-Path $scriptDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    Write-Host 'Local venv not found, creating .venv...'
    py -m venv .venv
}

Write-Host 'Running parser in local venv...'

$parserArgs = @('.\parser.py', '--skip-download')
if ($Download) {
    $parserArgs = @('.\parser.py')
    if ($Date) {
        $parserArgs += @('--date', $Date)
    }
    Write-Host 'Mode: download + parse'
} else {
    Write-Host 'Mode: parse existing local PDFs only (no download)'
}

& $venvPython @parserArgs
