# OpenChamber local Electron install helpers (Windows PowerShell)
# Usage (from repo root):
#   . .\scripts\windows-electron-env.ps1
#   bun install
#   bun run --cwd packages/electron ensure:electron
#   bun run electron:dev

$env:NODE_OPTIONS = if ($env:NODE_OPTIONS) {
  if ($env:NODE_OPTIONS -notmatch '--use-system-ca') {
    "$env:NODE_OPTIONS --use-system-ca"
  } else {
    $env:NODE_OPTIONS
  }
} else {
  "--use-system-ca"
}

# Prefer npmmirror when GitHub / Electron CDN TLS fails or is slow in CN networks.
if (-not $env:ELECTRON_MIRROR) {
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
}
if (-not $env:SHARP_DIST_BASE_URL) {
  $env:SHARP_DIST_BASE_URL = "https://npmmirror.com/mirrors/sharp-libvips/"
}

Write-Host "[openchamber] NODE_OPTIONS=$env:NODE_OPTIONS"
Write-Host "[openchamber] ELECTRON_MIRROR=$env:ELECTRON_MIRROR"
Write-Host "[openchamber] SHARP_DIST_BASE_URL=$env:SHARP_DIST_BASE_URL"
Write-Host "[openchamber] bunfig.toml uses install.linker=hoisted (avoids Windows MAX_PATH with isolated .bun nests)"
