# fly — agent guide

fly is a macOS desktop app (Electron, arm64) for driving Claude Code across many repositories. The user opens a root folder; fly finds the git repos under it and their worktrees, runs `claude` in tmux sessions per worktree, and carries each task from prompt to merged pull request. The `fly` CLI starts, lists, resumes and stops the same sessions from any terminal.

The UI and the errors services throw are user-facing text in Portuguese (pt-BR). Code, comments, commits and docs are in English.

`CLAUDE.md` only imports this file. `CONTRIBUTING.md` (workflow, test isolation, CI gates) and `SECURITY.md` (private vulnerability reporting, scope, secrets) repeat some of its rules; a rule changed here changes there too.

## Starting a session

1. Read `src/core/domain/fly-api.ts` (the whole renderer ↔ main surface) and `src/application/ipc/ipc-module.ts` (every port and the adapter behind it).
2. Find the service for the area you touch in [Architecture](#architecture), then its spec under `tests/`, which mirrors `src/`.
3. `docs/superpowers/` holds the design and the M1–M6 plans. They are history: where they disagree with the code, the code wins.
4. A `Pn` in a code comment is a ruling of a milestone plan in `docs/superpowers/plans/`: lifecycle, task, cleanup and default-branch code cite the M6 plan; `queue-service.ts` cites M3; the editor, explorer, workbench and languages cite M5. New comments explain the reason in words instead.

This session may itself run inside a fly session on the default tmux server. See [Testing](#testing) before touching tmux.

## Architecture

### Processes

| Process | Entry | Role |
|---------|-------|------|
| main | `src/main.ts` | Loads the login shell's `PATH` and `LANG` (Finder gives a minimal `PATH`), builds the Nest application context from `IpcModule`, calls `register()` on every handler and opens the window (`contextIsolation: true`, `nodeIntegration: false`, `window.open` denied, navigation off the app blocked). Single instance: a second `fly <pasta>` hands its argv to the first and quits. |
| preload | `src/preload.ts` | Maps `FlyApi` onto `ipcRenderer` and exposes it as `window.fly` through `contextBridge`. |
| renderer | `src/application/ui` | React 19, antd, zustand (`state/fly-store.ts`), xterm.js, CodeMirror. Reaches the main process only through `window.fly`. |
| CLI | `src/cli.ts` | The `fly` command, wired by hand (no Nest). `bin/fly` runs it on fly's own Electron with `ELECTRON_RUN_AS_NODE`, so nothing it reaches may import `electron`. |

App data lives in `~/Library/Application Support/fly` (packaged) or `fly-dev` (`pnpm dev`): `config.json`, `tasks.json` and one `tasks/<id>/` folder per task.

### Layers

| Layer | Holds |
|-------|-------|
| `core/domain` | Types and constants every layer shares, including the IPC contract `fly-api.ts`. |
| `core/interfaces` | Ports: abstract classes that double as Nest tokens (`CommandRunner`, `VcsGateway`, `PrGateway`, `SessionLauncher`, `TerminalSpawner`, `TranscriptSource`, …). |
| `core/services` | The logic. `*-service.ts` are injectable classes; `*-rules.ts`, `lifecycle-steps.ts`, `lifecycle-poll.ts`, `session-naming.ts` and friends are pure functions the services call. |
| `infrastructure` | One folder per outside tool: `git`, `github` (`gh`), `tmux`, `pty` (node-pty), `claude` (transcripts), `filesystem`, `environment`, `process`. Output parsers are pure `*-parser.ts` files. |
| `application/ipc` | Handlers: register channels on `IpcHost`, own the timers, broadcast snapshots. `ipc-module.ts` is the composition root. |
| `application/cli` | The `fly` subcommands (`CliHandler`). |
| `application/ui` | `app-shell.tsx` lays out `panels/`; `editor/` holds the CodeMirror host, languages and the VSCode-like palette (`--ed*` variables); `terminal/`, `theme/`, `state/`. |

`pnpm dep:cruise` (`.dependency-cruiser.json`) enforces:

- `core` never imports `application` or `infrastructure`.
- `application` never imports `infrastructure`, except `src/application/ipc/ipc-module.ts`.
- `infrastructure` imports only `core/interfaces` and `core/domain`.
- `application/ui` imports only `application/ui` and type-only `core/domain`, never `electron` or Node built-ins.
- `preload.ts` imports only `core/domain`; `cli.ts` never reaches `electron`.
- No cycles, no orphans, every module reachable from an entry point, no devDependency at runtime.

### What runs on a timer

| Where | When | Does |
|-------|------|------|
| `SessionHandler` | every 3 s | Lists tmux sessions, broadcasts `session:changed`. |
| `QueueHandler.tick` | every 3 s | `LifecycleService.tick` (types queued instructions, settles finished turns), then broadcasts `queue:changed` when the snapshot changed. |
| `QueueHandler.refresh` | every 30 s | PR list through `gh`, then `LifecycleService.poll` (CI and review). |
| `GitDirWatcherService` | on `.git` changes (300 ms debounce, 15 s safety tick) | `workspace:changed`. |
| `TerminalHandler` | 8 ms batches | pty output to `terminal:data`. |
| `UpdateHandler` | every 6 h, packaged only | Latest release through `gh`, footer notice. |
| renderer | every 3 s | Diff of the selected worktree; disk state of open files. |

### Task lifecycle

1. **Nova tarefa** (`TaskService.create`): validates the input, resolves the default branch (`origin/HEAD`, else what GitHub reports), fetches, runs `git worktree add --no-track -b <branch> <repo>/.worktrees/<branch> origin/<base>`, adds `.worktrees` to the repo's `.git/info/exclude`, writes `prompt.md` and `attachments/` into `tasks/<id>/`, starts the session and saves the record in `tasks.json`.
2. **Session** (`SessionService.launch`, `session-naming.ts`): tmux session `<prefix>-<6 hex>` in the worktree running `claude --dangerously-skip-permissions --session-id <uuid> [--model <m>] -- "$(cat "$FLY_PROMPT_FILE")"; exit`, tagged with the tmux option `@fly_task`. Sessions fly did not start show as `external`.
3. **Status** (`QueueService`, `queue-rules.ts`): tmux sessions, Claude transcripts (`~/.claude/projects/**/*.jsonl`, read only), PRs from `gh` and the task record become one `QueueStatus` per worktree.
4. **Abrir PR** (`LifecycleService.openPullRequest`): only into an idle session (`isSessionIdle`: last turn ended, no open question, no background agent) with no unsent text (`TerminalService.hasDraft`). It types an instruction to commit and follow `pr-request.md`; when that turn ends, the tree must be clean, the branch is pushed and the PR is created from the `pr.json` the session wrote.
5. **CI and review** (`lifecycle-poll.ts`, `lifecycle-steps.ts`): a failed check sends a fix instruction with the failed jobs' log excerpt, up to `MAX_CI_ATTEMPTS` (3); new review comments send a review instruction. A conflict, a branch behind its base, a gone session or an exhausted CI loop stops the task with a `TaskStop`, which the PR tab shows with "Rodar de novo" (rerun failed jobs) and "Retomar" (drop the stop, watch again).
6. **Fazer merge / Limpar** (`LifecycleService.merge`, `clean`, `CleanupService`): `gh pr merge <n> --merge`, then removes the sessions, worktree, branches and record. Every step skips once done, so a failed cleanup can run again.

### Terminal path

xterm.js `onData` → `window.fly.terminal.write` → `TerminalHandler` → `TerminalService` (tracks drafts) → node-pty running `tmux -u attach-session -t =<name>` (no `TMUX`/`TMUX_PANE`, `TERM=xterm-256color`, `COLORTERM=truecolor`). Back: pty output batched every 8 ms → `terminal:data` → `xterm.write`. Resizing goes through `FitAddon` → `pty.resize`. Closing a tab kills only the tmux client; the session lives on.

## Recipes

### A new IPC call

1. Channel name and `FlyApi` method in `src/core/domain/fly-api.ts`.
2. Wire it in `src/preload.ts`.
3. Register it in a handler: `host.handle` for request/response, `host.on` for fire-and-forget, `BROADCASTER` for main → renderer events.
4. A new handler also needs a provider in `ipc-module.ts` and a `register()` call in `main.ts`.
5. Add it to the `window.fly` mock in `tests/ui/setup.ts` and test the handler with a fake `IpcHost`.

### A new outside tool

1. Abstract class in `core/interfaces`.
2. Adapter `infrastructure/<tool>/<name>-service.ts`, parsers as pure `*-parser.ts` files.
3. Provider in `ipc-module.ts`, and in `src/cli.ts` when the CLI needs it.
4. Unit tests mock `CommandRunner`; a test against the real binary goes under `tests/integration/<tool>` and follows [Testing](#testing). `pnpm test:di` proves the module still resolves.

### Signing

A release is signed with fly's self-signed certificate, so the app's designated requirement (`identifier "com.heronlabs.fly" and certificate root = H"09663078c96575a9f688f6b62b61ea4ddac1528a"`) is the same in every version and macOS keeps the privacy permissions given to fly; an ad-hoc signature is pinned to the build and lost them on every update.

The CD `dmg` job runs in the GitHub environment `release`, which only `main` can deploy to; its secrets `MAC_CERT_P12` and `MAC_CERT_PASSWORD` exist nowhere else. `scripts/signing-keychain.sh` builds a keychain from them with the key non-extractable, the job hands it to electron-builder as `CSC_KEYCHAIN`, and `scripts/sign-mac.ts` (`mac.sign`) signs with its identity. The keychain is deleted right after `pnpm dist`, before any third-party step; the third-party actions of that job are pinned by commit. The job fails when the result has no `Authority`, then attests the dmg's build provenance (`gh attestation verify`). Since the secrets never reach a pull request, the CI job `Release Signing` runs the same keychain script and `pnpm dist` with a certificate `scripts/make-signing-cert.sh` makes on the spot, so a broken signing path fails the pull request instead of the release.

A local `pnpm dist` has no keychain and signs ad-hoc. `scripts/make-signing-cert.sh` made the certificate; a new one is a new identity, so every user grants fly's permissions again, and its fingerprint changes in README, SECURITY.md and here. Not notarized: Gatekeeper still blocks the first launch.

### The app icon

Edit `build/icon.png`, run `scripts/make-icns.sh`, commit both. electron-builder picks `build/icon.icns` over the png; its own conversion draws the 16 and 32 px sizes as noise.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run the app with hot reload (electron-vite) |
| `pnpm build` | Build main (app `index.js` and CLI `cli.js`), preload and renderer into `out/` |
| `pnpm dist` | Build the arm64 dmg into `dist/` (run `pnpm build` first) |
| `pnpm cli:install` | Build, then link `bin/fly` into `~/.local/bin` (or `$FLY_BIN_DIR`) |
| `pnpm lint:check` | gts lint + json/yml lint (`pnpm lint:fix` applies fixes) |
| `pnpm typecheck` | Typecheck node and web projects |
| `pnpm test:unit` | vitest `node` and `ui` projects with 100% coverage thresholds |
| `pnpm test:di` | Nest DI smoke test: `IpcModule` resolves with real decorator metadata |
| `pnpm test:mutation` | Stryker mutation testing (vitest `node` project); CI fails below 100% |
| `pnpm dep:cruise` | Enforce the layer rules |

Targeted run without coverage: `pnpm vitest run --project <node|ui> <paths>`. Mutation run on some files: `pnpm stryker run stryker.conf.json --mutate '<file1>,<file2>'`.

Before a pull request, run what CI runs: `pnpm typecheck`, `pnpm lint:check`, `pnpm dep:cruise`, `pnpm test:unit`, `pnpm test:di`, `pnpm build`, and Stryker on the changed files Stryker mutates (all of `src` except entry points, `*-module.ts` and `application/ui`).

## Testing

| Folder | Project | Holds |
|--------|---------|-------|
| `tests/unit` | `node` | Mirrors `src`. Services are built by hand with mocked ports, no Nest. |
| `tests/integration` | `node` | Real tmux, git, node-pty and the CLI, isolated as below. |
| `tests/ui` | `ui` | jsdom and Testing Library; `tests/ui/setup.ts` mocks `window.fly`. |
| `tests/di` | `di` | `IpcModule` with real decorator metadata. |
| `tests/fixtures` | | `gh`, `hdiutil` and transcript samples. |

Specs read `it('Should …')`. Coverage is 100% over `src` except `main.ts`, `preload.ts`, `cli.ts`, `ipc-module.ts` and `application/ui` (whose specs still run).

Isolation:

- **tmux.** The default tmux server holds the user's real sessions, maybe including the one running you. Tests use a private socket `-L fly-test-<hex>` and kill that server afterwards; a manual probe does the same before you finish. Never `tmux kill-server` or kill a session you did not create on the default server.
- **claude.** A test that starts a session through `SessionService` (which types `claude …` into the pane) first sets the private server's `default-shell` to a fake shell that only records typed lines, so no pane runs `claude`.
- **Transcripts.** An `mkdtemp` projects dir injected through the `CLAUDE_PROJECTS_DIR` token; the DI test points `CLAUDE_CONFIG_DIR` at a temp dir. Never the real `~/.claude`.
- **App data.** CLI tests inject the user-data dir. Never the real `~/Library/Application Support/fly` or `fly-dev`.
- **`gh`.** Always mocked, through `CommandRunner` or `PrGateway`. Never the real `gh`.
- **`git`.** Mocked through `CommandRunner` in unit tests; an `mkdtemp` repo in integration tests. Never the user's repos.
- **Files.** Every path the renderer sends over `file:*` is worktree-relative POSIX. `FileService` resolves it inside the worktree's real path and refuses anything else (`Caminho fora do worktree`); new files are created exclusively (`wx`), so a dangling symlink is never followed; an existing symlink is written only when its real path is inside the worktree.
- **Editor.** Panel specs mock `CodeEditor` (`src/application/ui/editor/code-editor`) the same way they mock `TerminalView`. `tests/ui/editor` runs real CodeMirror in jsdom with three stubs in `tests/ui/setup.ts`.

### Mutation testing

Kill a surviving mutant with a test first; if that is not possible, with a behaviour-preserving simplification; only for a genuine equivalent mutant, with `// Stryker disable next-line <Mutator>: <reason>`. Never disable whole files, blocks or `all`. `vitest.stryker.config.ts` mirrors the `node` project of `vitest.config.ts` by hand, so change both together.

## Conventions

- **Structure is checked by tools, not by review.** `dep:cruise`, lint and typecheck own the layout. A convention worth keeping gets a check; review looks at behaviour.
- Kebab-case files. Injectable classes end in `-service.ts`, `-handler.ts` or `-module.ts`; pure logic sits in `-rules.ts` and similar files next to its service.
- Comments say why, not what.
- Public docs (README, the blog post, the tool page) never link private repositories such as `heronlabs/code-sessions`; they explain the point in the text.
- Toolchain: Node >=22 (`.node-version`), pnpm >=10, TypeScript ~5.8 strict with `noUncheckedIndexedAccess`.

## Workflow

- Commits follow Conventional Commits with a scope (`feat(ipc): …`, `fix(ui): …`, `test(core): …`).
- One logical change per pull request; fill in the template.
- The release workflow (`action-tag-release`) bumps the version, writes `CHANGELOG.md`, tags the release and uploads the signed dmg when a pull request is merged.

## HARD RULES

- **NEVER edit `version.txt` or `CHANGELOG.md` manually.** The CD workflow owns both.
- **NEVER commit directly to `main`.** Every change starts in a worktree under `.worktrees/` on a branch from `main` and reaches `main` through a pull request; only the owner merges.
