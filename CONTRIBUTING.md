# Contributing

## Setup

```bash
pnpm install
pnpm dev
```

You need:

- Node `>=22` (`.node-version`) and pnpm `>=10`;
- `tmux` `>= 3.2` (`brew install tmux`), which the integration tests and the mutation tests run;
- `git`, and `gh` and `claude` to use the app itself (see [Prerequisites](README.md#prerequisites)).

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run the app with hot reload (electron-vite) |
| `pnpm build` | Build main (app `index.js` and CLI `cli.js`), preload and renderer into `out/` |
| `pnpm dist` | Build the arm64 dmg into `dist/` (run `pnpm build` first) |
| `pnpm cli:install` | Build, then link `bin/fly` into `~/.local/bin` (or `$FLY_BIN_DIR`) |
| `pnpm lint:check` | gts lint + json/yml lint |
| `pnpm lint:fix` | Apply the fixes gts and eslint can make |
| `pnpm typecheck` | Typecheck node and web projects |
| `pnpm test:unit` | vitest with 100% coverage thresholds |
| `pnpm test:di` | Nest DI smoke test: `IpcModule` resolves with real decorator metadata |
| `pnpm test:mutation` | Stryker mutation testing (vitest `node` project), 100% break threshold |
| `pnpm dep:cruise` | Enforce the layer rules |

Targeted run without coverage: `pnpm vitest run --project <node|ui> <paths>`. Mutation run on some files: `pnpm stryker run stryker.conf.json --mutate '<file1>,<file2>'`.

## Workflow

1. Every change starts in a worktree under `.worktrees/`, on a branch from `main` (`git worktree add .worktrees/<branch> -b <branch> main`), and reaches `main` through a pull request to `main`. Never push to `main`.
2. Only the owner merges pull requests.
3. One logical change per pull request. Fill in the pull request template.
4. Commits follow [Conventional Commits](https://www.conventionalcommits.org/) with a scope (`feat(ipc): ...`, `fix(ui): ...`, `test(core): ...`).
5. Never edit `version.txt` or `CHANGELOG.md`. The release workflow bumps the version, writes the changelog and tags the release when the pull request is merged.

## Conventions

`AGENTS.md` is the reference, with the architecture and recipes for common changes. In short:

- **Layer rules.** `core` never imports `application`; only `src/application/ipc/ipc-module.ts` imports `infrastructure`; `infrastructure` imports only `core/interfaces` and `core/domain`; `application/ui` imports only itself and type-only `core/domain`; `src/cli.ts` never reaches `electron`. `pnpm dep:cruise` enforces them.
- **Renderer isolation.** The renderer never touches Node or Electron APIs; it talks to the main process only through `window.fly`, exposed by `preload.ts` via `contextBridge`.
- **Mutation testing.** Kill a surviving mutant with a test first; if that is not possible, with a behaviour-preserving simplification; only for a genuine equivalent mutant, with `// Stryker disable next-line <Mutator>: <reason>`. Never disable whole files, blocks or `all`.

## Test isolation

Tests never touch your real sessions, transcripts, repositories or GitHub account:

- **tmux.** Tests that touch tmux use a private socket `-L fly-test-<hex>` and kill that server afterwards, never the default tmux server, where your real sessions live. A test that starts a session through `SessionService` gives that server a fake `default-shell` that only records typed lines, so no pane runs `claude`.
- **App config.** CLI tests inject the user-data dir, never the real `~/Library/Application Support/fly` or `~/Library/Application Support/fly-dev`.
- **Transcripts.** Transcript tests use an `mkdtemp` projects dir injected through the `CLAUDE_PROJECTS_DIR` token, and the DI test points `CLAUDE_CONFIG_DIR` at a temp dir, never the real `~/.claude`.
- **`gh`.** Always mocked, through `CommandRunner` or `PrGateway`, never the real `gh`.
- **`git`.** Mocked through `CommandRunner` in unit tests; runs against an `mkdtemp` repo in integration tests, never your repositories.

## CI

Every pull request must pass:

| Job | Runs |
|-----|------|
| Install & Build | `pnpm typecheck`, `pnpm build` |
| Audit & Supply Chain | `pnpm dep:cruise`, `pnpm audit --audit-level=high` |
| Lint | `pnpm lint:check` |
| Unit Tests | `pnpm test:unit` at 100% coverage, `pnpm test:di` |
| Mutation Tests | `pnpm test:mutation` at a 100% mutation score, written to the job summary |
| Release Signing | `pnpm build`, `pnpm dist` signed with a throwaway certificate on macOS, then checks the signature has an `Authority` |
