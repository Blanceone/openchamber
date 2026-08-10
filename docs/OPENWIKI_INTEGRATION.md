# OpenWiki Integration Spec

Status: **Accepted** (ready for implementation)  
Date: 2026-08-08  
Related trees:

- OpenChamber: `D:\work\ai\openchamber\openchamber`
- OpenWiki: `D:\work\ai\openwiki`

## 1. Goals

Embed OpenWiki into the Windows OpenChamber desktop product so a user can:

1. Open a **native wiki browser** (directory tree + Markdown reader) from the context rail.
2. Configure wiki behavior in **Settings** (paths, mode, generation options) — **without a second model/provider credential UI**. Document language is fixed to Simplified Chinese (`zh-CN`) and is not user-configurable.
3. **Generate** (full regenerate / `init`) and **Update** (incremental) a **code-mode** wiki for the current project, reusing the **same model and OpenCode credentials** the user already selected for OpenChamber / OpenCode.
4. Ship `openwiki` as a **workspace dependency** and, for release builds, **bundle it with the Electron package** so the feature works without a separate global `openwiki` install.
5. Persist OpenChamber-managed wiki artifacts under the project’s **`.wiki/`** directory (long-lived). Do not touch root agent docs, CI, or other project files outside that sandbox. If a wiki-like tree already exists and may be project-owned, **require explicit user consent** before any OpenWiki write.
6. Let teams **customize wiki document structure and writing format** (e.g. architecture design, module detailed design) so generated pages follow project conventions, not only OpenWiki’s default outline.

Non-goals for this integration slice:

- Embedding OpenWiki’s official CDN graph visualizer (`openwiki visualize`).
- Re-hosting OpenWiki’s Ink TUI.
- OpenWiki **personal** mode (`~/.openwiki/wiki`, connectors, OAuth wizards). Out of scope for v1.
- OpenWiki **PostHog / usage telemetry** (always off for embedded runs; no Settings toggle to turn it on).
- Modifying the separate `../opencode` repository.

## 2. Product decisions (locked)

| # | Decision | Choice |
|---|---|---|
| 1 | Dependency | Pin `openwiki` from the **npm registry** (exact version, verify at implement time; was `0.3.1` when drafted). Install caches under `../depends`. **Release packaging must stage the package and its production dependency tree** into Electron `extraResources` so Generate/Update works without a global install |
| 2 | Viewer | **Native only**: tree + Markdown preview in a context panel surface (no official visualizer embed) |
| 3 | Generation | Include **full regenerate** and **incremental update**; when a wiki already exists, confirm and let the user choose which |
| 4 | Model config | **No OpenWiki API-key UI.** Default job model = current OpenCode/composer selection. Settings may override with another **already-logged-in OpenCode catalog model**. Credentials always from OpenCode auth/config |
| 5 | Wiki mode | **Code mode only** (`outputMode: "repository"`, agent `cwd` = project for **reads**). No personal mode in v1 |
| 6 | Process isolation | OpenWiki work is an **async, out-of-process job**. It must not block the UI event loop or take down chat/sync/OpenCode if the wiki worker fails |
| 7 | Artifact location | Long-lived wiki store = **`<project>/.wiki/`**. All OpenChamber OpenWiki outputs go there. Must not create/update root `AGENTS.md` / `CLAUDE.md`, CI workflows, or other files outside `.wiki/` (and the transient job bind in §6.1) |
| 8 | Existing wiki consent | If the project already has wiki content that is not clearly OpenChamber-managed, **do not modify it until the user explicitly agrees** |
| 9 | Telemetry | **No PostHog.** Embedded worker always sets `OPENWIKI_TELEMETRY_DISABLED=1` (and `DO_NOT_TRACK=1`). No UI to enable OpenWiki telemetry |
| 10 | Doc format / structure | User-editable **brief + structure/format spec** under `.wiki/`, editable from Settings (and link from Wiki panel). Applied on every Generate/Update. Presets available; custom always wins when edited |

## 3. Architecture overview

```text
┌────────────────────────────── UI (packages/ui) ──────────────────────────────┐
│ Context rail "Wiki" → OpenWikiView (tree + Markdown)                         │
│ Settings → OpenWiki page (model / format editors / job prefs; language fixed) │
│ Wiki panel → browse + link to edit structure/format                          │
│ Generate / Update actions → runtimeFetch('/api/openwiki/...')                │
│ Model identity passed as providerID + modelID from useConfigStore / session  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ runtimeFetch (no secrets)
┌───────────────────────────────────▼──────────────────────────────────────────┐
│ OpenChamber server (packages/web, in-process in Electron)                    │
│  /api/openwiki/*  — status, format get/put, generate, update, progress, …  │
│  llm-gateway — loopback OpenAI-compatible proxy (job token; secrets here)    │
│  job runner — async child → openai-compatible → gateway; bind openwiki→.wiki │
│  durable store — <project>/.wiki/ (+ marker + INSTRUCTIONS + FORMAT)         │
│  consent gate — existing/foreign wiki content requires user approval         │
│  viewer reads <project>/.wiki/ via FilesAPI                                  │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
   openwiki package                                     OpenCode auth
   (dependency / bundled)                               auth.json + provider
   runOpenWikiAgent                                     config (server-only)
   (telemetry forced off; LLM via gateway)
```

### 3.1 Trust boundaries

- Provider secrets stay in the **server / Electron main-adjacent process**. The renderer never reads `auth.json` or `~/.openwiki/.env`.
- Wiki file browse/read/write uses existing **workspace FS policy** (`packages/web/server/lib/fs`). Roots outside the project require an explicit grant path (same rules as Files).
- Generation is **always user-initiated** (same principle as Walkthrough): no silent background wiki rebuilds in v1.
- Failures must not be presented as authoritative empty wiki trees (AGENTS correctness invariants).

### 3.2 Why not only `small-model`?

`generateSmallModelText` reuses OpenCode logins but is a **single-shot** completion API. OpenWiki’s documentation agent needs a **tool-calling LangChain model** (`BaseChatModel` via DeepAgents). Therefore generation must drive OpenWiki’s agent APIs (`createOpenWikiAgent` / `runOpenWikiAgent`).

**Production path (locked):** OpenChamber starts a **job-scoped loopback OpenAI-compatible LLM gateway**. The OpenWiki child always uses `OPENWIKI_PROVIDER=openai-compatible` against that gateway. The gateway performs multi-turn `chat/completions` (including `tools`) using OpenCode `auth.json` / provider config. Real API keys never enter the child environment. Direct provider-env mapping into the child is **legacy / not used** for production jobs.

## 4. Dependency and packaging

### 4.1 Workspace dependency

- Add `openwiki` as a dependency of the package that owns the server-side runner (recommended: `packages/web`).
- During development on this workstation, prefer a local link / `file:` reference to `D:\work\ai\openwiki` until a pinned published version is chosen for release.
- Caches and installs must honor local Windows path rules: dependency archives under `D:\work\ai\openchamber\depends`; toolchains under `D:\work\ai\builder_tools`.
- OpenWiki requires **Node ≥ 22** (already aligned with OpenChamber engines).

### 4.2 Import surface

`openwiki` currently publishes **no stable `exports` map** (bin-only). Integration imports deep paths after build, e.g.:

| Need | Import |
|---|---|
| Run agent | `openwiki/dist/agent/index.js` (`runOpenWikiAgent`, `createOpenWikiAgent`, `createModel`) |
| Types / events | `openwiki/dist/agent/types.js` |
| Constants / providers | `openwiki/dist/constants.js` |
| Optional graph index (not required for v1 viewer) | `openwiki/dist/visualize/graph.js` |

**Risk:** deep imports are semver-fragile. Mitigations for this integration:

1. Pin exact `openwiki` version (or local commit) in the lockfile.
2. Own a thin adapter module `packages/web/server/lib/openwiki/` that is the **only** importer of `openwiki/*`.
3. Track upstream addition of a public `exports` map; migrate when available.
4. Add contract tests that assert the adapter’s required symbols exist after install/build.

### 4.3 Electron bundling

Follow the bundled OpenCode CLI pattern (`packages/electron/scripts/prepare-opencode-cli.mjs`, `extraResources` → `process.resourcesPath`):

| Step | Behavior |
|---|---|
| Prepare | Script stages a runnable OpenWiki payload (package + production deps, platform natives) under `packages/electron/resources/openwiki/` (name TBD) with cache under `../depends` |
| Package | `electron-builder` `extraResources` copies staged tree into the app |
| Resolve | Server resolves OpenWiki entry via settings override → env → **bundled resources** → workspace `node_modules` → PATH |

**Native dependency:** OpenWiki pulls `better-sqlite3` (via LangGraph SQLite checkpointer). Packaging must:

- Ship a binary matching the **runtime that executes the agent** (bundled Node vs Electron ABI).
- Prefer **child-process execution under bundled Node** for generation jobs so Electron ABI rebuild is not required for `better-sqlite3` (recommended default).
- Keep in-process import only for lightweight helpers if needed; do not load OpenWiki’s CLI Ink entry in the renderer.

### 4.4 Execution mode (generation) — locked: async child process

OpenWiki is an **incremental add-on**. Generation/update must not degrade core OpenChamber (chat, sync, OpenCode lifecycle, settings).

**Required shape:**

1. HTTP handlers return quickly after enqueueing a job (`202` or immediate `{ jobId, status: "queued" }`); they do not await the full agent run on the request thread beyond preflight.
2. Server spawns a **Node child process** (bundled Node + staged `openwiki` in packaged builds; workspace Node + `node_modules/openwiki` in dev) running an OpenChamber-owned runner that imports OpenWiki agent APIs.
3. Child receives a **job manifest** (cwd, command, outputMode, language, model bridge payload) via stdin or a restricted temp file — **never log secrets**.
4. Child streams structured progress on stdout (NDJSON); server updates in-memory job state for `GET /api/openwiki/progress`.
5. Cancel = kill the child process tree; partial Markdown stays on disk; job → `cancelled`.
6. Child crash / OOM / native-module failure surfaces as job `failed` only — the OpenChamber server process continues serving the app.
7. At most one active job per workspace directory (`409 job-in-progress`); wiki jobs never share OpenCode’s session prompt queue.

In-process `import('openwiki')` inside the Electron server is **not** the production path (ABI + blast-radius). Unit tests may mock the runner without spawning.

## 5. Model bridge (no second configuration)

### 5.1 Source of truth for “current model”

There is no single server document for “active model”. Resolution for an OpenWiki job **must be explicit in the request**, computed by the UI from existing OpenChamber state:

**Resolution order (UI → request body):**

1. If Settings `openWikiModelOverride` is set to a valid `provider/model` that still appears in the OpenCode catalog **and** has a usable login → use it.
2. Else active session model selection (`selection-store` / last send config for the focused session), if a session is focused.
3. Else directory composer selection: `useConfigStore` `currentProviderId` + `currentModelId`.
4. Else project `defaultModel` → desktop `defaultModel` → OpenCode config default (same cascade as new chats).

Default UX: override is **unset**, so jobs follow the current OpenCode-selected model. The Settings picker only lists models from `opencodeClient.getProvidersForConfig` (logged-in / available OpenCode providers)—never a parallel OpenWiki provider list.

Wire shape on every generate/update request:

```json
{
  "directory": "D:\\\\repo",
  "mode": "code",
  "command": "init",
  "model": {
    "providerID": "anthropic",
    "modelID": "claude-opus-4"
  },
  "language": "zh-CN"
}
```

Display string form `"provider/model"` may be accepted equivalently (`parseModelRef` / `parseModelIdentifier` rules: split on first `/`).

### 5.2 Credentials

Server-side only, reuse existing OpenCode stores:

1. `resolveProviderLogin({ auth, workingDirectory, providerID })` / `readAuthFile` from `packages/web/server/lib/small-model` + `opencode/auth`.
2. Provider config `provider.<id>.options.apiKey` / `baseURL` from OpenCode config layers.

Do **not** write keys into `~/.openwiki/.env` as part of normal OpenChamber runs (avoids duplicating secrets and conflicting with CLI users). If OpenWiki APIs require env vars, set them **only in the child process environment** for the duration of the job.

### 5.3 Provider mapping OpenCode → OpenWiki gateway

The OpenWiki **child** always sees a single provider:

| Child env | Value |
|---|---|
| `OPENWIKI_PROVIDER` | `openai-compatible` |
| `OPENAI_COMPATIBLE_BASE_URL` | `http://127.0.0.1:<port>/v1` (job gateway) |
| `OPENAI_COMPATIBLE_API_KEY` | short-lived job token (not a real provider key) |
| `OPENWIKI_MODEL_ID` | OpenCode `modelID` |

The **gateway** resolves OpenCode provider IDs:

| OpenCode providerID (examples) | Gateway upstream | Notes |
|---|---|---|
| `openai` (API key) | openai-compatible → OpenAI (or config `baseURL`) | Chat Completions + tools |
| `openai` (ChatGPT OAuth / codex) | openai-responses → Codex Responses API (translated) | Tool-calling supported when the Codex backend accepts function tools; failures fail closed |
| `anthropic` (API key) | Anthropic Messages API (translated from OpenAI tools format) | Streaming synthesized as OpenAI SSE when requested |
| `openrouter` / custom with `baseURL` | openai-compatible proxy | Auth from OpenCode login/config |
| `opencode` / `opencode-go` with Zen API key | `https://opencode.ai/zen/v1` | Preferred for paid Zen models |
| `opencode` / `opencode-go` free-tier ids (e.g. `big-pickle`, `*-free`) | Zen anonymously when no key | If Zen rejects, clear `no-provider-login` style error |
| `google` / `gemini` | Google `generateContent` (translated tools) | Uses OpenCode API key; fail closed on upstream errors |
| `github-copilot` | Probe `/models` → chat / messages / responses | Same auth headers as OpenCode small-model |
| bedrock, unknown providers without `baseURL` | **Unsupported** | UI blocker: pick another logged-in model |

Gateway rules:

1. Bind `127.0.0.1` only; require `Authorization: Bearer <jobToken>`.
2. Force the job’s `modelID` on every upstream request (ignore child-supplied model).
3. Close the gateway and invalidate the token when the job ends or is cancelled.
4. Never log request bodies or secrets.

Do **not** fork the upstream `openwiki` package for this plumbing.

### 5.4 UX: model field in Settings (locked)

OpenWiki Settings **must not** ask for API keys or write `~/.openwiki/.env`.

Required model-related UI:

- **Wiki model** control: dropdown (or equivalent) of OpenCode catalog models that have usable login, same source as the composer.
- Default selection label / behavior: **“Same as current OpenCode model”** (`openWikiModelOverride = null`).
- User may pick a specific `provider/model`; persisted as `openWikiModelOverride`. Clearing returns to “follow current OpenCode model”.
- Status line shows the **resolved** model that the next job would use (override or live composer/session).
- Link/button: “Open provider settings” when `hasLogin === false` or mapping unsupported.

### 5.5 Preflight before generate/update

Before starting a job, server returns a structured preflight:

```json
{
  "ok": true,
  "wikiRoot": "D:\\\\repo\\\\.wiki",
  "projectDirectory": "D:\\\\repo",
  "command": "update",
  "model": { "providerID": "anthropic", "modelID": "claude-opus-4" },
  "mappedProvider": "anthropic",
  "hasLogin": true,
  "wikiExists": true,
  "ownership": "openchamber-managed",
  "consentRequired": false
}
```

Failure / gate codes (HTTP 4xx with `code`):

| Code | When |
|---|---|
| `no-provider-login` | No usable OpenCode credential for the provider |
| `provider-unsupported-for-openwiki` | Mapper cannot target an OpenWiki provider |
| `model-required` | Missing/invalid model on request |
| `wiki-root-invalid` | Path missing / not a directory when required |
| `wiki-consent-required` | Existing/foreign wiki detected; client must show consent UI and retry with `consent: true` |
| `wiki-already-initialized` | Client should not blind-`init` when wiki exists; UI confirms and offers **Regenerate** vs **Update** (see §6.3) |
| `directory-out-of-scope` | FS policy rejects the root |

## 6. Wiki data contract

### 6.1 Mode and storage (code only, durable `.wiki/`)

| | Path / value |
|---|---|
| Agent `cwd` (read evidence) | Project / workspace directory |
| OpenWiki `outputMode` | `repository` |
| **Durable wiki root** | `<project>/.wiki/` — long-lived; all OpenChamber OpenWiki MD + metadata live here |
| OpenChamber marker | `<project>/.wiki/.openchamber-openwiki.json` (or equivalent) — marks the tree as managed by this integration |
| Outside `.wiki/` | No durable OpenWiki writes (no root `AGENTS.md` / `CLAUDE.md`, no CI scaffolding) |

**Why a bind step exists:** stock `openwiki` writes to `<cwd>/openwiki/`. OpenChamber’s runner therefore:

1. Ensures `<project>/.wiki/` exists when starting a **consented** first-time generate (create empty dir + write marker).
2. For the job only, creates a **Windows directory junction** (or POSIX symlink) `<project>/openwiki` → `<project>/.wiki` so agent writes land in `.wiki/`.
3. Runs the agent with docs-only writes; **never** calls `ensureCodeModeRepoSetup`.
4. After the job (success, failure, or cancel), **removes the junction/symlink** so the durable path users see/commit is `.wiki/`, not a second `openwiki/` tree.
5. Viewer / tree APIs always read **`<project>/.wiki/`**.

If junction creation fails, fail closed — do **not** create a real `<project>/openwiki/` directory as a fallback.

Personal mode is out of scope. Scaffolding / reserved files in `.wiki/` (viewer may hide from the reading tree or show under a “Control” group): `INSTRUCTIONS.md`, `FORMAT.md`, `log.md`, `_plan.md`, `.last-update.json`, `.langsmith.json`, the OpenChamber marker.

### 6.6 Document structure and format (locked)

Teams often already mandate doc shapes (e.g. 软件架构设计, 模块详细设计, API 契约说明). OpenChamber must let the user define that **before and between** Generate/Update runs.

#### Authoring surface

1. **Settings → OpenWiki** — primary editor (settings-ui-patterns):
   - **Preset** chip/select: seeded templates (localized labels), including at least:
     - `openwiki-default` — rely on OpenWiki’s built-in outline (minimal brief)
     - `architecture-module` — architecture overview + per-module detailed design sections (good default for engineering orgs)
     - `api-service` — service boundaries, public APIs, data models, ops
     - `custom` — user-owned text; selecting another preset offers “Replace editors with preset?” confirm so custom work is not silently wiped
   - **Brief** (`INSTRUCTIONS.md`) — scope, priorities, out-of-scope, audience
   - **Structure & format** (`FORMAT.md`) — required pages/sections, naming, heading conventions, mandatory subsections, language/tone, diagrams rules, “do not invent sections outside this outline” constraints
2. **Wiki panel** — secondary entry: “Edit wiki format” opens Settings to the OpenWiki page (or the same editors in a focused dialog that still writes the same files).

Editors are Markdown (plain textarea or existing shared markdown editor precedent). Save writes the project files immediately (or via existing settings save status / `reportSettingsSaveState` if routed through settings APIs).

#### On-disk contract (under `<project>/.wiki/`)

| File | Role | Mutability |
|---|---|---|
| `INSTRUCTIONS.md` | User brief OpenWiki already understands as control metadata | **User-owned.** Agent must not rewrite on normal init/update (OpenWiki prompt already says this). OpenChamber never overwrites without user/preset confirm |
| `FORMAT.md` | OpenChamber structure/format spec | **User-owned.** Not generated documentation. Viewer treats as control file. Agent is told (via injected run message) to obey it and not rewrite the file |
| `.openchamber-openwiki.json` | Marker + `formatPresetId`, consent metadata | OpenChamber-owned |

On first Generate for an `absent` tree, if the user has not edited format yet, seed both files from the selected preset. **Default preset: `openwiki-default`** (OpenWiki’s built-in outline; brief/format editors start minimal / empty guidance so the agent follows upstream defaults).

#### How jobs apply the format

Each Generate/Update/Regenerate:

1. Read `INSTRUCTIONS.md` + `FORMAT.md` from `.wiki/` (after bind they appear as `/openwiki/…` to the agent).
2. Build an extra `userMessage` prefix (or appendix) that restates non-negotiable format rules from `FORMAT.md` for this run (so the model sees them even if it skims files).
3. Rely on OpenWiki’s native read of `INSTRUCTIONS.md` for brief/scope.
4. Do **not** pass format text by mutating OpenWiki system prompts inside the npm package; keep injection in OpenChamber’s runner (`userMessage` + files on disk).

If `FORMAT.md` is missing, fall back to preset seed or `openwiki-default` behavior; do not fail the job solely for an empty brief.

#### Guarantees / limits

- Format customization steers the agent; it is **not** a hard schema validator in v1 (no CI-like reject of missing sections). Optional later: post-run checklist UI (“missing sections vs FORMAT.md”).
- Changing format mid-project does not auto-rewrite the whole wiki; user runs **Update** or **Regenerate**.
- Foreign-consent adopt keeps existing control files when present; backup-rebuild reseeds from the current Settings preset/editors.

### 6.2 Existing wiki / foreign content consent (locked)

Projects may already have documentation conventions (`.wiki/`, `wiki/`, `docs/`, or a legacy `openwiki/` from the CLI). Those files may be **owned by the team**, not by OpenChamber.

**Classify before any write job** (`GET /api/openwiki/status` + preflight):

| Classification | Meaning | Write policy |
|---|---|---|
| `absent` | No relevant wiki tree | Generate may create `.wiki/` + marker after user clicks Generate |
| `openchamber-managed` | `.wiki/` exists **and** carries a valid OpenChamber marker | Update / Regenerate follow §6.3 (still confirm Regenerate) |
| `foreign` | Wiki-like tree exists **without** our marker, or marker missing/invalid, **and** it contains Markdown or other constrained docs the project may already own | **Block writes** until the user explicitly consents |
| `conflict` | Both a foreign tree and paths that would collide with our bind (e.g. real non-junction `<project>/openwiki` with content) | Block; explain and ask how to proceed |

**What counts as “wiki-like / constrained” for `foreign` (v1 heuristics, fail closed):**

- Directory `.wiki/` exists without our marker, or
- Directory `openwiki/` exists as a real directory (not our transient junction) with `*.md` / OKF-like pages, or
- (Optional signal) user-configured extra roots later — not required in v1

When `foreign` / `conflict`:

1. UI explains that existing files may be project standards and that proceeding will let OpenChamber/OpenWiki write under `.wiki/`.
2. User must pick one explicit path (not a silent default):
   - **Adopt in place** — keep existing files under `.wiki/` (or migrate/bind the detected foreign tree into `.wiki/` per conflict resolution notes in `DOCUMENTATION.md`), write the OpenChamber marker, then allow **Update** (and later **Regenerate** only with the usual regenerate confirm).
   - **Backup then rebuild** — rename/move the existing wiki-like tree to a timestamped backup (e.g. `.wiki.bak-<iso>` or `openwiki.bak-<iso>`), create a fresh `.wiki/` + marker, then run **Generate (`init`)**.
   - **Cancel** — no writes, no marker, no backup.
3. API requires `consent: true` plus `consentAction: "adopt" | "backup-rebuild"` on the first write after a foreign/conflict gate; without them return `409` / `wiki-consent-required`.
4. Consent is recorded in the marker (`consentedAt`, `consentAction`). Backup path (if any) is recorded for UI (“Backup at …”). Do not delete backups automatically.
5. Adopting does **not** skip a later Regenerate confirm. Backup-rebuild’s `init` is the rebuild itself; still show a clear summary of what will be moved before starting.

**Regenerate** on already-managed trees still needs the §6.3 confirm (content rewrite). That is separate from foreign-consent.

### 6.3 Generate vs Update UX (locked)

- **No `.wiki` yet (`absent`):** primary action **Generate wiki** → create `.wiki/` + marker → OpenWiki `init` via bind.
- **OpenChamber-managed wiki:** choice (dialog or split buttons):
  - **Update (incremental)** → OpenWiki `update` (default recommendation).
  - **Regenerate (full)** → OpenWiki `init` again after explicit confirmation that existing `.wiki` content may be rewritten.
- **Foreign / conflict:** no generate/update until consent UI succeeds (§6.2).
- Never silently overwrite via `init` without the appropriate confirmation/consent.

### 6.4 Viewer (native)

Context surface:

- New `ContextPanelMode` / surface id: `wiki` (rail icon TBD; generate sprite via `bun run icons:generate`).
- Availability: `always` when feature enabled; optional feature flag later.
- Keep-alive: treat like `file`/`walkthrough` if open page + scroll should survive surface switches — **recommend keep-alive** for the wiki pane instance per directory.

UI composition (`OpenWikiView`):

1. **Header:** `.wiki` label, ownership/consent badge when foreign, Generate / Update buttons, job progress, “Open in Settings”.
2. **Left:** file tree of `*.md` under `<project>/.wiki/` (reuse Files tree patterns / `files.listDirectory`).
3. **Right:** Markdown preview using existing OpenChamber markdown rendering (theme-system compliant). Mermaid: follow whatever the shared Markdown pipeline already supports; do not add a new Mermaid dependency unless required and explicitly approved.
4. **Empty / gate states:**
   - No wiki → CTA “Generate wiki”.
   - Foreign wiki → consent explanation + Allow / Cancel.
   - Job running → progress + cancel.
   - Load error → error state (not empty tree).

Navigation: rail + `openContextSurface(dir, 'wiki')` + optional command palette / menu action. No new primary header toolbar button (surfaces docs invariant).

### 6.5 Settings page

Slug: `openwiki`  
Group: `content` (alongside Skills / Snippets)  
Kind: `single` (large editors; use stacked fields / sections, not a separate split library unless editors become unwieldy)

Fields / controls:

| Control | Persistence | Notes |
|---|---|---|
| `openWikiEnabled` | OpenChamber settings | Hides rail when false |
| Document language | Fixed product constant | Always `zh-CN` (Simplified Chinese); not exposed in Settings |
| `openWikiModelOverride` | OpenChamber settings | `provider/model` or null = follow OpenCode selection |
| `openWikiAutoReveal` | OpenChamber settings | Reveal wiki + `index.md` after success |
| Format **preset** | Marker / project `.wiki` | See §6.6 |
| Brief editor | `<project>/.wiki/INSTRUCTIONS.md` | Project-scoped, not global settings.json body |
| Structure & format editor | `<project>/.wiki/FORMAT.md` | Project-scoped |

Wiki root is fixed at **`<project>/.wiki/`** in v1 (not user-relocatable).

Because brief/format are **per-project files**, the Settings page must resolve the active workspace/project directory (same directory scope as the Wiki panel). If no project is open, show an empty/disabled state explaining that format is edited in the context of a project.

Register: `metadata.ts`, `SettingsView.tsx`, `search.ts` (index preset + editors), all locale dictionaries. Follow `settings-ui-patterns` + `locale-ui-patterns`.

**Out of Settings v1:** OpenWiki provider keys, visualize port, connector config, PostHog/telemetry toggles, custom wiki root path, hard format validation CI.

## 7. Server API

Module root: `packages/web/server/lib/openwiki/`  
Docs: `packages/web/server/lib/openwiki/DOCUMENTATION.md` (created with implementation)  
Register routes **before** OpenCode proxy (ui-api-decoupling).

### 7.1 Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/openwiki/status` | Feature enabled, roots, ownership, consent, format preset id, last job, model preview |
| `POST` | `/api/openwiki/preflight` | Validate model mapping + credentials + paths + consent |
| `GET` | `/api/openwiki/format` | Read brief + format + preset (`directory` query) |
| `PUT` | `/api/openwiki/format` | Write brief + format + preset; optional `applyPreset` with confirm semantics |
| `GET` | `/api/openwiki/format/presets` | List built-in preset ids + seed bodies (Reset uses `openwiki-default`; Settings UX no longer centers presets) |
| `GET` / `POST` / `DELETE` | `/api/openwiki/reference-sources` | List / import (base64) / remove project reference docs under `.wiki/reference-sources/` |
| `GET` | `/api/openwiki/format/draft` | Read parsed draft prompts (if any) |
| `POST` | `/api/openwiki/format/parse` | Start in-process `parse-format` job (same LLM gateway model as Generate) |
| `POST` | `/api/openwiki/format/merge` | Soft-merge draft into active `INSTRUCTIONS.md` / `FORMAT.md` |
| `POST` | `/api/openwiki/format/reset` | Restore built-in default prompts (zh-CN + Mermaid) |
| `POST` | `/api/openwiki/export/docx` | Build one `.docx` per wiki page (local MD→DOCX; no model) for desktop write-out |
| `POST` | `/api/openwiki/generate` | Start `init` job |
| `POST` | `/api/openwiki/update` | Start `update` job |
| `GET` | `/api/openwiki/job` | Current/last job for directory |
| `GET` | `/api/openwiki/progress` | Stage + optional recent event text |
| `POST` | `/api/openwiki/cancel` | Cancel running job |
| `GET` | `/api/openwiki/tree` | Optional convenience tree (or UI uses `/api/fs/list` on `.wiki/`) |
| `GET` | `/api/openwiki/page` | Optional raw markdown (or UI uses `/api/fs/read`) |

**Job concurrency:** one active OpenWiki job **per workspace directory** (including `parse-format`). A second start returns `409` `code: 'job-in-progress'`.

Job record (in-memory, walkthrough-style; optional disk summary of last result):

```ts
type OpenWikiJob = {
  id: string
  directory: string
  mode: 'code'
  command: 'init' | 'update' | 'parse-format'
  stage: OpenWikiJobStage
  model: { providerID: string; modelID: string }
  mappedProvider: string
  startedAt: number
  updatedAt: number
  error?: { code: string; message: string }
  cancelRequested?: boolean
}
```

Stages (UI-facing):

`queued → preparing → mapping-model → running → writing → completed | failed | cancelled`

Map OpenWiki `onEvent` (`text` / `tool_start` / `tool_end` / `debug`) into `running` sub-detail for the progress panel without persisting full tool payloads (avoid logging secrets / huge dumps).

### 7.2 Adapter ownership

Suggested files:

```text
packages/web/server/lib/openwiki/
  DOCUMENTATION.md
  index.js            # orchestration
  routes.js
  model-bridge.js     # OpenCode → OpenWiki mapping + child env
  job-store.js
  runner.js           # spawn / in-process entry
  paths.js            # resolve wiki roots
  settings.js         # read feature settings from OpenChamber settings
```

UI client: `runtimeFetch` helpers in `packages/ui` (e.g. `lib/openwikiApi.ts`) — **not** required on `RuntimeAPIs` unless a runtime-specific implementation diverges; desktop/web share the same routes.

## 8. UI work breakdown

### 8.1 Surfaces / stores

- Extend `ContextPanelMode`, sanitizers, `CONTEXT_SURFACES`, `ContextPanel.tsx`, rail visibility.
- Optional `openContextWiki(directory, path?)` helper on `useUIStore`.
- Optional lightweight `useOpenWikiStore` for job polling + selected page (directory-scoped; see `stores/DOCUMENTATION.md`).

### 8.2 Components

- `packages/ui/src/components/views/OpenWikiView.tsx` (+ tree/preview subcomponents as needed).
- Settings page section component under `components/sections/` or views settings folder per local precedent.
- Locale keys in **all** `packages/ui/src/lib/i18n/messages/*` dictionaries (real translations).

### 8.3 Skills to load at implementation time

Mandatory before editing:

- `openchamber-change-discipline`
- `settings-ui-patterns` (+ layout/controls/search refs)
- `locale-ui-patterns`
- `theme-system`
- `ui-api-decoupling` (+ implementation-map / runtime-parity as needed)
- `desktop-shell` (packaging / child process / resources)
- `performance-engineering` if tree/preview hot paths warrant it

## 9. Security and privacy

- Never log API keys, bearer tokens, auth.json contents, or full provider env dumps.
- Child-process job manifests that include credentials must live in restrictive temp files and be deleted after start/complete when feasible.
- Remote/paired clients: generation uses **server-side** credentials of the host; do not expose host auth to remote renderers. Confirm parity with other privileged APIs (`ui-auth`, desktop local origin rules).
- Wiki Markdown may contain private project knowledge; FS scope and remote access rules apply unchanged.

## 10. Failure, rollback, and partial success

| Event | Behavior |
|---|---|
| Preflight fails | No files written; UI shows code-specific message |
| Job fails mid-run | Leave partial Markdown on disk (OpenWiki owns write semantics); job `failed`; viewer refreshes and shows what exists |
| Cancel | Kill worker; status `cancelled`; no automatic delete of partial wiki |
| Fetch tree fails | Error state; do not clear previously shown page until user navigates away |
| Unsupported provider | Block before spend; deep-link to Providers / model picker |
| Regenerate (`init`) on existing wiki | Only after explicit confirm; Update is the safer default choice |

### 10.1 Repo write policy (locked)

**Product rule:** Durable OpenWiki outputs live only under `<project>/.wiki/`. Everything else in the project is off-limits. Existing wiki-like content requires consent (§6.2) before first managed write.

OpenChamber’s runner must **not** call `ensureCodeModeRepoSetup`.

Call `runOpenWikiAgent` with `outputMode: "repository"` + docs-only; bind `<project>/openwiki` → `<project>/.wiki` for the job only (§6.1).

Allowed durable writes (after consent / when managed):

- `<project>/.wiki/**` including the OpenChamber marker, OpenWiki-generated pages, and user control files (`INSTRUCTIONS.md`, `FORMAT.md`)
- Format PUT may create/update only those control files + marker fields (not bulk-delete generated pages)

Forbidden:

- Root `AGENTS.md` / `CLAUDE.md`, `.github/workflows/*`, project source outside `.wiki/`
- Creating a durable real `<project>/openwiki/` directory (junction only, job-scoped)
- Leaving the junction/symlink behind after the job ends
- Any write while classification is `foreign` / `conflict` without `consent: true`

No automatic git commit/PR creation from OpenChamber v1. Whether `.wiki/` is gitignored is the user’s / repo policy — OpenChamber does not silently edit `.gitignore` in v1.

### 10.2 Telemetry (locked) — feature omitted

PostHog / OpenWiki usage analytics are **not part of this product surface**.

- Child env always includes `OPENWIKI_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`.
- Do not add Settings UI, prompts, or first-run notices about OpenWiki telemetry.
- Do not forward `--telemetry-file` or enable senders in the embedded runner.

## 11. Testing and validation

### 11.1 Automated

- Model-bridge unit tests: providerID matrix → mapped env / OpenWiki provider; unsupported cases.
- Routes: preflight auth missing, job concurrency, cancel.
- Settings sanitize/round-trip for new fields.
- Adapter smoke: required `openwiki` export symbols resolve.
- UI: focused tests for empty/error/progress states if local precedent uses component tests.

### 11.2 Manual / platform

- Electron: generate + update against a sample repo using a real logged-in OpenCode provider.
- Packaged build: generation works **without** global `openwiki` on PATH.
- Confirm `better-sqlite3` loads in the chosen execution mode.
- Viewer theme light/dark; large wiki tree performance sanity.

### 11.3 Validation commands (implementation phase)

Per change-discipline: package-scoped type-check/lint/tests for touched packages; `bun run dead-code` when files/exports change; packaging script dry-run for Electron resources. Report exactly what ran.

## 12. Phased delivery

### Phase 0 — Spec acceptance

- Complete. All product decisions in §2 are locked.

### Phase 1 — Scaffolding

- Pin npm `openwiki` + adapter shell + `DOCUMENTATION.md`.
- Settings: model picker, **format preset + brief/format editors** (read/write `.wiki` control files). Language fixed to `zh-CN`.
- Context surface + viewer wired to `.wiki/` (no jobs yet); foreign-consent empty states.

### Phase 2 — Model bridge + async jobs

- Preflight, generate (`init`), update, progress, cancel — async enqueue + child-process runner.
- Inject `FORMAT.md` / brief into each run; seed control files on first generate.
- Confirm/choice UI for regenerate vs incremental update; foreign adopt / backup-rebuild.
- UI remains usable while a job runs; job failure does not break chat/OpenCode.

### Phase 3 — Packaging polish

- `prepare-openwiki` stages pinned package + production deps into Electron resources.
- Runtime resolver: bundled resources → workspace `node_modules` → explicit override.
- Release validation on a clean Windows machine without global `openwiki`.

### Phase 4 — Hardening (optional follow-ups)

- Broader provider mapping for Gemini / Copilot / ChatGPT OAuth is implemented in the gateway translators; harden edge cases (Codex tool rejection, Copilot enterprise URL variants) as they appear in smoke.
- Personal mode / connector UI (deferred).
- Optional graph visualizer embed.
- Upstream PR to `openwiki` for stable `exports` + injectable provider on `runOpenWikiAgent`.

## 13. Decision log (resolved)

| Topic | Decision |
|---|---|
| Dependency source | Pin npm `openwiki@x.y.z`; bundle that tree into Electron release resources |
| Existing wiki actions | Confirm → user chooses **Regenerate (full)** or **Update (incremental)** |
| Personal mode | Out of scope (code only) |
| Wiki model UI | Settings picker from OpenCode catalog; default = follow current OpenCode model; optional persisted override |
| Job execution | Async child-process worker; isolate failures from core OpenChamber |
| Artifact location | Durable `<project>/.wiki/`; no root MD/CI; transient `openwiki` junction during jobs only |
| Foreign wiki | Consent required; user chooses **adopt in place**, **backup then rebuild**, or **cancel** |
| Doc format | `.wiki/INSTRUCTIONS.md` + `FORMAT.md`; Settings presets + editors; **default preset `openwiki-default`** |
| OpenWiki PostHog | Omitted — always disabled, no UI |

## 14. Acceptance criteria

The feature is done for v1 when:

1. User can open **Wiki** from the context rail and browse `<project>/.wiki/**/*.md` with Markdown preview.
2. First Generate creates a long-lived `.wiki/` (plus OpenChamber marker); jobs do not leave a durable `openwiki/` directory or edit root MD/CI.
3. If a foreign/existing wiki is detected, the UI asks the user to **adopt in place**, **backup then rebuild**, or **cancel** before any OpenWiki write; Cancel leaves files untouched.
4. Settings → OpenWiki configures Wiki model and **document brief/structure/format** (presets + editors persisted under `.wiki/`) with search + all locales — no telemetry controls. Document language is always Simplified Chinese (`zh-CN`).
5. Generate/Update steers pages using the user’s format spec; control files are not rewritten by normal agent runs.
6. User can **Generate** / **Update** / **Regenerate** without entering any OpenWiki API key; jobs use OpenCode credentials and the resolved model.
7. Jobs are async and out-of-process; OpenWiki PostHog is never enabled.
8. Unsupported providers and missing logins fail closed with clear UI, not silent empty success.
9. Packaged Electron build includes the pinned `openwiki` dependency tree and runs jobs without a global install.
10. Owning docs (`openwiki/DOCUMENTATION.md`, surfaces/settings notes as needed) match the shipped behavior.

## 15. References

- OpenWiki README / CLI: `D:\work\ai\openwiki\README.md`
- OpenWiki agent APIs: `D:\work\ai\openwiki\src\agent\index.ts`, `types.ts`, `constants.ts`
- OpenChamber surfaces: `packages/ui/src/lib/surfaces/DOCUMENTATION.md`
- Walkthrough job pattern: `packages/web/server/lib/walkthrough/DOCUMENTATION.md`
- Small-model / auth reuse: `packages/web/server/lib/small-model/DOCUMENTATION.md`
- Bundled OpenCode CLI: `packages/electron/README.md`, `packages/electron/scripts/prepare-opencode-cli.mjs`
- Skills: change-discipline, settings-ui-patterns, locale-ui-patterns, theme-system, ui-api-decoupling, desktop-shell
