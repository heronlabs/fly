# fly — design

Date: 2026-10-19
Status: builder-checked, awaiting approval
Prototype: https://claude.ai/artifact/BVYuS4C759BV7Mbq177XW8 (Claude Design, interactive)

## 1. Intent

fly is a desktop app for driving agent-based development across many repositories at once. It replaces the routine of "open VSCode, open iTerm, `start-s`, `/supera:ship`" with one installed app: open it on a workspace folder, see every repo and every worktree, click a worktree to get its Claude session, click "Nova tarefa" to have supera ship a task, and watch a queue of what is waiting for the user versus what an agent is still working on. *(Superseded by M6: "Nova tarefa" no longer runs supera. fly creates the branch and worktree, starts the session there, opens the PR on the user's click and drives the CI fix loop itself; supera is retired once fly covers the cycle. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

The name follows the heron theme (talon, roost, tide).

### Why

- Today the user runs 2–4 supera tasks in parallel, each in its own tmux session and worktree, and has no single view of which ones are waiting for them (PR green, CI failed, engineer asked a question) and which are still running.
- VSCode is used mostly to read diffs and review PRs, not to type code. iTerm is used only to host tmux + Claude Code. Two heavy apps for a thin need.
- code-sessions and supera each require cloning a repo, symlinking scripts, editing `.zshrc`, and assuming fixed folders (`~/Workfolder`). The user wants to install one app and use it, with no per-machine setup of several repos and no fixed paths.
- Claude Code desktop lacks an editor and a terminal; Cursor is paid and the user prefers to stay on VSCode for anything heavier.

### Success

The user opens fly in the morning, picks the `heronlabs` folder, and for the rest of the day never opens iTerm. VSCode is opened only from fly's "Abrir no VSCode" button for the rare deep edit. New tasks start from fly, and the footer tells at a glance how many PRs are waiting for a human.

## 2. Goals, non-goals, anti-goals

### Goals

1. One installable macOS app (`.dmg`). First run checks dependencies and offers to install what is missing. No manual symlinks, no shell aliases, no cloned helper repos.
2. Workspace view: open any folder, discover git repos under it (two levels deep) and every worktree of each repo. Session = worktree = task.
3. A real terminal per worktree, hosting Claude Code inside tmux, so sessions survive app restarts and remain reachable remotely via Tailscale + Termius exactly as today.
4. "Nova tarefa": pick repo, type description, fly starts a session and runs `/supera:ship <description>` in it. Supera creates the worktree; fly attaches the session to it when it appears. *(Superseded by M6: fly creates the branch and worktree from the up-to-date default branch and starts `claude` in it with the prompt; there is no `/supera:ship` and no bind step.)*
5. Queue state per worktree, derived without changing supera: waiting for me, agent running, CI running, CI failed, ready to merge, merged, idle. *(Amended by M6: no supera signal is read; the lifecycle phase fly records overrides the PR status.)*
6. Diff / PR panel: unified diff of the worktree branch against base, PR checks, merge button (delegates to `gh pr merge`).
7. Explorer + editor: file tree of the selected worktree, open files in tabs, VSCode-like editor with heronlabs syntax palette, save. "Abrir no VSCode" for anything heavier.
8. Dark and light theme from the heronlabs design system tokens; follows the OS by default, manual toggle available.

### Non-goals

- Replacing the Claude Code CLI or its agent loop. Chat stays in the terminal.
- Replacing supera. ship, pr-watch, supera-engineer and the receipt hook keep running inside Claude Code as a plugin. *(Reversed by M6: fly owns the task lifecycle before and after the session, and supera is retired once fly covers it. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- A full IDE: no language server, no debugger, no extensions. The editor is for small edits and reading.
- Linux and Windows builds in v1. Architecture must not prevent them; packaging work is deferred.
- Multi-user, cloud sync, telemetry.

### Anti-goals (would make it a failure even if it works)

- Any setup step that requires editing dotfiles or cloning a repo by hand.
- Hardcoded paths such as `~/Workfolder`.
- Reimplementing ship's worktree, commit, push or PR logic in TypeScript. If fly and supera drift, supera wins. *(Reversed by M6: worktree creation, push, PR creation and post-merge cleanup are fly's code; commits stay with the session, at fly's request. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- A chat UI that hides what Claude Code is doing. The TUI is the chat.

## 3. Constraints

- macOS first (user's machine: Darwin, Apple Silicon assumed). Electron requires signing and notarization for distribution; the app may be unsigned for the user's own machine in v1 but packaging must leave room for it.
- External tools fly depends on and does not bundle: `git`, `gh` (authenticated), `tmux`, `claude` (Claude Code CLI, npm). fly detects them and offers `brew install` / the npm command for the missing ones; it never installs `claude` itself.
- Claude Code transcripts live in `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. The format is undocumented and changes between Claude Code versions. Reading it is the main technical risk (see §7).
- heronlabs design system is currently `@repo/pkg-design-system`, private to the `webapps` pnpm workspace. See decision D4.
- Repo conventions of the heronlabs Node projects (roost, env-ssm, workloads) apply: `src/{application,core,infrastructure}`, NestJS DI, kebab-case files with `-service.ts` / `-module.ts` suffixes, dependency-cruiser rules, vitest, eslint, `version.txt` managed by CD, `/supera:ship` for every change, never commit to `main`. *(The `/supera:ship` rule holds during the M6 transition; replacing it with fly's flow is an M6 follow-up.)*

## 4. Decisions made in the conversation

These are the user's decisions unless marked "my call".

- **D1. Standalone desktop app**, not a VSCode extension, not a TUI.
- **D2. Layout A**: three main columns, worktrees tree | session | diff/PR, plus a collapsible explorer column between tree and session that opens when a worktree is clicked. Validated in the interactive prototype (version 7), including the top bar, "Nova tarefa" modal, file tabs, editor, Diff/PR tabs, footer counts and theme toggle. The prototype is the visual reference for v1; its JS state and seed data are not to be reused.
- **D3. Stack: Electron + TypeScript + React.** Reasons: the design system, tokens, icons and syntax palette are TS/React; node-pty + xterm.js is the mature terminal path (VSCode's own); everything fly reads is local files or `git`/`gh`/`tmux` subprocesses, all native in Node; one language is what supera agents handle best. Known cost: Electron binary size and memory, acceptable for a single-user tool.
- **D4. Design system consumption** (confirmed by the user): publish `@heronlabs/design-system` to npm from the `webapps` monorepo, the same way `@heronlabs/roost` and `@heronlabs/env-ssm` are published. fly consumes **tokens, the syntax palette and the icon re-export only**; it builds its own components against CSS custom properties (as the prototype does) and does not take the antd/emotion component layer, so antd is not a fly dependency. The webapps-side work (carve the package boundary, add an npm publish job) is a prerequisite ship in `webapps`, owned by the user, not part of fly's plan; until it lands fly vendors a copy of `tokens/index.ts` behind a TODO (see §7). fly lives in its own repo `heronlabs/fly` at the workspace root next to talon and roost. Alternative rejected: placing fly under `webapps/apps/` would drag electron-builder into the website/CMS turbo pipeline.
- **D5. Terminal via tmux**, absorbing code-sessions. fly's main process runs the same tmux commands `claude-session.sh` runs today (`new-session -d`, `set-option status off / mouse on / history-limit 10000`, `send-keys 'claude --dangerously-skip-permissions; exit'`), then attaches through node-pty with `tmux attach -t <name>`. The code-sessions repo is retired once fly ships; its session-name convention (`<prefix>-<6 hex>`) is kept. Remote access from Termius uses bare `tmux ls` / `tmux attach -t <name>` (my call): no fly CLI and no PATH registration in v1; the `list-s`/`resume-s` aliases are a leftover the user may keep or drop. *(Superseded: the `fly` CLI shipped in PR #23 and the installed app registers it in `/usr/local/bin`; see `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- **D6. supera stays a Claude Code plugin and its own repo**, version-pinned by fly. At build time fly vendors the pinned supera release into `resources/plugins/supera`; at first run it registers the marketplace and installs the plugin into the user's Claude Code config so the user never clones supera. Trigger to revisit (merge supera into fly's repo): when fly changes start requiring paired supera PRs regularly. *(Superseded by M6: fly neither vendors nor installs supera and depends on no plugin; the session runs with whatever plugins Claude Code has enabled. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- **D7. "Nova tarefa" = session + ship.** fly starts a tmux session in the repo root and launches `claude --dangerously-skip-permissions "/supera:ship <description>"` (initial prompt argument). ship does everything else. fly watches `git worktree list --porcelain` and binds the session to the new `.worktrees/<slug>` worktree when it appears. If ship asks a question, it appears in the terminal and the user answers there. *(Superseded by M6: fly runs `git fetch origin <default>` and `git worktree add --no-track -b <branch> .worktrees/<branch> origin/<default>`, then starts `claude` in that worktree with the prompt (text and attachments, optional `--model`). See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- **D8. Queue state is derived, never pushed.** fly reads: the session's transcript JSONL (last event role, pending tool_use, Agent tool results carrying the supera-engineer receipt), `.supera/plan.md` presence, and `gh pr list --json` per repo polled every 30 s. supera is not modified to emit events. *(Amended by M6: the receipt and `.supera/plan.md` are no longer read; fly's own task record (phase, CI attempts, stop reason) overrides the PR status. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- **D8a. Session identity** (my call). Sessions fly starts get `claude --session-id <uuid>`, so the transcript path is known exactly (`~/.claude/projects/<encoded cwd>/<uuid>.jsonl`; for ship sessions the cwd is the repo root, so several ship sessions of one repo share a project dir and only the uuid tells them apart). Sessions fly did not start (Termius, pre-existing tmux) are mapped best-effort: tmux `pane_current_path` gives the cwd, the newest jsonl in that project dir is assumed; when more than one candidate is live the state shows "unknown". No further heuristics in v1. *(Amended by M6: task sessions start in their worktree, so each task has its own project dir.)*
- **D8b. "Waiting for me" means human input required**, not "turn ended". supera's pr-watch sleeps on `ScheduleWakeup` ticks between CI polls; a session idle with a pending wakeup counts as "agent running" (or "CI" once a PR exists). A pending `AskUserQuestion` tool_use counts as "waiting for me". An assistant turn that ended with no pending tool_use and no scheduled wakeup is "waiting for me". The parser therefore recognises tool names, not just roles. *(Amended by M6: the `ScheduleWakeup` and `/loop` rules stay, since they are Claude Code features. "Waiting for me" also covers a lifecycle stop: CI loop limit, infrastructure-only failure, conflict, a branch behind its base, or work left uncommitted at "Abrir PR". See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*
- **D9. Editor: CodeMirror 6** with a theme generated from `tokens.syntax.light|dark`, so blog code blocks and the editor share a palette. Monaco rejected as heavier; revisit only if VSCode-identical keybindings become a requirement.
- **D10. Theming**: all colors as CSS custom properties on the root, two token maps (dark = heronlabs dark tokens, light = heronlabs light tokens with `--accentText` darkened for contrast). Default follows `nativeTheme.shouldUseDarkColors`; manual override persisted in app config.
- **D12. Repo bootstrap and releases.** `/supera:ship` needs an existing remote with a default branch, so the user creates `heronlabs/fly` on GitHub and lands the scaffold (milestone 1, first commit) by hand; everything after goes through ship. CI (lint, test, dep-cruise, unit tests) runs on the org's self-hosted runners (`[self-hosted, linux, x64]`) like webapps. CD (confirmed by the user) runs on a GitHub-hosted macOS runner: on merge to `main`, `action-tag-release-build` bumps `version.txt` and tags as in every heronlabs repo, then a `macos-latest` job runs `pnpm dist` and attaches the `.dmg` to the GitHub Release. Signing/notarization stay optional in v1 (unsigned dmg, user right-clicks Open). *(Amended by M6: right-click > Open no longer bypasses Gatekeeper since macOS 15; the user allows it in Privacy & Security or with `xattr`; see `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)* Visibility: public like roost and supera (my call; flip to private before the first push if preferred).
- **D11. No fixed workspace path.** First run shows a folder picker; recent roots are stored in the app's config directory (`~/Library/Application Support/fly/`). Several roots may be open in the same window as top-level groups.

## 5. Architecture

### 5.1 Processes

Electron gives two runtimes that share nothing but IPC:

- **Main** (Node.js): owns every side effect. Spawns ptys, runs `git`/`gh`/`tmux`, watches files, reads config. Hosts the NestJS application context that wires core services to infrastructure adapters.
- **Renderer** (Chromium): React UI built with the design system. It never touches the filesystem or spawns processes. It talks to main only through the API exposed by `preload.ts` via `contextBridge`.

`preload.ts` is the typed contract between the two. It exposes `window.fly.<area>.<method>()` calls and `window.fly.<area>.on<Event>()` subscriptions. Payload types live in `core/domain` and are imported type-only on both sides.

### 5.2 Layers (same shape as roost and env-ssm)

```
fly/
  src/
    main.ts                        # Electron entry, composition root (as roost main.ts)
    preload.ts                     # contextBridge; imports core/domain types only
    application/
      ipc/                         # main side: IPC handlers are the app's "commands"
        ipc-module.ts              # NestJS composition root (as cli-module.ts)
        handlers/
          workspace-handler.ts     # open folder, list repos + worktrees, watch changes
          session-handler.ts       # start / attach / stop session, pty data stream, resize
          task-handler.ts          # new task: session + /supera:ship
          file-handler.ts          # tree, read, write, open in VSCode
          pr-handler.ts            # diff, checks, merge
          settings-handler.ts      # theme, roots, doctor
      ui/                          # renderer: React app
        app.tsx
        panels/                    # worktrees, explorer, session, diff-pr, footer, new-task
        components/
        editor/                    # CodeMirror setup and generated theme
        terminal/                  # xterm.js wrapper
        state/                     # store fed by preload events
    core/
      domain/                      # Repo, Worktree, Session, Task, QueueState, Receipt, PullRequest, Diff
      interfaces/                  # ports: SessionLauncher, Terminal, TranscriptReader,
                                   # VcsGateway, PrGateway, FileStore, PluginInstaller, AppConfig
      services/
        workspace-service.ts       # discover repos and worktrees, emit changes
        queue-service.ts           # transcript + plan + PR  =>  QueueState
        task-service.ts            # build ship command, start session, bind to new worktree
        diff-service.ts            # parse unified diff into domain Diff
        doctor-service.ts          # check git/gh/tmux/claude, propose install commands
    infrastructure/
      tmux/                        # tmux-session-service: new-session, attach cmd, kill, list
      pty/                         # node-pty-terminal-service
      git/                         # git-cli-service: worktree list, diff, status, rev-parse
      github/                      # gh-cli-service: pr view --json, pr merge, auth status
      claude/
        transcript-watcher-service.ts   # fs.watch on ~/.claude/projects/<encoded>/, tail jsonl
        transcript-parser.ts             # jsonl lines -> domain events (versioned, tolerant)
        plugin-installer-service.ts      # register marketplace + install supera
      supera/                      # plan-reader-service (.supera/plan.md), receipt schema validation
      environment/                 # app config store, recent roots, paths, OS theme
      log/
  tests/                           # vitest; mirrors src/
  resources/plugins/supera/        # vendored at build time from the pinned release
  docs/superpowers/specs/
  electron.vite.config.ts          # entries: main, preload, renderer
  .dependency-cruiser.json
```

*(Amended by M6: `task-handler.ts` builds no ship command; `infrastructure/supera/`, `plugin-installer-service.ts` and `resources/plugins/supera/` go away. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

Dependency rules (dependency-cruiser, as in roost, plus two for Electron):

- `core/` must not import `application/`.
- `application/` must not import `infrastructure/`, except `ipc-module.ts` (composition root).
- `infrastructure/` must not import `application/` or `core/`.
- `core/` may import `infrastructure/` only through `core/interfaces` ports; concrete adapters are injected.
- `application/ui/` may import only `application/ui/` and `core/domain` (type-only). Nothing from main ever reaches the renderer bundle.
- `preload.ts` may import only `core/domain`.
- No circular deps, no orphans, every module reachable from `main.ts` or `application/ui/app.tsx`, no devDependency imports in production code.

### 5.3 Flow of one action: "Nova tarefa"

*(Superseded by M6: fetch the default branch, `git worktree add --no-track`, start the session in the worktree with the prompt file; later "Abrir PR" and the CI fix loop. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

1. Renderer submits `{repoId, description}` through `window.fly.task.create`.
2. `task-handler` validates and calls `TaskService.create`.
3. `TaskService` asks `VcsGateway` for the repo path and `SessionLauncher` to start a session named `<prefix>-<hex>` in the repo root with the initial command `claude --dangerously-skip-permissions --session-id <uuid> "/supera:ship <description>"`.
4. `TmuxSessionService` runs the tmux commands; `NodePtyTerminalService` spawns `tmux attach -t <name>` and streams bytes to the renderer through `session-handler`.
5. `WorkspaceService` notices a new entry in `git worktree list --porcelain` (fs.watch on `<repo>/.git/worktrees` plus a fallback poll) and emits a worktree-added event. `TaskService` binds the session to it; the tree shows the new worktree under the repo with status "engineer".
6. `QueueService` starts following the transcript for that session and the PR for that branch once `gh pr view` finds one.

### 5.4 Queue state

*(Amended by M6: the transcript row loses the receipt, the `.supera/plan.md` row goes away, and fly's lifecycle phase overrides the PR row: opening the PR, fixing CI or handling review comments ⇒ agent running, stopped ⇒ waiting for me. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

Inputs per worktree:

| Source | Signal |
|---|---|
| transcript JSONL | per D8b: pending `AskUserQuestion` or turn ended with nothing scheduled ⇒ waiting for me; pending tool_use or pending `ScheduleWakeup` ⇒ agent running; an Agent tool result whose subagent is `supera:supera-engineer` carries the receipt (validated against supera's `receipt.schema.json`) |
| `.supera/plan.md` | present ⇒ engineer has started |
| `gh pr list --json` (per repo, matched by head branch) | no PR ⇒ engineer/idle; checks pending ⇒ CI; any failure ⇒ failed; all green + mergeable + approved-or-no-review-required ⇒ ready; state merged ⇒ merged |
| tmux | session absent ⇒ idle (worktree exists, nobody working) |

Precedence, highest first: failed, ready, waiting for me, agent running, CI, idle, merged. Exact rules are left to the builder; the UI needs the seven states and a count of ready/working/ci/failed for the footer.

### 5.5 Sessions and tmux

- Session name: `<prefix>-<6 hex>` where prefix is derived from the worktree path relative to the root, lowercased, hidden components dropped, joined with `-` (code-sessions rule, ported to TS with its tests).
- One tmux session per worktree at most from fly's point of view; extra sessions a user starts by hand show up as "other sessions" on the worktree and can be attached too.
- Closing a tab detaches; it never kills tmux. Killing is an explicit action.
- On launch fly reconciles `tmux ls` with known worktrees and reattaches lazily when a worktree is selected.
- Resize, scrollback, copy/paste and font come from xterm.js; font is JetBrains Mono (bundled, with system fallback).

### 5.6 Supera integration

*(Superseded by M6: fly does not vendor, install, update or read supera, and depends on no plugin; the contracts below no longer exist. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

- fly vendors supera at the pinned version. First run (and after fly updates) runs `claude plugin marketplace add <path>` and `claude plugin install supera@<marketplace>` through the CLI if available, otherwise writes the equivalent entries to Claude Code's settings. If the user already has supera from another marketplace, fly leaves it alone and shows a notice.
- Contracts fly depends on: the `/supera:ship <task>` command, the `.worktrees/<slug>` layout, `.supera/plan.md`, and `receipt.schema.json`. Each is covered by a test fixture so a supera bump that breaks one fails fly's CI.

### 5.7 Editor and explorer

- Explorer: lazy tree of the worktree, `.git` and `node_modules` hidden, changed files flagged (M/A/D from `git status --porcelain`), directories containing changes open by default.
- Editor: CodeMirror 6, languages go, typescript, javascript, json, yaml, bash, markdown, dockerfile, makefile; theme generated from `tokens.syntax`; save with ⌘S writes through `FileStore`; dirty marker on tab; external change detection via fs.watch with "reload?" prompt.
- "Abrir no VSCode" runs `code <path>` (or `open -a "Visual Studio Code"` fallback) at the worktree or file.

### 5.8 Packaging and first run

- electron-vite for dev and build, electron-builder for `.dmg`. Unsigned build for personal use in v1; signing/notarization config present but optional.
- First run: folder picker, doctor (git, gh auth, tmux, claude), plugin install, theme from OS. *(Amended by M6: no plugin install; the wizard is dependencies, `fly` command, done.)*
- Updates: manual download in v1. Auto-update is out of scope. *(Amended by M6: a footer notice links to a newer GitHub Release; see `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

## 6. Milestones (for the plan, not commitments)

1. Shell: repo scaffold, design system, theming, workspace discovery, tree.
2. Terminal: tmux + node-pty + xterm.js, session lifecycle, reconciliation.
3. Queue state: transcript watcher + parser spike first, then PR polling, then the state machine.
4. Diff / PR panel.
5. Explorer + editor.
6. First-run flow, supera vendoring + install, packaging, macOS CD job. *(Amended by M6: distribution (dmg, wizard, `fly` command, update notice) plus the task lifecycle (worktree, "Abrir PR", CI fix loop), with no supera. See `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`.)*

## 7. Risks

- **Transcript format.** Undocumented and version-dependent. Mitigation: a 1–2 day spike before milestone 3 against the user's real `~/.claude/projects`; parser tolerant of unknown fields and events; unknown shapes degrade to "unknown" state, never crash.
- **Initial prompt argument with a slash command.** `claude "<prompt>"` is assumed to run `/supera:ship ...` as if typed. Verify in milestone 2; fallback is `tmux send-keys` after the TUI is ready. *(No longer applies after M6: the prompt carries no slash command.)*
- **tmux + xterm.js fidelity.** Mouse mode, alternate screen and resize storms are the usual pain points. Mitigation: match code-sessions' tmux options and test with Claude Code's TUI early.
- **Design system publish.** D4 needs a ship in `webapps` before fly can consume real tokens. Until then fly may vendor a copy of the token file with a TODO; that copy must not survive v1.

## 8. Builder-check calls (made by me, check while reading)

- D4: tokens + syntax + icons only, no antd; webapps publish is a separate prerequisite ship.
- D5: remote access via bare tmux commands; no fly CLI in v1 *(superseded, see D5)*.
- D8a: `--session-id` for fly-started sessions; best-effort mapping, "unknown" when ambiguous, for the rest.
- D8b: "waiting for me" = human input required; parser recognises `ScheduleWakeup` and `AskUserQuestion` *(amended by M6, see D8b)*.
- D12: manual repo bootstrap; repo public like roost.
- `gh pr list` per repo instead of `gh pr view` per worktree (rate limit).

## 9. Left to the builder

- Exact IPC channel naming and event batching.
- State store choice in the renderer.
- How often to poll `gh` when the window is unfocused.
- Parsing strategy for unified diff (library vs hand-rolled).
- Keyboard shortcut map beyond ⌘N (new task), ⌘S (save), ⌘1/2/3 (tabs).
- Test layering (unit for core and parsers; integration for git/tmux adapters against temp repos; smoke for the Electron shell).
