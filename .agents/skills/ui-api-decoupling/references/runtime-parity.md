# Runtime API And Parity

## Extending `RuntimeAPIs`

1. Add or extend the shared interface in `packages/ui/src/lib/api/types.ts`.
2. Implement web/desktop behavior under `packages/web/src/api/*` and compose it in `packages/web/src/api/index.ts`.
3. Keep Electron shared through the web runtime unless behavior is inherently native (then use main/preload IPC).
4. Register APIs through app entrypoints and consume via `RuntimeAPIProvider` hooks.

React components use `useRuntimeAPIs()` or `useRuntimeAPI()`. Non-React modules use `getRegisteredRuntimeAPIs()` only when hooks are impossible. Do not introduce direct reads of `window.__OPENCHAMBER_RUNTIME_APIS__` in feature code.

## Electron Boundary

Electron reuses the web runtime/server implementation. Keep privileged shell behavior behind main/preload IPC and local-page gates.

- API base and shell identity may be broadly available for routing.
- Client tokens, home paths, filesystem/shell access, and privileged IPC remain local-page gated.
- Do not trust arbitrary loopback, `file://`, or `about:blank` origins as packaged UI.
- Remote pages and preview iframes must not gain local host privileges.
- Deep links that import hosts, store credentials, or switch runtimes require explicit in-app confirmation before mutation.

## Shared Contract Rule

This monorepo ships **Windows Electron desktop only**. For every shared capability, decide desktop/web-server behavior explicitly. Do not add VS Code, Capacitor, or other product-surface branches unless the product scope is expanded again. A stable unsupported response is acceptable for optional API members; accidental fallthrough is not.
