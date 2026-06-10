param(
    [switch]$Download,
    [string]$Date,
    [int]$Limit = 0
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvPython = Join-Path $scriptDir '.venv\Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
    Write-Host 'Local venv not found, creating .venv...'
    py -m venv .venv
    & (Join-Path $scriptDir '.venv\Scripts\pip.exe') install -r (Join-Path $scriptDir 'requirements.txt')
}

Write-Host 'Running teacher HTML parser in local venv...'

$parserArgs = @('.\teacher_parser.py', '--skip-download')
if ($Download) {
    $parserArgs = @('.\teacher_parser.py')
    if ($Date) {
        $parserArgs += @('--date', $Date)
    }
    Write-Host 'Mode: download teacher HTML + parse to CSV'
} else {
    Write-Host 'Mode: parse existing local teacher HTML only (no download)'
}

if ($Limit -gt 0) {
    $parserArgs += @('--limit', $Limit)
    Write-Host "Parse limit: $Limit HTML file(s)"
}

& $venvPython @parserArgs
