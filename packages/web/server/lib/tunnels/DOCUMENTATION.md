# Tunnels Module Documentation

## Local-desktop status

Tunnel provider orchestration, HTTP routes, and Cloudflare/ngrok providers were
removed from this local Windows desktop build. Management APIs are answered with
HTTP 410 via `packages/web/server/lib/local-desktop-remote.js`.

## What remains

- `packages/web/server/lib/tunnels/types.js`: settings normalization helpers and
  tunnel mode/provider constants still used when sanitizing persisted settings
  fields (`managedRemoteTunnelPresets`, TTLs, etc.).
- `types.test.js`: unit coverage for those helpers.

Do not reintroduce provider child-process code or route registration without an
explicit product-scope change.
