# Repair Electron binary + common Windows install issues.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File .\scripts\repair-windows-electron.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

. "$PSScriptRoot\windows-electron-env.ps1"

Write-Host "[repair] bun install --linker hoisted (matches bunfig.toml; avoids MAX_PATH)"
$env:ELECTRON_SKIP_BINARY_DOWNLOAD = "1"
bun install --linker hoisted

Write-Host "[repair] Ensuring Electron binary via packages/electron/node_modules/electron/install.js"
$elec = Join-Path $repoRoot "packages\electron\node_modules\electron"
if (-not (Test-Path (Join-Path $elec "install.js"))) {
  throw "Electron package not found at $elec after bun install."
}

Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
Push-Location $elec
try {
  node .\install.js
} finally {
  Pop-Location
}

$pathTxt = Join-Path $elec "path.txt"
$exe = Join-Path $elec "dist\electron.exe"
if (-not (Test-Path $pathTxt) -or -not (Test-Path $exe)) {
  throw "Electron install finished but dist/electron.exe or path.txt is missing."
}

Write-Host "[repair] Electron OK: $exe ($((Get-Item $exe).Length) bytes)"
Write-Host "[repair] Running ensure:electron"
bun run --cwd packages/electron ensure:electron
Write-Host "[repair] Done. Next: bun run electron:dev"
