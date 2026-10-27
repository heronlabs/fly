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
- [Install](#install)
- [Development](#development)
- [CLI](#cli)
- [Queue States](#queue-states)
- [Status](#status)
- [Architecture](#architecture)
- [Testing](#testing)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Why This Project

Running several supera tasks in parallel means several tmux sessions, several
worktrees and no single view of which ones need a human. fly replaces the
routine of "open VSCode, open iTerm, `start-s`, `/supera:ship`" with one app:

- **One window, every repo** — discovers the git repos under a folder, two levels deep, and every worktree of each. Session = worktree = task.
- **Real terminals, persistent sessions** — each worktree hosts Claude Code inside tmux, so sessions survive app restarts and stay reachable remotely via Tailscale + Termius. The [`fly` CLI](#cli) starts, lists, resumes and stops the same sessions from any terminal, and opens the app on a folder.
- **Nova tarefa** — pick a repo, type a description, fly fetches the repo's default branch, creates `.worktrees/<branch>` (branch suggested from the description, editable), writes the prompt and attachments to a task folder and starts Claude Code in the worktree with the prompt (optional model). "Abrir PR" then has that session commit and write the PR, and fly opens it.
- **Queue, not chat** — the state of each worktree is derived from the Claude Code transcript and `gh`, without changing supera. The TUI stays the chat.
- **100% tested** — v8 coverage and Stryker mutation testing, both at 100% thresholds.

## How It Works

1. **Workspace.** fly opens a folder, lists its repos and worktrees, and watches them for changes.
2. **Session.** "Iniciar sessão" creates a tmux session on the default server named after the worktree and runs `claude` in it, attached to an xterm.js terminal through node-pty. Closing fly detaches; opening it again reconciles the sessions that are still running. Dropping files on the terminal types their shell-escaped absolute paths, and ⌘V with only an image on the clipboard saves it as a PNG under the system temp folder and types that path; Claude Code turns an image path into an `[Image #N]` attachment.
3. **Task.** "Nova tarefa" fetches the repo's default branch, creates `.worktrees/<branch>` (branch suggested from the description, editable), writes the prompt and attachments to a task folder and starts Claude Code in the worktree with the prompt (optional model). "Abrir PR" then has that session commit and write the PR, and fly opens it.
4. **Queue.** A poller tails `~/.claude/projects/<cwd>/<session>.jsonl` and asks `gh` for the pull requests of each worktree, then applies the queue rules and broadcasts a snapshot to the renderer, which shows a badge per worktree and the counts in the footer.
5. **Diff / PR.** The right panel polls `git diff` for the selected worktree every 3 s, only while it is open and on the Diff tab. It shows the working tree and the branch diff against the main worktree's branch, and caps big diffs. The PR tab shows the title, checks and review, a `gh pr merge` button; the panel collapses from the top bar.
6. **Explorer and editor.** The explorer column opens for the selected worktree with a lazy tree (`.git`, `node_modules` and `.worktrees` hidden), files changed per `git status` flagged and directories with changes expanded; "Recolher pastas" collapses every open folder. Files open in tabs beside `Sessão` in a CodeMirror editor with VSCode-like colours; the middle button closes a tab, and a right click offers "Fechar todas" and "Fechar salvas" (a dirty tab always asks `Descartar` first). ⌘S saves, refused if the file changed on disk since it was read. A 3 s poll reloads clean tabs and prompts `Recarregar`/`Manter` on dirty ones; big or binary files show a note and "Abrir no VSCode".
7. **Search.** The magnifier on a worktree row, or ⇧⌘F for the selected one, swaps the explorer for a Search view of that worktree: `git grep` over its tracked and untracked text files (`.gitignore` honoured) as you type, with case, whole-word and regex toggles. Hits are grouped by file with the line number and a highlighted preview, capped at 100 per file and 2000 in all; a click opens the file in a tab with the match selected. Each worktree keeps its last search.

## Prerequisites

| Tool | Why |
|------|-----|
| `git` | Repo and worktree discovery; `git diff` for the diff panel, `git status` for the explorer, `git grep` for the search |
| `gh` | Pull request status and `gh pr merge` for the merge button; must be authenticated (`gh auth login`) |
| `tmux` | Persistent sessions hosting Claude Code (`>= 3.2`, `brew install tmux`) |
| `claude` | Claude Code CLI, run inside each session, with the supera plugin installed |
| `code` | VSCode on `PATH`, used by "Abrir no VSCode" |

fly uses the default tmux server, so `fly ls` and `fly resume <nome>` (or
`tmux ls` and `tmux attach -t <name>`) from any terminal reach the same
sessions.

## Install

Download `fly-<versão>-arm64.dmg` from the
[latest Release](https://github.com/heronlabs/fly/releases/latest), drag fly to
Aplicativos and open it. The app is not signed, so macOS blocks the first
launch: open Ajustes > Privacidade e Segurança and choose "Abrir mesmo
assim", or run `xattr -dr com.apple.quarantine /Applications/fly.app`.

To update, drag the new dmg's app over the old one in Aplicativos. macOS
quarantines each new download, so the unblock step above applies again after
updating.

## Development

```bash
git clone https://github.com/heronlabs/fly.git
cd fly
pnpm install
pnpm dev
```

To drive fly from a terminal as well, install the CLI and open the app on a
folder:

```bash
pnpm cli:install
fly ~/Workfolder
```

`~/.local/bin` usually precedes `/usr/local/bin` on `PATH`, so the `fly` from
`pnpm cli:install` wins over an installed one. Dev builds keep their data in
`~/Library/Application Support/fly-dev`, apart from the installed app's
`~/Library/Application Support/fly`, so recent folders are not shared.

Pick a workspace folder on the welcome screen. Each repo under it appears in
the left panel with its worktrees; select one and press "Iniciar sessão" to get
its terminal, or press "Nova tarefa" to ship something new.

## CLI

`pnpm cli:install` builds fly and links `bin/fly` into `~/.local/bin` (or
`$FLY_BIN_DIR`), warning when that folder is not on `PATH`. `bin/fly` runs the
CLI on the checkout's own Electron in Node mode (`ELECTRON_RUN_AS_NODE`), the
way VSCode's `code` does, so it needs no separate Node. It runs the last
build: rerun `pnpm build` after pulling.

| Command | What it does |
|---|---|
| `fly [pasta]` | Opens the app on the folder (default: the current one) |
| `fly start [pasta]` | Starts Claude Code in a new tmux session in the folder (default: the current one), prints the session name and attaches when run from a terminal |
| `fly ls` | Lists every session on the default tmux server: name, folder, creation time, attached, task |
| `fly resume <nome>` | Attaches to a session by its exact name |
| `fly stop <nome>` | Kills a session by its exact name |
| `fly help` | Prints the usage (also `--help`, `-h`) |

A first argument that is not a subcommand is a folder: `fly ./start` opens a
folder named `start`. The exit code is 0 on success, 1 on a failure and 2 on a
usage error.

**Opening a folder.** fly runs as a single instance per build kind: a dev build
(`pnpm dev`, the dev `fly`) and the installed app run side by side, each with its
own data folder, and each `fly` hands folders to its own instance. A second `fly <pasta>`
hands the folder to the running app, which comes to the front (or reopens its
window) and opens it the way a folder picked on the welcome screen opens,
remembered among the recent folders. The root it opens climbs to a recent
folder: a folder inside one of them opens the deepest such recent folder; a
folder inside a git repo opens the parent of the repo's main worktree, since
discovery lists the repos under a root; any other folder opens as the root
itself. The worktree that holds the folder is selected.

**Starting a session.** `fly start` resolves the same root and names the
session after the folder's path under it plus six hex chars
(`heronlabs-fly-a3f7c2`), as the app names a worktree's session. It runs
`claude --dangerously-skip-permissions --session-id <uuid>` with the same tmux
options as the app, so the app lists the session under its worktree and tracks
it in the queue.

### Coming from code-sessions

| code-sessions | fly |
|---|---|
| `start-s [path]` | `fly start [pasta]` |
| `list-s` | `fly ls` |
| `resume-s <name>` | `fly resume <nome>` |
| `stop-s <name>` | `fly stop <nome>` |

`start-s <path>` read its path under `~/Workfolder`; `fly start` reads it from
the current folder, like any command.

## Queue States

Each worktree carries one `QueueStatus`, derived from its transcript and pull
request:

| Status | Badge | Meaning |
|---|---|---|
| `idle` | — | No session, or nothing in flight |
| `engineer` | `eng` | An agent is working: a turn is in progress |
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
| M4 | Diff / PR panel | Done |
| M5 | Explorer + editor | Done |
| M6 | Distribution (dmg, first-run wizard, `fly` command, update notice) and task lifecycle | In progress |

The design spec and the plan of each milestone live in
[`docs/superpowers/`](docs/superpowers/).

## Architecture

Two Electron processes. The main process runs a NestJS container; the renderer
runs React and talks to it only through `window.fly`, exposed by the preload
script via `contextBridge`.

```
src/
├── main.ts                   # Electron entry: boots Nest, opens the window, single instance
├── preload.ts                # contextBridge → window.fly (channels in core/domain/fly-api.ts)
├── cli.ts                    # `fly` CLI entry (bin/fly runs it on Electron in Node mode)
├── application/
│   ├── cli/                  # CLI commands: open, start, ls, resume, stop
│   ├── ipc/                  # composition root: IpcModule + one handler per channel
│   └── ui/                   # React renderer: panels, components, editor (CodeMirror), terminal, theme, state
├── core/
│   ├── domain/               # queue, session, transcript, diff, files, workspace, settings, fly-api types
│   ├── interfaces/           # ports: VcsGateway, PrGateway, SessionLauncher, TranscriptSource…
│   └── services/             # workspace, session, task, terminal, queue (+ queue-rules), diff (+ diff-rules), files (+ file-rules), settings, launch (+ launch-rules)
└── infrastructure/
    ├── claude/               # transcript reader and parser (~/.claude/projects)
    ├── git/ github/          # worktree discovery, diff and status (git), pull requests (gh)
    ├── tmux/ pty/ process/   # sessions, node-pty terminals, command runner
    └── environment/ filesystem/
```

- **`application/`** wires handlers, the CLI commands and the renderer; `ipc-module.ts` is the only place in it that imports `infrastructure`. `cli.ts`, the CLI's composition root, never reaches `electron`.
- **`core/`** holds the rules: what a worktree's queue state is, how a session is named, how a task is prepared and its PR lifecycle runs. It never imports `application`.
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
| `git` | mocked through `CommandRunner` in unit tests; runs against an `mkdtemp` repo in integration tests |
| Files | `FileStore` is tested against `mkdtemp` directories |

```bash
pnpm test:unit        # vitest run with coverage
pnpm test:di          # Nest DI smoke test
pnpm test:mutation    # stryker mutation testing
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, the test isolation
rules and the CI gates.

```bash
pnpm lint:check       # gts + json/yml lint
pnpm lint:fix         # auto-fix
pnpm typecheck        # node and web projects
pnpm build            # main (app and CLI), preload and renderer into out/
pnpm cli:install      # build, then link bin/fly into ~/.local/bin
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
- `version.txt` is managed by [action-tag-release](https://github.com/heronlabs/action-tag-release) on merge; never edit it by hand.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md),
never in a public issue.

## License

MIT — see [LICENSE](LICENSE).

---

Built by [HeronLabs](https://github.com/heronlabs)
