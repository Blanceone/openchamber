# OpenWiki (OpenChamber)

Embeds the npm `openwiki` documentation agent into OpenChamber for **code-mode**
wikis stored under `<project>/.wiki/`.

## Contracts

- Durable artifacts live in `.wiki/` only (plus a job-scoped `openwiki` junction).
- Never call OpenWiki CLI `ensureCodeModeRepoSetup` (no root `AGENTS.md` / CI).
- Child-process worker runs the agent; telemetry forced off.
- **LLM inference** goes through a job-scoped loopback OpenAI-compatible gateway
  (`llm-gateway.js`). Real provider secrets stay in the OpenChamber process;
  the child only receives `OPENAI_COMPATIBLE_BASE_URL` + a short-lived job token.
  The gateway remembers thinking-model `reasoning_content` keyed by tool_call id
  and re-injects it on later turns (LangChain OpenAI clients drop the field).
- Upstream resolution (`llm-upstream.js`) uses OpenCode `auth.json` / provider
  config. Free-tier `opencode` / `opencode-go` models may attempt Zen anonymously;
  paid Zen models need a connected API key. Also maps Anthropic Messages,
  Google `generateContent`, GitHub Copilot (endpoint probe), and ChatGPT OAuth
  (Codex Responses) through gateway translators in `llm-chat.js`.
- Settings `openWikiModelOverride` wins over the request/composer model when set.
- Document language is fixed to Simplified Chinese (`zh-CN`). Settings and request
  bodies cannot override it. Every job passes `language: zh-CN` and injects a
  Chinese-language mandate into the format user message (`language.js`).
- Foreign/unmanaged wiki trees require consent (`adopt` | `backup-rebuild`).
- Packaged Electron resolves `process.resourcesPath/openwiki` (see `prepare:openwiki`).
  Production deps ship as `vendor_modules` (electron-builder strips `node_modules`
  from `extraResources`); the runner binds `node_modules` → `vendor_modules` before spawn.
  `better-sqlite3` is rebuilt for the Electron ABI (`rebuild:openwiki-native`) because the
  worker runs under `ELECTRON_RUN_AS_NODE`.
- Routes resolve the project directory via async `resolveProjectDirectory(req)`
  (`{ directory, error }`); never treat that helper as a sync string path.
- Do not fork the `openwiki` package for model plumbing — upgrade upstream by
  bumping the pinned version and re-staging the Electron bundle.

See root `docs/OPENWIKI_INTEGRATION.md` for the full product spec.

## Files

| File | Role |
|---|---|
| `paths.js` | `.wiki` / bind / marker paths |
| `ownership.js` | absent / managed / foreign / conflict |
| `format.js` / `presets.js` | `INSTRUCTIONS.md` + `FORMAT.md` |
| `language.js` | Fixed document language `zh-CN` + prompt text |
| `llm-upstream.js` | OpenCode model → upstream target for the gateway |
| `llm-chat.js` | OpenAI chat/completions forward + Anthropic / Google / Responses translation |
| `llm-reasoning.js` | Job-scoped `reasoning_content` capture/reinject for thinking + tools |
| `llm-gateway.js` | Loopback HTTP gateway (job token, 127.0.0.1 only) |
| `model-bridge.js` | Child env (gateway URL + token) + readiness helpers |
| `bind.js` | Windows junction / POSIX symlink |
| `job-store.js` | In-memory jobs |
| `runner.js` / `worker.mjs` | Async child process (`ELECTRON_RUN_AS_NODE` in Electron) |
| `worker-runtime.js` | Resolve worker binary/env for Node vs Electron |
| `routes.js` | `/api/openwiki/*` |
| `resolve-package.js` | Locate installed/bundled `openwiki` |

## Routes

- `GET /api/openwiki/status`
- `POST /api/openwiki/preflight`
- `GET|PUT /api/openwiki/format`, `GET /api/openwiki/format/presets`
- `POST /api/openwiki/consent` (adopt / backup-rebuild only)
- `POST /api/openwiki/generate` (`init`), `POST /api/openwiki/update`
- `GET /api/openwiki/job`, `GET /api/openwiki/progress`, `POST /api/openwiki/cancel`
