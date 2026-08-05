# <picture><source media="(prefers-color-scheme: dark)" srcset="docs/references/badges/openchamber-logo-dark.svg"><img src="docs/references/badges/openchamber-logo-light.svg" width="32" height="32" align="absmiddle" /></picture> OpenChamber

[![GitHub stars](https://img.shields.io/github/stars/openchamber/openchamber?style=flat&labelColor=100F0F&color=66800B)](https://github.com/openchamber/openchamber/stargazers)
[![GitHub release](https://img.shields.io/github/v/release/openchamber/openchamber?style=flat&labelColor=100F0F&color=205EA6)](https://github.com/openchamber/openchamber/releases/latest)
[![Discord](https://img.shields.io/badge/Discord-join.svg?style=flat&labelColor=100F0F&color=8B7EC8&logo=discord&logoColor=FFFCF0)](https://discord.gg/ZYRSdnwwKA)
[![Support the project](https://img.shields.io/badge/Support-Project-black?style=flat&labelColor=100F0F&color=EC8B49&logo=ko-fi&logoColor=FFFCF0)](https://ko-fi.com/G2G41SAWNS)

## Run agent work. Keep control. Ship from your Windows desktop.

**OpenChamber is an open-source Windows desktop workspace for running, supervising, and reviewing AI coding work.**

OpenChamber gives you one place to direct agent work, understand the changes, and move them toward release — including Git and GitHub workflows on your Windows machine.

![OpenChamber Chat](docs/references/chat_example.png)

## What you can do with OpenChamber

### Goals that continue on their own

Give a session a finish line with **Session Goals**. OpenChamber checks the result after every turn and keeps the agent working until the goal is complete, blocked, or reaches the limit you set — even after you close the app.

### Compare and combine runs

Use **Multi-run** to give the same task to up to five models, each in its own session and optionally its own worktree. See what each one actually built, choose the best result, or use **Fusion** to combine the strongest parts into a new session.

### Guided changes walkthroughs

**Changes Walkthrough** turns a large diff into an AI-guided tour of the change. It groups related edits into steps, puts them in the order the change makes sense, and explains how the pieces fit together.

### Inspect a running app

Open your app beside the conversation with **Preview**. Point at an element and send the agent its screenshot, styles, position, and browser errors — all the context behind “this thing here.” Desktop brings the same workflow to any web page through its built-in browser.

### GitHub context from issue to pull request

Start a session from a GitHub issue or pull request with its context attached. Send failed checks or review comments back to the agent, then update or merge the pull request from OpenChamber.

### Git and GitHub on this machine

Manage local Git identities (including Git SSH keys for remotes like GitHub), review diffs, and drive issue/PR workflows from the desktop workspace.

### Track work across projects

See which sessions are working, waiting, finished, or failed, along with approvals, scheduled tasks, provider limits, token use, and costs. Organize sessions into folders and keep notes, todos, and reusable project actions nearby.

### Schedule recurring work

Run a prompt once, daily, weekly, or on a cron schedule. Scheduled tasks can use Session Goals, so they continue toward an outcome instead of stopping after one response.

## Use it where you work

| Surface | Role |
| --- | --- |
| **Windows Desktop** | The complete Electron workspace, with multiple windows, Mini Chat, Git/GitHub integration, and native notifications |
| **In-process server** | OpenChamber server + UI assets built from `packages/web` and started inside Electron (also usable for local `openchamber serve` debugging) |

## Quick start

### Windows Desktop

Download the latest Windows installer from [GitHub Releases](https://github.com/openchamber/openchamber/releases/latest). Desktop bundles the matching OpenCode CLI, so no separate OpenCode installation is required.

### Develop from source

Requires Node.js 22+ and [Bun](https://bun.sh).

```bash
bun install
bun run electron:dev
```

Build a Windows NSIS installer:

```bash
bun run electron:build
```

## Monorepo layout

| Package | Role |
| --- | --- |
| `packages/electron` | Windows Electron shell and packaging |
| `packages/web` | In-process OpenChamber server + Vite UI build |
| `packages/ui` | Shared React UI |

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution guidelines.
