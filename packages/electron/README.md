# OpenChamber Desktop (Windows)

Electron desktop runtime for OpenChamber on Windows.

This package owns the native shell: windows, menus, session deep links, native notifications, auto-updates, and packaged Windows builds. The web UI and OpenChamber server logic still live in `packages/web` and shared React UI lives in `packages/ui`.

The product surface is **local desktop + Git/GitHub**. OpenChamber remote hosts, Private Relay, external tunnels, and OpenChamber-over-SSH are not part of the shipped desktop UI.

## How It Runs

Desktop starts the OpenChamber web server in the same Electron main process. There is no separate sidecar subprocess for the OpenChamber server.

`main.mjs` imports `@openchamber/web/server/index.js` and calls `startWebUiServer()`. The Electron window then loads the UI from the local server in development, or from packaged `resources/web-dist` assets in packaged builds.

Same-origin session-chat iframes complete an authenticated parent-frame handshake before creating their SDK client. The parent supplies its active in-memory endpoint and credentials. Credentials are never placed in iframe URLs, and other child pages do not receive this runtime state.

The preload bridge exposes desktop-only APIs to the web UI through `window.__OPENCHAMBER_DESKTOP__`. Privileged commands are checked in `main.mjs`, not only in the UI.

## Main Files

| File | Purpose |
|------|---------|
| `main.mjs` | Electron main process, app lifecycle, windows, menus, session deep links, native IPC handlers, updates, local server startup |
| `startup-url-selection.mjs` | Pure bundled/HMR startup probe and loopback connection-limit policy |
| `preload.mjs` | Safe bridge from the rendered UI to Electron IPC |
| `ssh-manager.mjs` | No-op stub retained for IPC compatibility (OpenChamber remote SSH is disabled) |
| `scripts/electron-dev.mjs` | Desktop dev launcher with Vite HMR support |
| `scripts/ensure-electron.mjs` | Verifies the installed Electron binary is complete and repairs it via the postinstall under Bun |
| `scripts/build-web-assets.mjs` | Builds `packages/web` and stages UI assets into `resources/web-dist` |
| `scripts/prepare-opencode-cli.mjs` | Downloads and stages the pinned OpenCode CLI into `resources/opencode-cli` |
| `scripts/prepare-openwiki.mjs` | Stages pinned `openwiki@0.3.1` + production deps into `resources/openwiki` |
| `scripts/bundle-main.mjs` | Bundles Electron main code into `dist-bundle/main.mjs` for packaging |
| `scripts/rebuild-native.mjs` | Rebuilds native modules against the Electron runtime |
| `scripts/package.mjs` | Runs `electron-builder` for Windows NSIS; unsigned when signing env is missing |
| `resources/` | Packaged web assets and icons |

## Development

From the repo root:

```bash
bun install
bun run electron:dev
```

`bun run electron:dev` starts the web dev server with HMR, then launches Electron against `packages/electron/main.mjs`.

The Electron workspace package trusts Electron's install script so `bun install` downloads the platform runtime in fresh checkouts and worktrees.

Electron's postinstall (`node install.js`) is run by `bun install` with the system Node. Under Node 24, the bundled `extract-zip@2.0.1` silently unpacks only the first entry of the Electron zip, leaving `dist/` without the binary and `path.txt` missing. To keep this from blocking desktop work:

- The root `postinstall` runs `ensure-electron.mjs --best-effort`, which detects an incomplete Electron install and repairs it by re-running the postinstall under Bun.
- `electron-dev.mjs` runs the same check (fail-fast) before launching.
- On demand: `bun run --cwd packages/electron ensure:electron`.

Useful variants:

```bash
bun run electron:dev:bundled
bun run --cwd packages/electron ensure:electron
bun run type-check:electron
bun run lint:electron
```

## Packaging

From the repo root (Windows host):

```bash
bun run electron:build
```

That runs, in order:

1. `build:web-assets` to build the web UI and copy it into `packages/electron/resources/web-dist`.
2. `prepare:opencode-cli` to download/cache the pinned OpenCode CLI and copy it into `packages/electron/resources/opencode-cli`.
3. `prepare:openwiki` to install/cache pinned `openwiki@0.3.1` (from `../depends/npm-packs`) and stage it into `packages/electron/resources/openwiki` with production deps in `vendor_modules` (electron-builder strips `node_modules` from `extraResources`).
4. `rebuild:openwiki-native` to rebuild `better-sqlite3` against the Electron ABI (worker uses `ELECTRON_RUN_AS_NODE`).
5. `verify:openwiki` to assert required OpenWiki runtime packages and the native addon are staged.
6. `bundle:main` to create `packages/electron/dist-bundle/main.mjs`.
7. `rebuild:native` to rebuild app native modules (`node-pty`, `bun-pty`) for Electron.
8. `package.mjs` to run the workspace-installed `electron-builder` CLI with `--win` (NSIS), then `verify:openwiki:packaged`.

Build output goes to `packages/electron/dist`.

Windows packaging needs NSIS support through `electron-builder`. If no Windows signing env is set, `package.mjs` disables code signing and builds an unsigned installer. Windows updates use `latest.yml` for x64 and the `latest-arm64.yml` channel for ARM64 so each installation resolves an architecture-matching installer.

On this workstation, prefer `ELECTRON_CACHE` / `ELECTRON_BUILDER_CACHE` under `../depends`, and install VS Build Tools (C++ workload + Windows SDK + Spectre libs) under `D:\work\ai\builder_tools`. Microsoft Windows Kits headers still land in the OS default Kits path.

## Bundled OpenCode CLI

Packaged Desktop builds include the official OpenCode CLI that matches the pinned `@opencode-ai/sdk` version in the root `package.json`. `prepare:opencode-cli` downloads the Windows release artifact, prefers cache under `../depends/opencode-cli` (override with `OPENCHAMBER_OPENCODE_CLI_CACHE`), stages `opencode.exe` into `resources/opencode-cli`, and verifies `opencode --version` before packaging. On Windows the download helper uses `curl.exe --ssl-no-revoke` when Node `fetch` fails TLS revocation checks.

Managed local Desktop startup prefers OpenCode binaries in this order:

1. `settings.opencodeBinary`.
2. Environment overrides: `OPENCODE_BINARY`, `OPENCODE_PATH`, `OPENCHAMBER_OPENCODE_PATH`, or `OPENCHAMBER_OPENCODE_BIN`.
3. The bundled Desktop CLI in `process.resourcesPath/opencode-cli`.
4. System installs discovered from PATH.
5. Known npm/Bun/Scoop/Chocolatey and other standard install locations.
6. Platform discovery through `where opencode` on Windows.

Git remotes (for example GitHub over Git SSH or HTTPS) use the normal Git tooling configured in Settings → Git. That is separate from the disabled OpenChamber remote-host SSH feature.
