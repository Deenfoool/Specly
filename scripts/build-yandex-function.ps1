$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $repoRoot 'dist'
$functionRoot = Join-Path $distRoot 'function'
$serverRoot = Join-Path $functionRoot 'server'
$outputZip = Join-Path $distRoot 'specly-yandex-function.zip'

if (Test-Path $functionRoot) {
    Remove-Item $functionRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $serverRoot -Force | Out-Null

Copy-Item (Join-Path $repoRoot 'yandex-function.js') $functionRoot
Copy-Item (Join-Path $repoRoot 'package.json') $functionRoot
Copy-Item (Join-Path $repoRoot 'server\src') $serverRoot -Recurse

if (Test-Path $outputZip) {
    Remove-Item $outputZip -Force
}

Compress-Archive -Path (Join-Path $functionRoot '*') -DestinationPath $outputZip -Force

Write-Host ''
Write-Host 'Specly Yandex Cloud Function package created:' -ForegroundColor Green
Write-Host $outputZip
Write-Host ''
Write-Host 'Expected ZIP root:' -ForegroundColor Cyan
Write-Host '  yandex-function.js'
Write-Host '  package.json'
Write-Host '  server/src/...'
Write-Host ''
Write-Host 'Yandex Cloud settings:' -ForegroundColor Cyan
Write-Host '  Runtime: Node.js 22'
Write-Host '  Entry point: yandex-function.handler'
Write-Host '  Timeout: 30 sec'
Write-Host '  Memory: 256 MB+'
