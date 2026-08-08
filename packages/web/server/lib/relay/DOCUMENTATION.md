# Relay Module Documentation

## Local-desktop status

Private-relay host client, E2EE, tunnel multiplexing, and management routes were
removed from this local Windows desktop build. Related HTTP surfaces return 410
via `packages/web/server/lib/local-desktop-remote.js`. APNs / relay signing-key
boot wiring was replaced with a disabled APNs stub in the same module.

Desktop realtime transport lives in `packages/ui/src/lib/runtime-transport/`
(native WebSocket helpers only). Do not reintroduce a private-relay client
without an explicit product-scope change.
