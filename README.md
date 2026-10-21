<p align="center">
  <img src=".github/assets/logo.png" alt="fly" width="160">
</p>

# 🪽 fly — Heron agent cockpit

[![CI](https://github.com/heronlabs/fly/actions/workflows/continuous-integration.yml/badge.svg)](https://github.com/heronlabs/fly/actions/workflows/continuous-integration.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.x-blue.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-44.x-47848f.svg)](https://www.electronjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12.x-e0234e.svg)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Desktop app for driving agent-based development across many repositories at
once. Open it on a workspace folder, see every repo and every worktree, click a
worktree to get its [Claude Code](https://claude.ai/code) session, start a new
task and have [supera](https://github.com/heronlabs/supera) ship it, and watch
a queue of what is waiting for you versus what an agent is still working on.
Built with Electron, NestJS in the main process, React in the renderer, tmux
and xterm.js. macOS first.

## Table of Contents

- [Why This Project](#why-this-project)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Queue States](#queue-states)
- [Status](#status)
- [Architecture](#architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Why This Project

Running several supera tasks in parallel means several tmux sessions, several
worktrees and no single view of which ones need a human. fly replaces the
routine of "open VSCode, open iTerm, `start-s`, `/supera:ship`" with one app:

- **One window, every repo** — discovers the git repos under a folder, two levels deep, and every worktree of each. Session = worktree = task.
- **Real terminals, persistent sessions** — each worktree hosts Claude Code inside tmux, so sessions survive app restarts and stay reachable remotely via Tailscale + Termius, exactly as with [code-sessions](https://github.com/heronlabs/code-sessions).
- **Nova tarefa** — pick a repo, type a description, fly starts a session and runs `/supera:ship <description>`. Supera creates the worktree; fly binds the session to it when it appears.
- **Queue, not chat** — the state of each worktree is derived from the Claude Code transcript and `gh`, without changing supera. The TUI stays the chat.
- **100% tested** — v8 coverage and Stryker mutation testing, both at 100% thresholds.

## How It Works

1. **Workspace.** fly opens a folder, lists its repos and worktrees, and watches them for changes.
2. **Session.** "Iniciar sessão" creates a tmux session on the default server named after the worktree and runs `claude` in it, attached to an xterm.js terminal through node-pty. Closing fly detaches; opening it again reconciles the sessions that are still running.
3. **Task.** "Nova tarefa" starts a session in the repo's main worktree with `/supera:ship <descrição>` as the initial prompt, then follows the transcript until ship creates the worktree and moves the session there.
4. **Queue.** A poller tails `~/.claude/projects/<cwd>/<session>.jsonl` and asks `gh` for the pull requests of each worktree, then applies the queue rules and broadcasts a snapshot to the renderer, which shows a badge per worktree and the counts in the footer.

## Prerequisites

| Tool | Why |
|------|-----|
| `git` | Repo and worktree discovery |
| `gh` | Pull request status; must be authenticated (`gh auth login`) |
| `tmux` | Persistent sessions hosting Claude Code (`>= 3.2`, `brew install tmux`) |
| `claude` | Claude Code CLI, run inside each session, with the supera plugin installed |
| `code` | VSCode on `PATH`, used by "Abrir no VSCode" |

fly uses the default tmux server, so `tmux ls` and `tmux attach -t <name>` from
any terminal reach the same sessions.

## Quick Start

```bash
git clone https://github.com/heronlabs/fly.git
cd fly
pnpm install
pnpm dev
```

Pick a workspace folder on the welcome screen. Each repo under it appears in
the left panel with its worktrees; select one and press "Iniciar sessão" to get
its terminal, or press "Nova tarefa" to ship something new.

Packaged builds (`.dmg`) are planned for milestone 6; until then fly runs from
source.

## Queue States

Each worktree carries one `QueueStatus`, derived from its transcript and pull
request:

| Status | Badge | Meaning |
|---|---|---|
| `idle` | — | No session, or nothing in flight |
| `engineer` | `eng` | An agent is working: supera-engineer is running or a turn is in progress |
| `waiting` | `você` | Claude is waiting for you: a question was asked or the turn ended with nothing scheduled |
| `ci` | `CI` | A pull request is open and its checks are running |
| `failed` | `falhou` | A check failed on the pull request |
| `ready` | `merge` | Checks green, mergeable, no review pending |
| `merged` | `merged` | Merged, waiting for cleanup |
| `unknown` | `?` | Ambiguous, such as two sessions in the same directory |

The footer counts the worktrees in each of four buckets: waiting for you, agent
running, CI running and failed.

## Status

| Milestone | Scope | State |
|---|---|---|
| M1 | Shell: scaffold, design system, theming, workspace discovery, tree | Done |
| M2 | Terminal: tmux + node-pty + xterm.js, session lifecycle, reconciliation | Done |
| M3 | Queue state: transcript parser, PR polling, state machine | Done |
| M4 | Diff / PR panel | Next |
| M5 | Explorer + editor | Planned |
| M6 | First-run flow, supera install, `.dmg` packaging, macOS CD | Planned |

The design spec and the plan of each milestone live in
[`docs/superpowers/`](docs/superpowers/).

## Architecture

Two Electron processes. The main process runs a NestJS container; the renderer
runs React and talks to it only through `window.fly`, exposed by the preload
script via `contextBridge`.

```
src/
├── main.ts                   # Electron entry: boots Nest, opens the window
├── preload.ts                # contextBridge → window.fly (channels in core/domain/fly-api.ts)
├── application/
│   ├── ipc/                  # composition root: IpcModule + one handler per channel
│   └── ui/                   # React renderer: panels, components, terminal, theme, state
├── core/
│   ├── domain/               # queue, session, transcript, workspace, settings, fly-api types
│   ├── interfaces/           # ports: VcsGateway, PrGateway, SessionLauncher, TranscriptSource…
│   └── services/             # workspace, session, task, terminal, queue (+ queue-rules), settings
└── infrastructure/
    ├── claude/               # transcript reader and parser (~/.claude/projects)
    ├── git/ github/          # worktree discovery (git), pull requests (gh)
    ├── tmux/ pty/ process/   # sessions, node-pty terminals, command runner
    ├── supera/               # engineer receipt parser
    └── environment/ filesystem/
```

- **`application/`** wires handlers and the renderer; `ipc-module.ts` is the only place that imports `infrastructure`.
- **`core/`** holds the rules: what a worktree's queue state is, how a session is named, how a task binds to the worktree ship creates. It never imports `application`.
- **`infrastructure/`** adapters implement `core/interfaces` and never import inward.
- **`application/ui`** imports only itself and type-only `core/domain`; `preload.ts` imports only `core/domain`.

All of this is enforced by `pnpm dep:cruise`.

## Testing

| Detail | Value |
|---|---|
| Framework | Vitest 4.x, two projects: `node` (main process, legacy decorators without metadata) and `ui` (renderer, jsdom + Testing Library) |
| Test location | `tests/unit/` (mirrors `src/`), `tests/ui/` (renderer), `tests/integration/` (real tmux, pty, git and filesystem), `tests/di/` |
| DI smoke test | `pnpm test:di` resolves `IpcModule` with real decorator metadata |
| Coverage | v8, 100% lines/functions/branches/statements |
| Mutation | Stryker 9.x (`stryker.conf.json`) on the `node` project, 100% break threshold |
| tmux | tests use a private socket `-L fly-test-<hex>` and kill that server afterwards, never the default server |
| Transcripts | tests use an `mkdtemp` projects dir through `CLAUDE_PROJECTS_DIR`, never the real `~/.claude` |
| `gh` | always mocked through `CommandRunner` or `PrGateway` |

```bash
pnpm test:unit        # vitest run with coverage
pnpm test:di          # Nest DI smoke test
pnpm test:mutation    # stryker mutation testing
```

## Contributing

```bash
pnpm lint:check       # gts + json/yml lint
pnpm lint:fix         # auto-fix
pnpm typecheck        # node and web projects
pnpm build            # main, preload and renderer into out/
pnpm test:unit        # verify tests pass at 100% coverage
pnpm dep:cruise       # verify architecture
```

Conventional Commits:

```
feat(ipc): poll and broadcast the queue snapshot
fix(ui): let a new session replace an exited terminal
test(core): kill surviving mutants in the core services
```

- All work branches from `main`; PRs target `main`. Never commit directly to `main`.
- `version.txt` is managed by [action-tag-release-build](https://github.com/heronlabs/action-tag-release-build) on merge; never edit it by hand.

## License

MIT — see [LICENSE](LICENSE).

---

Built by [HeronLabs](https://github.com/heronlabs)
