# fly — heronlabs agent cockpit

Electron desktop app (main process runs NestJS, renderer is React) for driving agent-based development across many repositories. Spec and plan live in `docs/superpowers/`.

`CONTRIBUTING.md` (workflow, test isolation, CI gates) and `SECURITY.md` (private vulnerability reporting, scope, secrets) repeat some rules of this file; a rule changed here changes there too.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run the app with hot reload (electron-vite) |
| `pnpm build` | Build main (app `index.js` and CLI `cli.js`), preload and renderer into `out/` |
| `pnpm cli:install` | Build, then link `bin/fly` into `~/.local/bin` (or `$FLY_BIN_DIR`) |
| `pnpm lint:check` | gts lint + json/yml lint |
| `pnpm test:unit` | vitest with 100% coverage thresholds |
| `pnpm test:di` | Nest DI smoke test: `IpcModule` resolves with real decorator metadata |
| `pnpm test:mutation` | Stryker mutation testing (vitest `node` project); CI fails below 100% |
| `pnpm dep:cruise` | Enforce layer rules |
| `pnpm typecheck` | Typecheck node and web projects |

Targeted run without coverage: `pnpm vitest run --project <node|ui> <paths>`.

Mutation run on some files: `pnpm stryker run stryker.conf.json --mutate '<file1>,<file2>'`.

## Testing and tmux

Tests that touch tmux always use a private socket `-L fly-test-<hex>` and kill that server afterwards. Never the default tmux server: production sessions live there, so bare `tmux ls` / `tmux attach -t <name>` from Termius sees them.

Transcript tests use an `mkdtemp` projects dir injected through the `CLAUDE_PROJECTS_DIR` token (the DI test points `CLAUDE_CONFIG_DIR` at a temp dir). Never the real `~/.claude`.

A test that starts a session through `SessionService` (which types `claude …` into the pane) first sets the private server's `default-shell` to a fake shell that only records typed lines, so no pane ever runs `claude`. CLI tests inject the user-data dir; never the real `~/Library/Application Support/fly`.

`gh` is always mocked in tests, through `CommandRunner` or `PrGateway`. Never the real `gh`.

`git` is mocked through `CommandRunner` in unit tests and runs against an `mkdtemp` repo in integration tests. Never the user's repos.

Panel specs mock `CodeEditor` (`src/application/ui/editor/code-editor`) the same way they mock `TerminalView`. `tests/ui/editor` runs real CodeMirror in jsdom with three stubs in `tests/ui/setup.ts`.

Every path the renderer sends over `file:*` is worktree-relative POSIX. `FileService` resolves it inside the worktree's real path and refuses anything else (`Caminho fora do worktree`); new files are created exclusively (`wx`), so a dangling symlink is never followed; an existing symlink is written only when its real path is inside the worktree.

## Mutation testing

Kill a surviving mutant with a test first; if that is not possible, with a behaviour-preserving simplification; only for a genuine equivalent mutant, with `// Stryker disable next-line <Mutator>: <reason>`. Never disable whole files, blocks or `all`. `vitest.stryker.config.ts` mirrors the `node` project of `vitest.config.ts` by hand, so change both together.

## Layout and layer rules

`src/{application,core,infrastructure}` plus `src/main.ts`, `src/preload.ts` and `src/cli.ts` (composition root of the `fly` CLI, whose commands live in `src/application/cli`); the renderer lives under `src/application/ui`. `src/application/ui/editor` holds the CodeMirror host, languages and the VSCode-like palette (`--ed*` variables). Kebab-case files with `-service.ts` / `-handler.ts` / `-module.ts` suffixes.

- `core` never imports `application`.
- `application` never imports `infrastructure`, except `src/application/ipc/ipc-module.ts` (composition root).
- `infrastructure` never imports `application` or `core`, except `core/interfaces` and `core/domain`.
- `application/ui` imports only `application/ui` and type-only `core/domain`.
- `preload.ts` imports only `core/domain`.
- `cli.ts` never reaches `electron`: `bin/fly` runs it on Electron in Node mode (`ELECTRON_RUN_AS_NODE`).

## Electron two-process note

The renderer never touches Node or Electron APIs. It talks to the main process only through `window.fly`, exposed by `preload.ts` via `contextBridge`. Channel names live in `src/core/domain/fly-api.ts`.

## Toolchain

Node >=22 (`.node-version`), pnpm >=10, TypeScript ~5.8 strict with `noUncheckedIndexedAccess`.

## HARD RULES

- **NEVER edit `version.txt` manually.** Version is managed by `action-tag-release` via the CD workflow.
- **ALWAYS use `/supera:ship`** for every change. No exceptions.
- **NEVER commit directly to `main`.** All changes go through worktree, PR, pr-watch.
