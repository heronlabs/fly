# fly M4 — Diff / PR Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Diff / PR — Marco 4" placeholder with a collapsible right column that shows, for the selected worktree, the live working-tree changes, the branch diff against the repo's main branch, the pull request (title, checks, review, link) with a merge button, and the supera-engineer receipt.

**Architecture:**
- **Diff (infrastructure + core):** `GitCliService` runs `git diff` for the two scopes and a pure `unified-diff-parser.ts` turns the output into a domain `Diff`. `DiffService` (core) resolves the base ref from the workspace, calls the `VcsGateway`, caps big diffs with `diff-rules.ts` and never throws a git failure to the UI.
- **Pull request:** `PullRequest` gains `title` and per-check rows; `PrGateway.merge` runs `gh pr merge --merge`; `QueueService.mergePullRequest` guards it and refreshes the PR list right after.
- **IPC:** a `DiffHandler` answers `diff:get` on demand. The renderer polls only the selected worktree, only while the panel is open and the Diff tab is shown, every 3 s. `QueueHandler` handles `pr:merge`; `ShellHandler` handles `shell:open-external`.
- **Renderer:** `DiffPrPanel` with tabs `Diff` (sub-tabs `Alterações locais` / `Branch`) and `PR`. The collapse state lives in `AppConfig.diffPanel` and the toggle sits in the top bar.

**Tech Stack:** M3 stack, no new dependencies. External tools: `git` 2.x, `gh` (authenticated).

**Spec:** `docs/superpowers/specs/2026-10-19-fly-design.md` (milestone 4 of 6: §2 goal 6, D2, D8, §5.2 `diff-service.ts` / `pr-handler.ts`, §5.4 PR mapping, §9 "parsing strategy for unified diff"). Visual reference: the prototype linked at the top of the spec (Diff/PR tabs). The receipt display was deferred from M3 (ruling P10 there).

**Decisions from the brainstorm (2026-10-21, the user's):**
- The panel exists mainly to follow what the engineer is doing while it runs. It shows **both** the uncommitted working tree (live) and the branch diff against base.
- The panel is **collapsible** ("opção de esconder").

**Verified before planning (2026-10-21, git 2.x on macOS):** real `git diff --no-color --no-ext-diff` output shapes, used by Task 1's fixtures:
- A path with spaces ends the `--- a/…` / `+++ b/…` lines with a **trailing tab** (`+++ b/new file.txt\t`).
- Untracked file via `git diff --no-index -- /dev/null "<file>"`: header `diff --git a/<file> b/<file>`, `new file mode 100644`, `--- /dev/null`, `+++ b/<file>`, then hunks. **Exit code 1** when there is a diff.
- Rename with mode change: `old mode 100644`, `new mode 100755`, `similarity index 50%`, `rename from f.txt`, `rename to g.txt`, `index …`, then `---`/`+++`/hunks. A 100% rename has no `index`/hunks.
- Binary add: `Binary files /dev/null and b/b.bin differ`, no hunks.

## Global Constraints

- Every M1–M3 constraint still holds: layer and dependency rules (`pnpm dep:cruise`), 100% coverage on `src/core`, `src/infrastructure` and `src/application/ipc`, 100% Stryker score on the `node` project (`pnpm test:mutation`), kebab-case files with `-service`/`-handler`/`-module` suffixes, pt-BR copy, no hardcoded paths. `gh` and `git` are always mocked through `CommandRunner` in unit tests; the integration spec for `GitCliService` uses an `mkdtemp` repo.
- Git commands run with `cwd` = the worktree path, `--no-color --no-ext-diff -c core.quotepath=false`, and a 15 s timeout. A timeout (`killed === true`) becomes the error `git não respondeu em 15 s`; any other non-zero exit becomes `git falhou: <stderr>`. Never `git add`, never `git add -N`, never write to the worktree.
- `gh pr merge` runs with a 60 s timeout and the same `killed` mapping as `GhCliService.run` (message `gh não respondeu em 60 s`). No `--delete-branch`: pr-watch's cleanup owns branch deletion and is idempotent.
- Size caps (`core/services/diff-rules.ts`): `MAX_FILE_LINES = 500` (a file with more hunk lines keeps its stats and drops its hunks, `truncated: true`), `MAX_TOTAL_LINES = 3000` (once the running total passes it, every later file is stat-only and `Diff.truncated = true`). A `maxBuffer` rejection from `execFile` is a git failure like any other (error row, never a crash).
- Theme: use the existing `--diffAddBg`, `--diffDelBg`, `--diffDelFg`, `--badgeOk`, `--badgeErr`, `--badgeWarn`, `--badgeReview`, `--badgeMerged` variables from `theme.ts`. Add none.
- pt-BR copy (new):
  - Tabs: `Diff`, `PR`. Sub-tabs: `Alterações locais`, `Branch`.
  - Empty states: `Sem alterações`, `Sem PR aberto`, `Este é o worktree principal` (branch tab on a main worktree), `Selecione um worktree`.
  - Rows: `Arquivo binário`, `Arquivo grande (N linhas)`, `Diff truncado`, `renomeado de <old>`.
  - PR: `Checks`, `Review`, `Abrir no GitHub`, `Fazer merge`, `Confirmar`, `Cancelar`, `Merge feito`. Review values: `aprovado`, `mudanças pedidas`, `pendente`, `não exigido`. Check states: `ok`, `rodando`, `falhou`.
  - Receipt: `Receipt do engineer`, `Arquivos`, `Verificação`, `Receipt inválido`.
  - Top bar toggle: `Esconder painel` / `Mostrar painel`.
  - Errors: `git falhou: <msg>`, `git não respondeu em 15 s`, `gh não respondeu em 60 s`, `Worktree não encontrado`, `Sem PR aberto para fazer merge`, `URL não permitida`.
- Git flow: worktree `.worktrees/feat-m4-diff-pr` on branch `feat-m4-diff-pr` from `origin/main`, per-task commits, one PR at the end watched with `/supera:pr-watch`; never push to `main`; `version.txt` untouched. The user chose this one-branch milestone flow (as M1–M3) over one `/supera:ship` per task. Commits end with the session's `Co-Authored-By` trailer.
- Test commands:
  - Targeted runs: `pnpm vitest run --project <node|ui> <paths>`.
  - Gate: `pnpm typecheck && pnpm lint:check && pnpm dep:cruise && pnpm test:unit && pnpm test:di && pnpm build`, then `pnpm stryker run stryker.conf.json --mutate '<files of the task>'` on the task's node-side files.
  - Tasks 1–4 add modules `main.ts` does not reach yet. Until Task 5 wires the handlers, the gate tolerates only `no-unreachable-from-entry`/`no-orphans` on this plan's new modules.
- Wiring every node-side change pays for, once, in Task 5: `fly-api.ts` channels and types, `preload.ts`, `ipc-module.ts` providers, `main.ts` registration, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts` stub.

## Planning rulings

Each ruling: decision, then what it costs if wrong.

- **P1. Base ref** = the repo's `isMain` worktree's `branch`, else its `head` when detached. Branch scope diffs `<base>...HEAD` (three-dot, merge-base). A main worktree has no base: the branch tab shows `Este é o worktree principal`. Cost: a repo whose main checkout sits on a feature branch compares against that branch.
- **P2. Live scope** = `git diff HEAD` (staged + unstaged) plus one `git diff --no-index -- /dev/null <file>` per untracked file from `git ls-files --others --exclude-standard -z`. Exit 1 is success for `--no-index` only. Cost: one process per untracked file; a worktree with hundreds of untracked files is slow until the total cap trims the output (the cap applies after parsing, so the processes still run).
- **P3. Parser placement.** The unified-diff parser is pure and lives in `infrastructure/git` next to `worktree-porcelain-parser.ts` (M3 P2: formats in infrastructure, rules in core). Paths come from `rename to`/`+++ b/`/`--- a/` lines, with the `diff --git` header as the fallback for files without hunks. Cost: none.
- **P4. Polling is renderer-driven**: `DiffPrPanel` calls `window.fly.diff.get` on selection and every `DIFF_POLL_MS = 3000` while mounted, the panel is open and the Diff tab is shown; the store skips `set` when the serialized result is unchanged. Nothing is computed for unselected worktrees. Cost: no diff for worktrees you are not looking at; a switch shows the previous worktree's diff for up to one round trip (the panel clears `diff` on worktree change to avoid that).
- **P5. Truncated files are not expandable** in v1: the row shows the stats, `Arquivo grande (N linhas)` and the existing "Abrir no VSCode" action (`shell.openInEditor(path)`). Cost: a big generated file must be read in the editor.
- **P6. Merge** = `gh pr merge <n> --merge` (the repo history uses merge commits, see PR #7). The UI enables `Fazer merge` only when the worktree's queue status is `ready`, with the two-step `Confirmar`/`Cancelar` pattern from `session-panel.tsx`. The service guards only "an open PR exists". After the merge the PR list is refreshed so the badge turns `merged` on the next tick. Cost: a merge started from fly while pr-watch watches the PR is fine (pr-watch observes `MERGED` and cleans up); a squash-only repo rejects `--merge` and shows gh's error.
- **P7. External links** go through a `LinkOpener` port provided by `ipc-module.ts` with Electron's `shell.openExternal`. The handler accepts only `https:` URLs. Cost: none.
- **P8. Collapse state** is `AppConfig.diffPanel: 'open' | 'collapsed'` (default `open`), persisted like the theme. Collapsed, the panel unmounts (no polling) and the grid becomes `320px 1fr`. Cost: none.
- **P9. Check rows** come from `statusCheckRollup` entries: `CheckRun` → `name` + `detailsUrl`, `StatusContext` → `context` + `targetUrl`. Entries of unknown shape are dropped from the rows but still count in `checks` as today. Cost: none.
- **P10. The receipt shows on the PR tab** whether or not a PR exists (the engineer finishes before the PR opens). It reads `WorktreeQueue.receipt` from the queue snapshot already in the store. Cost: none.

## Review Focus

1. **A diff larger than the renderer can draw** (lockfiles, generated files, a 20 MB build artifact). The panel stays responsive: per-file and total caps hold, a `maxBuffer` rejection shows `git falhou: …` and the next poll recovers. Tests: Task 1 (`capDiff`), Task 2 (rejection → error row), Task 6 (truncated rows).
2. **Paths git prints oddly**: spaces (trailing tab), non-ASCII (`core.quotepath=false`), a rename without hunks, a mode-only change, a binary file, `\ No newline at end of file`, CRLF content. Each renders a row and never throws. Tests: Task 1 (one fixture per shape).
3. **A worktree with no commits or whose base is gone** (`HEAD` unborn, base branch deleted after a merge). The scope shows `git falhou: <stderr>` and the other scope still works. Tests: Task 2 (`DiffService` error isolation per scope).
4. **Merging twice, or merging a PR that just got a failing check.** The button is enabled only on `ready`; while `merging` it is disabled; a gh error shows in the panel and the state is re-read. Tests: Task 3 (service guard), Task 6 (button states, double click).
5. **Switching worktrees while a poll is in flight.** A late response for the previous worktree is discarded (the store compares `worktreeId`). Test: Task 6 (store `applyDiff` ignores a stale id).

---

### Task 1: Diff domain, unified-diff parser and caps

**Files:**
- Create: `src/core/domain/diff.ts`, `src/core/services/diff-rules.ts`, `src/infrastructure/git/unified-diff-parser.ts`
- Test: `tests/unit/infrastructure/git/unified-diff-parser.spec.ts`, `tests/unit/core/services/diff-rules.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/domain/diff.ts
  export type DiffScope = 'live' | 'branch';
  export type DiffLineKind = 'context' | 'add' | 'del';
  export type DiffLine = {kind: DiffLineKind; text: string; oldNo: number | null; newNo: number | null};
  export type DiffHunk = {header: string; lines: DiffLine[]}; // header = the full "@@ … @@ …" line
  export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed';
  export type DiffFile = {
    path: string;            // new path; the old path for a deletion
    oldPath: string | null;  // set only for renames
    status: DiffFileStatus;
    binary: boolean;
    additions: number;
    deletions: number;
    lines: number;           // additions + deletions + context lines, before any cap
    hunks: DiffHunk[];       // [] for binary, rename-only, mode-only and truncated files
    truncated: boolean;
  };
  export type Diff = {files: DiffFile[]; truncated: boolean};
  export type WorktreeDiff = {
    worktreeId: string;
    scope: DiffScope;
    base: string | null;     // the ref the branch scope compared against; null for live or a main worktree
    diff: Diff | null;       // null when error is set or the worktree is main in branch scope
    error: string | null;
  };

  // infrastructure/git/unified-diff-parser.ts
  export const parseUnifiedDiff: (output: string) => DiffFile[];

  // core/services/diff-rules.ts
  export const MAX_FILE_LINES = 500;
  export const MAX_TOTAL_LINES = 3000;
  export const capDiff: (files: DiffFile[]) => Diff;
  ```
- `parseUnifiedDiff` rules:
  - A file starts at each `diff --git a/<old> b/<new>` line. Header lines until the first `@@`: `old mode`, `new mode`, `new file mode` → `added`, `deleted file mode` → `deleted`, `similarity index` + `rename from`/`rename to` → `renamed` with `oldPath`, `index …`, `Binary files … differ` → `binary: true`, `--- a/…|/dev/null`, `+++ b/…|/dev/null`. The default status is `modified`.
  - `path` = `rename to` value, else the `+++ b/` path, else the `--- a/` path (deletion), else the `b/<new>` part of the `diff --git` header. A trailing tab on `---`/`+++` lines is stripped.
  - Hunk header `@@ -o[,n] +o[,n] @@[ ctx]` resets the counters; ` `/`+`/`-` lines carry `oldNo`/`newNo` (null on the side they don't exist in); `\ No newline at end of file` is ignored; a CR before the LF stays in `text` (never split on `\r`).
  - `additions`/`deletions` count `+`/`-` lines; `lines` counts every hunk line.
  - Unknown header lines are ignored. Empty input → `[]`.
- `capDiff`: walks files in order, keeping a running total of `lines`. A file with `lines > MAX_FILE_LINES`, or whose addition would push the total past `MAX_TOTAL_LINES`, gets `hunks: []` and `truncated: true`; the latter also sets `Diff.truncated = true`. Stats are never dropped.

- [ ] **Step 1: Write the failing tests.** One fixture string per shape, assertions on the full `DiffFile`:
  - modify (the `f.txt` shape above): `status: 'modified'`, one hunk, lines `[context a (1,1), del b (2,null), add c (null,2)]`, `additions: 1`, `deletions: 1`, `lines: 3`.
  - add with a space in the path and the trailing tab: `path: 'new file.txt'`, `status: 'added'`, `oldPath: null`.
  - delete (`deleted file mode`, `+++ /dev/null`): `path` from `--- a/`.
  - rename + mode (the `f.txt → g.txt` shape): `status: 'renamed'`, `oldPath: 'f.txt'`, `path: 'g.txt'`, hunks parsed.
  - 100% rename without hunks: `hunks: []`, `lines: 0`.
  - mode-only change: `modified`, `hunks: []`.
  - binary add: `binary: true`, `status: 'added'`, `hunks: []`.
  - `\ No newline at end of file` after a `-` line: not a line, counts unchanged.
  - CRLF content: `text` keeps `\r`.
  - two files in one output, with a hunk header carrying function context: `header` equals the full line.
  - empty string → `[]`; a lone `diff --git` header with nothing after → one `modified` file with no hunks.
  - `capDiff`: a 501-line file is stat-only and `truncated`; three 1200-line files → the third is stat-only and `Diff.truncated` is true; two 100-line files pass through untouched with `truncated: false`.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/infrastructure/git tests/unit/core/services/diff-rules.spec.ts`.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run to verify pass**, then the gate and `pnpm stryker run stryker.conf.json --mutate 'src/infrastructure/git/unified-diff-parser.ts,src/core/services/diff-rules.ts'` at 100%.
- [ ] **Step 5: Commit** — `feat(git): parse unified diffs into a capped domain diff`.

---

### Task 2: Git diff gateway and DiffService

**Files:**
- Modify: `src/core/interfaces/vcs-gateway.ts`, `src/infrastructure/git/git-cli-service.ts`
- Create: `src/core/services/diff-service.ts`
- Test: `tests/unit/infrastructure/git/git-cli-service.spec.ts`, `tests/integration/git/git-cli-service.spec.ts`, `tests/unit/core/services/diff-service.spec.ts`

**Interfaces:**
- Consumes: `parseUnifiedDiff`, `capDiff`, `DiffFile`, `Diff`, `WorktreeDiff` (Task 1); `SessionService.currentWorkspace()`; `CommandRunner`.
- Produces:
  ```ts
  // core/interfaces/vcs-gateway.ts (added)
  export const GIT_TIMEOUT_MESSAGE = 'git não respondeu em 15 s';
  export type DiffRequest =
    | {worktreePath: string; scope: 'live'}
    | {worktreePath: string; scope: 'branch'; base: string};
  abstract diff(request: DiffRequest): Promise<DiffFile[]>;

  // core/services/diff-service.ts
  @Injectable() export class DiffService {
    constructor(sessions: SessionService, vcs: VcsGateway) {}
    read(worktreeId: string, scope: DiffScope): Promise<WorktreeDiff>;
  }
  export const baseOf: (workspace: Workspace, worktree: Worktree) => string | null;
  ```
- `GitCliService.diff`:
  - Common args: `['-c', 'core.quotepath=false', 'diff', '--no-color', '--no-ext-diff']`; options `{cwd: worktreePath, timeoutMs: 15_000}`.
  - `branch`: `… '<base>...HEAD'`. Non-zero → `throw new Error(`git falhou: ${stderr.trim()}`)`.
  - `live`: `… 'HEAD'`, then `git ls-files --others --exclude-standard -z` (NUL-split, empty entries dropped), then per file `… '--no-index', '--', '/dev/null', '<file>'` accepting exit codes 0 and 1. Outputs are concatenated in that order and parsed once.
  - A rejection with `killed === true` → `GIT_TIMEOUT_MESSAGE`; other rejections propagate.
- `baseOf`: the worktree of the same `repoId` with `isMain`: its `branch ?? head`; `null` when `worktree.isMain` or no main worktree is listed.
- `DiffService.read`:
  - No workspace or unknown id → `throw new Error('Worktree não encontrado')`.
  - `branch` scope with `baseOf === null` → `{diff: null, base: null, error: null}`.
  - Otherwise `vcs.diff(...)` → `capDiff` → `{diff, base, error: null}`; a rejection → `{diff: null, base, error: message}` where `message` is the error's message (already prefixed by the gateway).

- [ ] **Step 1: Write the failing tests.**
  - Unit (`CommandRunner` mocked): the exact argv and options of each call; exit 1 accepted only for `--no-index`; a non-zero `diff HEAD` throws `git falhou: <stderr>`; `killed` → timeout message; output concatenation reaches the parser (two files from two sources).
  - Integration (`mkdtemp` repo, real `git`, `ExecCommandRunnerService`): one commit, then a modified tracked file and an untracked file → `live` returns both with the right statuses; a branch with one commit off `main` → `branch` returns its file; the branch name with `...HEAD` is passed as one argument.
  - `DiffService`: unknown id throws; main worktree in branch scope → null diff, null error; gateway rejection → error string, `diff: null`; `capDiff` applied (a 501-line file comes back truncated); `baseOf` detached main → its `head`.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/infrastructure/git tests/integration/git tests/unit/core/services/diff-service.spec.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the gate and Stryker on `src/infrastructure/git/git-cli-service.ts,src/core/services/diff-service.ts`.
- [ ] **Step 5: Commit** — `feat(git): read live and branch diffs of a worktree`.

---

### Task 3: PR title, check rows and merge

**Files:**
- Modify: `src/core/domain/queue.ts`, `src/core/interfaces/pr-gateway.ts`, `src/infrastructure/github/pr-list-parser.ts`, `src/infrastructure/github/gh-cli-service.ts`, `src/core/services/queue-service.ts`
- Test: `tests/unit/infrastructure/github/pr-list-parser.spec.ts`, `tests/unit/infrastructure/github/gh-cli-service.spec.ts`, `tests/unit/core/services/queue-service.spec.ts`, plus every fixture that builds a `PullRequest` (`queue-rules.spec.ts`, UI specs) gains `title` and `checkRuns`.

**Interfaces:**
- Produces:
  ```ts
  // core/domain/queue.ts (added)
  export type CheckRun = {name: string; state: 'passing' | 'pending' | 'failing'; url: string | null};
  // PullRequest gains: title: string; checkRuns: CheckRun[];

  // core/interfaces/pr-gateway.ts (added)
  export const GH_MERGE_TIMEOUT_MESSAGE = 'gh não respondeu em 60 s';
  abstract merge(repoPath: string, number: number): Promise<void>;

  // core/services/queue-service.ts (added)
  export const NO_OPEN_PR = 'Sem PR aberto para fazer merge';
  mergePullRequest(worktreeId: string): Promise<void>;
  ```
- `pr-list-parser.ts`: the `--json` list gains `title`; `title` maps from `entry.title` when a string, else `''`. `checkRuns` keeps the rollup order: `CheckRun` entries use `name`/`detailsUrl`, `StatusContext` entries `context`/`targetUrl`; a missing or non-string name drops the row; a non-string url is `null`; the state is `classifyCheck`'s result. `checks` aggregation is unchanged.
- `GhCliService.merge`: `gh pr merge <number> --merge` with `{cwd: repoPath, timeoutMs: 60_000}`; non-zero → `throw new Error(stderr.trim() || 'gh pr merge failed')`; `killed` → `GH_MERGE_TIMEOUT_MESSAGE`.
- `QueueService.mergePullRequest`: finds the worktree (else `Worktree não encontrado`), its repo path and its **open** PR via the existing `pullRequestOf` (else `NO_OPEN_PR`), calls `prs.merge(repoPath, pr.number)`, then `refreshPullRequests()`.

- [ ] **Step 1: Write the failing tests.**
  - Parser: `title` present and absent; a `CheckRun` row with url, a `StatusContext` row with `targetUrl: null`, an entry without a name is dropped, order preserved.
  - Gateway: argv `['pr', 'merge', '12', '--merge']` with cwd and 60 s; non-zero stderr thrown; `killed` → timeout message.
  - Service: unknown worktree throws; a worktree without an open PR (none, or only a merged one) throws `NO_OPEN_PR`; a merge calls the gateway with the repo path and number, then refreshes; a gateway rejection propagates and no refresh runs.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/infrastructure/github tests/unit/core/services/queue-service.spec.ts`.
- [ ] **Step 3: Implement**, updating every `PullRequest` fixture.
- [ ] **Step 4: Run to verify pass**, then the gate and Stryker on the three changed source files.
- [ ] **Step 5: Commit** — `feat(github): list check rows and merge a worktree's pull request`.

---

### Task 4: Collapse setting

**Files:**
- Modify: `src/core/domain/settings.ts`, `src/infrastructure/environment/json-config-store-service.ts`
- Test: `tests/unit/infrastructure/environment/json-config-store-service.spec.ts`, `tests/unit/core/services/settings-service.spec.ts` (only if it enumerates the config keys)

**Interfaces:**
- Produces:
  ```ts
  // core/domain/settings.ts
  export type DiffPanelMode = 'open' | 'collapsed';
  // AppConfig gains: diffPanel: DiffPanelMode;  defaultConfig.diffPanel = 'open'
  ```
- `coerce` accepts only the two values; anything else (including a config file from before M4) → `'open'`.

- [ ] **Step 1: Write the failing tests.** A stored config without `diffPanel` loads as `open`; `collapsed` round-trips through `save`/`load`; `"diffPanel": 42` → `open`.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/infrastructure/environment tests/unit/core/services/settings-service.spec.ts`.
- [ ] **Step 3: Implement.** Also update the `config` fixtures in `tests/ui` that build an `AppConfig` (`app-shell.spec.tsx`, `fly-store.spec.tsx`) so `pnpm typecheck` passes.
- [ ] **Step 4: Run to verify pass**, then the gate and Stryker on `src/infrastructure/environment/json-config-store-service.ts`.
- [ ] **Step 5: Commit** — `feat(settings): remember whether the diff panel is collapsed`.

---

### Task 5: IPC, preload and wiring

**Files:**
- Create: `src/application/ipc/handlers/diff-handler.ts`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-types.ts`, `src/application/ipc/handlers/queue-handler.ts`, `src/application/ipc/handlers/shell-handler.ts`, `src/application/ipc/ipc-module.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`
- Test: `tests/unit/application/ipc/handlers/diff-handler.spec.ts`, `tests/unit/application/ipc/handlers/queue-handler.spec.ts`, `tests/unit/application/ipc/handlers/shell-handler.spec.ts`, `tests/unit/core/domain/fly-api.spec.ts`

**Interfaces:**
- Consumes: `DiffService.read` (Task 2), `QueueService.mergePullRequest` (Task 3).
- Produces:
  ```ts
  // core/domain/fly-api.ts (added)
  diffGet: 'diff:get', prMerge: 'pr:merge', shellOpenExternal: 'shell:open-external'
  diff: {get(worktreeId: string, scope: DiffScope): Promise<WorktreeDiff>};
  pullRequests: {merge(worktreeId: string): Promise<void>};
  shell: {openInEditor(path: string): Promise<void>; openExternal(url: string): Promise<void>};

  // application/ipc/ipc-types.ts (added)
  export type LinkOpener = {open(url: string): Promise<void>};
  export const LINK_OPENER = Symbol('LINK_OPENER');

  // application/ipc/handlers/diff-handler.ts
  @Injectable() export class DiffHandler {
    constructor(@Inject(IPC_HOST) host: IpcHost, diffs: DiffService) {}
    register(): void; // handles diffGet → diffs.read(worktreeId, scope)
  }
  ```
- `QueueHandler.register` also handles `prMerge` → `queue.mergePullRequest(worktreeId)` followed by one `tick()` so the renderer gets the refreshed snapshot without waiting 3 s.
- `ShellHandler` takes `@Inject(LINK_OPENER) links: LinkOpener`; `shellOpenExternal` rejects with `URL não permitida` unless `new URL(url).protocol === 'https:'` (an unparsable URL rejects the same way), else `links.open(url)`.
- `ipc-module.ts` provides `DiffService`, `DiffHandler` and `{provide: LINK_OPENER, useValue: {open: url => shell.openExternal(url)}}` (`shell` from `electron`). `main.ts` registers `DiffHandler` after `QueueHandler`. The DI spec's `electron` mock gains `shell: {openExternal: vi.fn()}` and registers `DiffHandler`. `tests/ui/setup.ts` stubs `diff: {get: vi.fn()}`, `pullRequests: {merge: vi.fn()}` and `shell.openExternal: vi.fn()`.

- [ ] **Step 1: Write the failing tests.**
  - `DiffHandler`: registers exactly `diffGet`; invoking passes both arguments through and returns the service's result; a rejection propagates.
  - `QueueHandler`: `prMerge` calls `mergePullRequest` with the id, then broadcasts once; a rejection propagates and nothing is broadcast.
  - `ShellHandler`: `https://github.com/x` opens; `http://…`, `file:///…` and `not a url` reject with `URL não permitida` and never open.
  - `fly-api.spec.ts`: the three new channel values, if it enumerates channels.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/application tests/unit/core/domain`.
- [ ] **Step 3: Implement** the handler, the channels, the preload bridge (same `invoke` pattern as `queue`), the module providers, the `main.ts` registration, the DI test and the UI setup stub.
- [ ] **Step 4: Run** the full gate. `dep:cruise` must now report 0 violations. Run `pnpm test:di`. Run Stryker on `src/application/ipc/handlers/diff-handler.ts,src/application/ipc/handlers/queue-handler.ts,src/application/ipc/handlers/shell-handler.ts`.
- [ ] **Step 5: Commit** — `feat(ipc): expose diffs, merge and external links to the renderer`.

---

### Task 6: Renderer — store, diff view, PR view

**Files:**
- Create: `src/application/ui/panels/diff-view.tsx`, `src/application/ui/panels/pr-view.tsx`
- Modify: `src/application/ui/state/fly-store.ts`
- Test: `tests/ui/state/fly-store.spec.tsx`, `tests/ui/panels/diff-view.spec.tsx`, `tests/ui/panels/pr-view.spec.tsx`

Until Task 7 mounts them, `diff-view.tsx` and `pr-view.tsx` are orphans: the gate tolerates only `no-orphans` on these two files for this task.

**Interfaces:**
- Consumes: `WorktreeDiff`, `DiffScope`, `DiffFile` (type-only, Task 1); `PullRequest`, `CheckRun`, `WorktreeQueue` (type-only); `window.fly.diff`, `window.fly.pullRequests` (Task 5); `AppConfig.diffPanel` (Task 4).
- Produces:
  - **Store** (`fly-store.ts`):
    ```ts
    export const DIFF_POLL_MS = 3000;
    // state
    diff: WorktreeDiff | null; merging: boolean;
    loadDiff(worktreeId: string, scope: DiffScope): Promise<void>; // get → applyDiff; a rejection sets error
    applyDiff(result: WorktreeDiff): void;  // ignored when result.worktreeId !== selectedWorktreeId; skipped when JSON-equal to the current diff
    clearDiff(): void;                      // select() calls it when the id changes
    mergePullRequest(worktreeId: string): Promise<void>; // merging guard like startSession; error on rejection; loadQueue after success
    setDiffPanel(mode: DiffPanelMode): Promise<void>;     // settings.set({diffPanel}) → config
    export const queueOf: (snapshot: QueueSnapshot, worktreeId: string) => WorktreeQueue | null;
    ```
  - **`DiffView`** props: `{diff: WorktreeDiff | null; onOpenInEditor(path): void; worktreePath: string}`. Renders: `error` as `role="alert"`; `diff === null` without error → `Este é o worktree principal`; empty `files` → `Sem alterações`; `Diff.truncated` → a `Diff truncado` note. Per file: a header row with the status, `path`, `renomeado de <oldPath>` when set, `+N −M`; then `Arquivo binário`, or `Arquivo grande (N linhas)` with an "Abrir no VSCode" button (`join` of worktree path and file path done with `/`), or the hunks: one `<pre>` per hunk, header line in `--muted`, each line with its numbers in a `--faint` gutter, `add` lines on `--diffAddBg`, `del` lines on `--diffDelBg` with `--diffDelFg`. Font `--fontMono`, size 12. The panel scrolls (`overflowY: auto`).
  - **`PrView`** props: `{queue: WorktreeQueue | null; status: QueueStatus; merging: boolean; onMerge(): void; onOpenExternal(url): void}`. No PR → `Sem PR aberto`. With a PR: `#<number> <title>` as a button that opens `pr.url`; a state pill (`open`/`merged`/`closed` + `draft`) using the `--badge*` backgrounds; `Checks` list, one row per `checkRuns` entry with its state word and a link button when `url` is set; `Review` with the pt-BR value; `Fazer merge` only when `pr.state === 'open'`, disabled unless `status === 'ready'` and not `merging`, two-step `Confirmar`/`Cancelar`; `merged` state shows `Merge feito` instead of the button. Below, the receipt: `Receipt do engineer` with the summary, `Arquivos` as a list, `Verificação` as rows `<gate>: <pass|fail|skipped>`; an `invalid` receipt shows `Receipt inválido` and its problems.

- [ ] **Step 1: Write the failing tests.**
  - Store: `loadDiff` stores the result; a result for another id is ignored; an identical result does not create a new object (`toBe`); `select` of a new id clears `diff`; `mergePullRequest` sets `merging` around the call, ignores a second call while merging, reloads the queue on success and sets `error` on rejection; `setDiffPanel` stores the returned config; `queueOf` finds by id and returns null otherwise.
  - `DiffView`: one assertion per copy string and per row shape (binary, truncated with the editor button called with `<worktreePath>/<path>`, rename, error alert, truncated note); add and del lines carry their background variables.
  - `PrView`: no PR; open PR with two checks (`ok`, `falhou`) and a link; `Fazer merge` disabled for `ci`, enabled for `ready`, disabled while `merging`; `Confirmar` calls `onMerge` once; `Cancelar` keeps it; merged PR shows `Merge feito`; receipt rendering (valid and invalid).
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project ui`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(ui): render diffs and pull requests`.

---

### Task 7: Renderer — panel, polling, collapse

**Files:**
- Create: `src/application/ui/panels/diff-pr-panel.tsx`
- Delete: `src/application/ui/panels/placeholder-panel.tsx`
- Modify: `src/application/ui/panels/top-bar.tsx`, `src/application/ui/app-shell.tsx`
- Test: `tests/ui/panels/diff-pr-panel.spec.tsx`, `tests/ui/panels/top-bar.spec.tsx`, `tests/ui/app-shell.spec.tsx`

**Interfaces:**
- Consumes: `DiffView`, `PrView`, `DIFF_POLL_MS`, `queueOf` and the store actions (Task 6); `window.fly.shell.openExternal` (Task 5); `AppConfig.diffPanel` (Task 4).
- Produces:
  - **`DiffPrPanel`** props: `{worktree: Worktree | null; diff: WorktreeDiff | null; queue: WorktreeQueue | null; merging: boolean; onLoadDiff(worktreeId: string, scope: DiffScope): void; onMerge(worktreeId: string): void; onOpenInEditor(path: string): void; onOpenExternal(url: string): void}`. Local state: `tab: 'diff' | 'pr'` (default `diff`), `scope: DiffScope` (default `live`). Tabs and sub-tabs are `role="tab"` buttons with `aria-selected`. Effect: while `worktree` is set and `tab === 'diff'`, call `onLoadDiff(worktree.id, scope)` at once and every `DIFF_POLL_MS`; clear the interval on tab, scope or worktree change and on unmount. `PrView` receives `status = queue?.status ?? 'idle'`. No worktree → `Selecione um worktree`.
  - **`TopBar`** gains `diffPanel: DiffPanelMode` and `onToggleDiffPanel(): void`; a button labelled `Esconder painel` when open and `Mostrar painel` when collapsed, placed before the theme toggle.
  - **`AppShell`**: columns `'320px 1fr 380px'` when `config.diffPanel === 'open'`, `'320px 1fr'` when collapsed, and `DiffPrPanel` is rendered only when open. `PlaceholderPanel` and its import are gone. `onOpenExternal` calls `window.fly.shell.openExternal` and routes a rejection to the store `error` like `openInEditor` does.

- [ ] **Step 1: Write the failing tests.**
  - `DiffPrPanel` (fake timers): mounts with the Diff tab, calls `onLoadDiff(id, 'live')` at once and again after 3 s; switching to `Branch` calls it with `branch`; switching to `PR` stops the interval; unmount clears it; no worktree renders the empty copy.
  - `TopBar`: both labels and the callback.
  - `AppShell`: grid string per mode (update the existing assertion at the `'320px 1fr 380px'` line); the `Diff / PR` placeholder assertion is replaced by the `Diff` tab being visible when open and absent when collapsed; the toggle calls `settings.set({diffPanel: 'collapsed'})`; a rejected `openExternal` shows its message in the alert.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project ui`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the full gate (`no-orphans` must be clean after the placeholder deletion). Run `pnpm dev` for ~20 s with a clean log, stopping only your own process (by PID or group, never `pkill -f Electron`).
- [ ] **Step 5: Commit** — `feat(ui): add the collapsible diff and pull request panel`.

---

### Task 8: Docs, gate and PR

**Files:**
- Modify: `README.md` (status table: M4 → Done, M5 → Next; a short "Diff / PR" paragraph next to the queue one), `CLAUDE.md` ("Testing and tmux" gains: `git` is mocked through `CommandRunner` in unit tests and runs against an `mkdtemp` repo in integration tests; never the user's repos)

- [ ] **Step 1:** Edit `README.md` and `CLAUDE.md`.
- [ ] **Step 2:** Run the full gate, `pnpm test:mutation` (100%), then `pnpm dev` for ~20 s with a clean log.
- [ ] **Step 3: Commit** — `docs: describe the diff panel and the git test rules`.
- [ ] **Step 4: Push and open the PR** from the repo template: `git push -u origin feat-m4-diff-pr`, then `gh pr create`. Body:
  - evidence (gate output, coverage, mutation score);
  - every planning ruling (P1–P10) and any execution ruling;
  - the manual checks below as unchecked boxes;
  - a risk table: big diffs (caps), `--no-index` per untracked file, merge from fly while pr-watch watches, old config files without `diffPanel`.

  Never merge.
- [ ] **Step 5: Watch CI** with `/supera:pr-watch <N>` until green; fix failures on the branch.

**Manual checks (for the user; agents can't see the window):**
1. Select a worktree where the engineer is running → `Alterações locais` shows its uncommitted files within ~3 s and updates as it edits; an untracked new file appears as `added`.
2. After the engineer commits → `Alterações locais` shows `Sem alterações` and `Branch` shows the commit's files against `main`.
3. Select a main worktree → `Branch` shows `Este é o worktree principal`.
4. A worktree with `pnpm-lock.yaml` changed → the file row shows `Arquivo grande (N linhas)` and "Abrir no VSCode" opens it.
5. `PR` tab on a worktree under pr-watch: title, number link opens GitHub, one row per check, review value; `Fazer merge` enabled only when the badge is `merge`; `Confirmar` merges and the badge turns `merged` within one poll.
6. A worktree whose engineer finished shows `Receipt do engineer` on the `PR` tab before the PR exists.
7. `Esconder painel` collapses the column, the terminal widens, polling stops (no `git` in Activity Monitor); the choice survives a restart; `Mostrar painel` brings it back.
8. `GH_CONFIG_DIR=$(mktemp -d) pnpm dev` → the diff tabs still work; the PR tab shows `Sem PR aberto`.
