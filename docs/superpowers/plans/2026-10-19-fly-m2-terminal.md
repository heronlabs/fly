# fly M2 — Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every worktree a real terminal hosting Claude Code inside tmux: start, attach, detach, and kill sessions, reconcile them with `tmux ls` on launch, and make "Nova tarefa" start a session that runs `/supera:ship <description>` and binds itself to the worktree that ship creates.

**Architecture:** The main process talks to tmux through a `SessionLauncher` port (`TmuxSessionService`, which stores fly metadata as tmux user options so it survives restarts and is visible from Termius). It streams a `tmux attach` client through a `TerminalSpawner` port (`NodePtyTerminalService`). Core services `SessionService`, `TaskService` and `TerminalService` own the mapping, binding, and pty bookkeeping. `SessionHandler` and `TerminalHandler` expose them over IPC (polling tmux every 3 s, batching pty output). The renderer adds an xterm.js `TerminalView`, a `SessionPanel` and a `NewTaskDialog`. M2 also lands the four pre-M2 fixes from the M1 final review: the root's real path, the login-shell PATH, a NestJS DI smoke test, and watcher filtering.

**Tech Stack:** M1 stack, plus `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, and tmux ≥ 3.2 (external, not bundled).

**Spec:** `docs/superpowers/specs/2026-10-19-fly-design.md` (milestone 2 of 6: D5, D7, D8a, §5.3, §5.5, §7). Queue state is M3, diff/PR is M4, the editor is M5, and first run/doctor/packaging are M6.

## Global Constraints

- Every M1 Global Constraint still holds: the layout and dependency rules, 100% coverage on `src/core`, `src/infrastructure` and `src/application/ipc`, kebab-case files with the `-service`/`-handler`/`-module` suffixes, pt-BR copy, and no hardcoded paths.
- tmux, per spec D5. Session options are `mouse on`, `status off`, `history-limit 10000`. The command typed into the pane with `send-keys` is `claude --dangerously-skip-permissions --session-id <uuid>[ '<prompt>']; exit`. Attaching uses node-pty running `tmux -u attach-session -t =<name>`. Every tmux target uses `=<name>`, exact match.
- Session name is `<prefix>-<6 hex>` (spec §5.5). The prefix is the worktree path relative to the workspace root: lowercased, hidden components dropped, each run of `.`, `:` or whitespace replaced by `-`, components joined with `-`. An empty prefix becomes `fly`.
- Production sessions live on the default tmux server (no `-L`), so bare `tmux ls` / `tmux attach -t <name>` from Termius sees them. Tests always use a private `-L fly-test-<hex>` socket and kill that server afterwards.
- Closing or switching a terminal **detaches**: it kills the pty running the tmux client and never the session. Killing a session only happens through the explicit "Encerrar sessão" + "Confirmar" action.
- "Nova tarefa" (spec D7) starts a session in the repo root running `claude --dangerously-skip-permissions --session-id <uuid> '/supera:ship <description>'`. fly never creates worktrees itself; it binds the session to the worktree ship creates.
- fly metadata lives in tmux session user options: `@fly_session_id`, `@fly_worktree`, `@fly_task`, `@fly_task_repo`, `@fly_task_baseline`. Values are stored with `encodeURIComponent` and decoded on read.
- The terminal font is JetBrains Mono (bundled in M1).
- pt-BR copy: "Iniciar sessão", "Encerrar sessão", "Confirmar", "Cancelar", "Sessão encerrada", "Selecione um worktree", "Outras sessões", "Nova tarefa", "Repositório", "Descrição", "Iniciar", "tmux não encontrado — instale com: brew install tmux", "Descreva a tarefa", "Nenhuma pasta aberta", "Worktree não encontrado", "Repositório não encontrado".
- Git flow: branch `feat-m2-terminal` from `main` once PR #1 (M1) is merged. The plan ends with a PR; never push to `main`; `version.txt` untouched. Commits end with the `Co-Authored-By` trailer the session gives.
- Test commands: targeted runs use `pnpm vitest run --project <node|ui> <paths>` (no coverage). The full gate is `pnpm typecheck && pnpm lint:check && pnpm dep:cruise && pnpm test:unit && pnpm test:di && pnpm build`. `test:di` exists from Task 3 on. `dep:cruise` may report new modules as unreachable until the IPC tasks (9–10) wire them; Tasks 4–8 run the gate without it.

## Review Focus

1. **tmux missing, or no tmux server running.**
   - Missing: the session panel shows "tmux não encontrado — instale com: brew install tmux" and the rest of the app works.
   - No server running: it is just "no sessions", never an error.
   - Tests: Task 5 (adapter), Task 6 (snapshot) and Task 13 (panel).
2. **A "Nova tarefa" description containing `'`, `"`, `$( )`, backticks, `;`, newlines or unicode** reaches claude as one literal argument, and nothing in it executes in the shell. Tests: Task 4 (round-trip through a real `sh`) and Task 7.
3. **A session killed outside fly** (Termius `tmux kill-session`, or claude exiting) while fly is attached: the terminal keeps its last output, shows "Sessão encerrada", and the session drops out of the next snapshot. No crash. Tests: Task 8 (exit propagation), Task 10 (exit event after flushing data) and Task 12 (overlay).
4. **Renderer reload or window close while attached:** every pty is detached, the tmux sessions survive, and a reload doesn't produce duplicate output streams. Tests: Task 8 (`detachAll`) and Task 10 (pending buffers cleared). The `main.ts` wiring is checked by hand in Task 14.
5. **Two "Nova tarefa" for the same repo before either worktree appears:** each session binds to a different new worktree (the oldest task gets the first one), and no worktree is ever bound to two sessions. Test: Task 7.

---

### Task 1: Workspace root real path

**Files:**
- Modify: `src/core/interfaces/file-store.ts`, `src/infrastructure/filesystem/node-file-store-service.ts`, `src/core/services/workspace-service.ts`
- Test: `tests/unit/infrastructure/filesystem/node-file-store-service.spec.ts`, `tests/unit/core/services/workspace-service.spec.ts`

**Interfaces:**
- Produces: `FileStore.realPath(path: string): Promise<string>`. `NodeFileStoreService` implements it with `fs/promises.realpath`. `WorkspaceService.discover(root)` computes every id relative to `await fileStore.realPath(resolve(root))` and keeps `Workspace.root` as the caller passed it.

- [ ] **Step 0: Create the branch** — `git checkout main && git pull && git checkout -b feat-m2-terminal` (PR #1 must be merged first).
- [ ] **Step 1: Write the failing tests**
  - node-file-store: `Should resolve a symlinked directory to its real path` (create `mkdtemp/real`, symlink `mkdtemp/link → real`, expect `realPath(link)` to equal `realpathSync(real)`).
  - workspace-service: `Should compute ids against the real path of a symlinked root`. Mock `realPath('/link/root')` to resolve `'/real/root'`, the tree is under `/real/root`, and `listWorktrees` returns real paths. Expect `worktrees.map(w => w.id)` to equal `['talon', 'talon/.worktrees/feat']`, expect `ws.root` to be `'/link/root'`, and expect no id to start with `..`. Every existing test's FileStore mock gains `realPath: vi.fn(async p => p)`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project node tests/unit/infrastructure/filesystem tests/unit/core/services/workspace-service.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the port method, the adapter, and the `discover` change. Use `base` (the real path) for `readDir` and ids.
- [ ] **Step 4: Run to verify pass**, then the gate without `test:di` (it doesn't exist yet).
- [ ] **Step 5: Commit** — `fix(core): resolve the workspace root to its real path`.

---

### Task 2: Watcher noise filter and repo-set refresh

**Files:**
- Modify: `src/infrastructure/filesystem/git-dir-watcher-service.ts`, `src/application/ipc/handlers/workspace-handler.ts`
- Test: `tests/unit/infrastructure/filesystem/git-dir-watcher-service.spec.ts`, `tests/unit/application/ipc/handlers/workspace-handler.spec.ts`

**Interfaces:**
- Produces:
  - The `<repo>/.git` watcher schedules `onChange` only when the event's `filename` is `'HEAD'`, `'worktrees'` or `null`. The `.git/worktrees` watcher and the 15 s tick are unchanged.
  - `WorkspaceHandler.onChange` replaces the watcher when the sorted list of repo paths in the fresh discovery differs from the one being watched.

- [ ] **Step 1: Write the failing tests**
  - watcher (fake `fs.watch`):
    - `Should ignore .git events for files other than HEAD and worktrees` (emit `index`, `FETCH_HEAD`, `ORIG_HEAD`, advance 300 ms, expect `onChange` not called);
    - `Should react to HEAD, worktrees and unnamed .git events` (one test per name: called once after 300 ms).
  - workspace-handler:
    - `Should rewatch when a rediscovery finds a different repo set`: first discovery `[a]`, callback discovery `[a, b]`; expect the first dispose called and `watch` called with `['/r/a', '/r/b']`.
    - `Should keep the watcher when the repo set is unchanged`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project node tests/unit/infrastructure/filesystem tests/unit/application`.
- [ ] **Step 3: Implement.** Keep the watched paths in the handler next to `disposeWatcher`.
- [ ] **Step 4: Run to verify pass**, then the gate.
- [ ] **Step 5: Commit** — `perf(watch): ignore git index noise and rewatch new repos`.

---

### Task 3: Login-shell environment and DI smoke test

**Files:**
- Create: `src/infrastructure/environment/login-shell-env-service.ts`, `tests/di/ipc-module.spec.ts`
- Modify: `src/main.ts`, `vitest.config.ts`, `package.json` (scripts), `.github/workflows/continuous-integration.yml` (unit job runs `pnpm test:di`), `CLAUDE.md` (commands table)
- Test: `tests/unit/infrastructure/environment/login-shell-env-service.spec.ts`

**Interfaces:**
- Consumes: `CommandRunner` (M1).
- Produces:
  ```ts
  export type LoginEnv = {PATH?: string; LANG?: string};
  @Injectable() export class LoginShellEnvService {
    constructor(runner: CommandRunner) {}
    resolve(shell: string): Promise<LoginEnv>; // never rejects; {} on any failure
  }
  export const mergePath: (current: string | undefined, login: string | undefined) => string;
  ```
  - `resolve` runs `run(shell, ['-ilc', 'printf "__FLY_ENV__%s\\n%s__FLY_ENV__" "$PATH" "$LANG"'], {timeoutMs: 5000})` and parses the text between the two markers. Output before the first marker (shell banners) is ignored. Empty values are omitted.
  - `mergePath` puts the login entries first, then the current entries not already present, joined with `:`, with no empty entries.
  - `main.ts`, before `NestFactory.createApplicationContext`:
    - calls `resolve(process.env['SHELL'] ?? '/bin/zsh')`;
    - sets `process.env['PATH'] = mergePath(process.env['PATH'], env.PATH)`;
    - sets `process.env['LANG'] ??= env.LANG ?? 'en_US.UTF-8'`.
  - Scripts change: `test:unit` becomes `vitest run --coverage --project node --project ui`, and a new `test:di` is `vitest run --project di`.
  - vitest gets a new project `di`: `environment: node`, includes `tests/di/**/*.spec.ts`, `setupFiles: ['reflect-metadata']`, and overrides `oxc: {decorator: {legacy: true, emitDecoratorMetadata: true}}`. It stays out of the coverage run.

- [ ] **Step 1: Write the failing tests**
  ```ts
  it('Should read PATH and LANG between the markers, ignoring shell banners', async () => {
    runner.run.mockResolvedValue({code: 0, stdout: 'Welcome!\n__FLY_ENV__/opt/homebrew/bin:/usr/bin\nen_US.UTF-8__FLY_ENV__', stderr: ''});
    await expect(service.resolve('/bin/zsh')).resolves.toEqual({PATH: '/opt/homebrew/bin:/usr/bin', LANG: 'en_US.UTF-8'});
    expect(runner.run).toHaveBeenCalledWith('/bin/zsh', ['-ilc', expect.stringContaining('__FLY_ENV__')], {timeoutMs: 5000});
  });
  it('Should return {} when the shell fails, times out or prints no markers', …); // three cases: rejects, code 1, no markers
  it('Should omit empty values', …);  // '__FLY_ENV__/usr/bin\n__FLY_ENV__' → {PATH: '/usr/bin'}
  it('Should merge login PATH entries first without duplicates', () => {
    expect(mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin')).toBe('/opt/homebrew/bin:/usr/bin:/bin');
    expect(mergePath(undefined, undefined)).toBe('');
  });
  ```
  `tests/di/ipc-module.spec.ts`:
  - mock `electron`: `app.getPath` returns a tmp dir, `BrowserWindow.getAllWindows` returns `[]`, `dialog` is `{}`, `ipcMain` is `{handle: vi.fn(), on: vi.fn()}`;
  - `Should resolve and register every IPC handler`: create the application context for `IpcModule` with `{logger: false}`, call `get(WorkspaceHandler|SettingsHandler|ShellHandler).register()` without throwing, then `close()`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project node tests/unit/infrastructure/environment`.
- [ ] **Step 3: Implement** the service, the `main.ts` wiring, the vitest project, scripts, CI and CLAUDE.md.
- [ ] **Step 4: Prove the smoke test guards DI.** Temporarily remove `ConfigStore` from `IpcModule` providers; `pnpm test:di` must FAIL. Restore it; it must PASS. Record both in the report.
- [ ] **Step 5: Gate**, plus `pnpm dev` for ~20 s with a clean log; stop only your own process.
- [ ] **Step 6: Commit** — `feat(env): load login-shell PATH and add a DI smoke test`.

---

### Task 4: Session naming, shell quoting and the claude command

**Files:**
- Create: `src/core/services/session-naming.ts`
- Test: `tests/unit/core/services/session-naming.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const sessionPrefix: (relativePath: string) => string;
  export const sessionName: (prefix: string, hex: string) => string;        // `${prefix || 'fly'}-${hex}`
  export const shellQuote: (value: string) => string;                        // POSIX single-quoted
  export const claudeCommand: (input: {sessionId: string; prompt?: string}) => string;
  ```
  - `claudeCommand` returns `claude --dangerously-skip-permissions --session-id <id>`.
  - With a prompt, it appends one space and `shellQuote(prompt.replace(/\s+/g, ' ').trim())`.
  - It always ends with `; exit`.

- [ ] **Step 1: Write the failing tests** (port of `ai/code-sessions/tests/test-session-name.bats` + fly rules)
  ```ts
  it.each([
    ['workloads', 'workloads'],
    ['workloads/sub/leaf', 'workloads-sub-leaf'],
    ['workloads/.worktrees/foo-bar-baz', 'workloads-foo-bar-baz'],
    ['foo.bar/baz.qux', 'foo-bar-baz-qux'],
    ['Workloads/MyProject', 'workloads-myproject'],
    ['project', 'project'],
    ['.hidden/.also-hidden', ''],
    ['Ação Bob/x:y', 'ação-bob-x-y'],
    ['../outside/wt', 'outside-wt'],
  ])('Should derive prefix of %s as %s', (path, prefix) => expect(sessionPrefix(path)).toBe(prefix));
  it('Should fall back to fly for an empty prefix', () => expect(sessionName('', 'abc123')).toBe('fly-abc123'));
  it.each([`it's`, `$(touch /tmp/pwned)`, '`id`', 'a; rm -rf ~', 'ação "x" \\ y', '\n'])(
    'Should round-trip %j through a real sh unchanged', async value => {
      const {stdout} = await execFileP('sh', ['-c', `printf %s ${shellQuote(value)}`]);
      expect(stdout).toBe(value);
    });
  it('Should build the plain claude command', () =>
    expect(claudeCommand({sessionId: 'u1'})).toBe('claude --dangerously-skip-permissions --session-id u1; exit'));
  it('Should collapse prompt whitespace and quote it', () =>
    expect(claudeCommand({sessionId: 'u1', prompt: "/supera:ship fix it's\n  bug"}))
      .toBe("claude --dangerously-skip-permissions --session-id u1 '/supera:ship fix it'\\''s bug'; exit"));
  ```
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement.** **Step 4: Verify pass + gate.**
- [ ] **Step 5: Commit** — `feat(core): derive tmux session names and the claude command`.

---

### Task 5: tmux adapter

**Files:**
- Create: `src/core/interfaces/session-launcher.ts`, `src/infrastructure/tmux/tmux-session-service.ts`, `src/infrastructure/tmux/tokens.ts`
- Modify: `.github/workflows/continuous-integration.yml` (the unit job installs tmux: `sudo apt-get update && sudo apt-get install -y tmux`)
- Test: `tests/unit/infrastructure/tmux/tmux-session-service.spec.ts`, `tests/integration/tmux/tmux-session-service.spec.ts`

**Interfaces:**
- Consumes: `CommandRunner`.
- Produces:
  ```ts
  // core/interfaces/session-launcher.ts
  export const flyOptions = ['@fly_session_id', '@fly_worktree', '@fly_task', '@fly_task_repo', '@fly_task_baseline'] as const;
  export type FlyOption = (typeof flyOptions)[number];
  export type MultiplexerSession = {name: string; cwd: string; createdAt: number; attachedClients: number; options: Partial<Record<FlyOption, string>>};
  export abstract class SessionLauncher {
    abstract list(): Promise<MultiplexerSession[]>;
    abstract start(input: {name: string; cwd: string; command: string; options: Partial<Record<FlyOption, string>>}): Promise<void>;
    abstract setOption(name: string, option: FlyOption, value: string): Promise<void>;
    abstract kill(name: string): Promise<void>;
    abstract attachCommand(name: string): {file: string; args: string[]};
  }
  // infrastructure/tmux/tokens.ts
  export const TMUX_SOCKET = Symbol('TMUX_SOCKET'); // string | null; null = default server
  ```
- `TmuxSessionService extends SessionLauncher` (constructor `@Inject(TMUX_SOCKET) socket: string | null, runner: CommandRunner`). Every tmux call is prefixed with `-L <socket>` when the socket is set.
  - **`list`**
    - Runs `list-sessions -F` with the tab-separated fields `#{session_name}`, `#{pane_current_path}`, `#{session_created}`, `#{session_attached}`, then the five options in `flyOptions` order.
    - Option values go through `decodeURIComponent`; empty values are omitted.
    - On a non-zero exit whose stderr matches `/no server running|error connecting to/`, it returns `[]`.
    - Any other non-zero exit throws `Error(stderr.trim() || 'tmux list-sessions failed')`.
    - ENOENT (tmux missing) propagates the runner's rejection unchanged.
  - **`start`** (history-limit only applies to windows created after it is set):
    1. `new-session -d -s <name> -c <cwd> -P -F '#{window_id}'` → first window id;
    2. `set-option -t =<name>` for `mouse on`, `status off` and `history-limit 10000`, plus each given fly option (`encodeURIComponent` value);
    3. `new-window -d -t =<name> -c <cwd> -P -F '#{window_id}'` → second window id;
    4. `kill-window -t <first id>`;
    5. `send-keys -t <second id> -l <command>`, then `send-keys -t <second id> Enter`. `-l` sends the command literally, so tmux never reads a word in a task description as a key name.

    Any non-zero step throws `Error(stderr.trim() || 'tmux <subcommand> failed')`.
  - **`setOption`**: `set-option -t =<name> <option> <encoded value>`.
  - **`kill`**: `kill-session -t =<name>`.
  - **`attachCommand`**: `{file: 'tmux', args: [...socketArgs, '-u', 'attach-session', '-t', '=<name>']}`.

- [ ] **Step 1: Write the failing tests**
  - **unit** (runner mocked):
    - the exact argv of each call, including `-L` only when the socket is set;
    - the `list` parse of two tab-separated lines with an encoded `@fly_task` (`fix%20it's` → `fix it's`);
    - `[]` for both no-server messages;
    - a throw with stderr;
    - ENOENT propagates;
    - the `start` sequence order;
    - a `start` failure at step 3 throws with that stderr.
  - **integration** (real tmux, `-L fly-test-<hex>`, `afterEach` kill-server, temp cwd with a space in its name):
    - `start({name: 'it-abc123', cwd, command: 'cat', options: {'@fly_task': "x'y z"}})`, then `list()` returns one session with that cwd's realpath and `options['@fly_task']` of `"x'y z"`;
    - `tmux -L … display -p -t =it-abc123 '#{history_limit} #{session_windows}'` prints `10000 1`;
    - `kill` → `list()` returns `[]`;
    - `list()` on a fresh socket with no server returns `[]`.
- [ ] **Step 2: Run to verify failure** — `pnpm vitest run --project node tests/unit/infrastructure/tmux tests/integration/tmux`.
- [ ] **Step 3: Implement.** **Step 4: Verify pass + gate.**
- [ ] **Step 5: Commit** — `feat(tmux): start, list, tag and kill tmux sessions`.

---

### Task 6: Session service

**Files:**
- Create: `src/core/domain/session.ts`, `src/core/interfaces/id-generator.ts`, `src/infrastructure/environment/crypto-id-generator-service.ts`, `src/core/services/session-service.ts`
- Test: `tests/unit/core/services/session-service.spec.ts`, `tests/unit/infrastructure/environment/crypto-id-generator-service.spec.ts`

**Interfaces:**
- Consumes: `SessionLauncher`, `MultiplexerSession` (Task 5), `sessionPrefix`, `sessionName`, `claudeCommand` (Task 4), `Workspace` (M1).
- Produces:
  ```ts
  // core/domain/session.ts
  export type Session = {name: string; worktreeId: string; createdAt: number; attachedClients: number; origin: 'fly' | 'external'; task: string | null};
  export type SessionsSnapshot = {tmux: 'ok' | 'missing' | 'error'; message: string | null; sessions: Session[]};
  // core/interfaces/id-generator.ts
  export abstract class IdGenerator { abstract hex(bytes: number): string; abstract uuid(): string; }
  // core/services/session-service.ts
  @Injectable() export class SessionService {
    constructor(launcher: SessionLauncher, ids: IdGenerator) {}
    setWorkspace(workspace: Workspace | null): void;
    currentWorkspace(): Workspace | null;
    snapshot(): Promise<SessionsSnapshot>;
    start(worktreeId: string): Promise<string>;   // returns the session name
    kill(name: string): Promise<void>;
  }
  ```
  - `CryptoIdGeneratorService` uses `randomBytes(n).toString('hex')` and `randomUUID()`.
  - **Mapping** a `MultiplexerSession` to a worktree: `options['@fly_worktree']` equal to a worktree path; otherwise the deepest worktree whose path equals `cwd` or is a `path + '/'` prefix of it. Sessions mapping to no worktree of the current workspace are left out.
  - **Snapshot fields:** `origin` is `'fly'` when `@fly_session_id` is set; `task` comes from `@fly_task` or is null; sessions are sorted by `createdAt`, then `name`.
  - **tmux errors:** ENOENT gives `{tmux: 'missing', message: 'tmux não encontrado — instale com: brew install tmux', sessions: []}`. Any other rejection gives `{tmux: 'error', message: <error message>, sessions: []}`.
  - **`start`**
    - Throws `Error('Nenhuma pasta aberta')` without a workspace, and `Error('Worktree não encontrado')` for an unknown id.
    - Name is `sessionName(sessionPrefix(worktree.id), ids.hex(3))`; cwd is `worktree.path`; command is `claudeCommand({sessionId: uuid})`.
    - Sets options `{'@fly_session_id': uuid, '@fly_worktree': worktree.path}`.
  - **`kill`** delegates to the launcher.

- [ ] **Step 1: Write the failing tests**
  - mapping:
    - the explicit `@fly_worktree` wins over cwd;
    - a cwd inside `talon/.worktrees/feat/src` maps to `talon/.worktrees/feat`, not `talon`;
    - an unknown cwd is left out;
    - no workspace gives `sessions: []`.
  - snapshot fields: `origin` and `task`, plus the sort order.
  - tmux errors: the missing and error snapshots.
  - start:
    - the exact `start` input with `ids` mocked (`hex → 'abc123'`, `uuid → 'u1'`) for worktree id `talon/.worktrees/feat-x`. Expected name `talon-feat-x-abc123`, command `'claude --dangerously-skip-permissions --session-id u1; exit'`.
    - the two start errors.
  - kill delegates.
  - The crypto adapter returns 6 hex chars for `hex(3)` and a v4 uuid.
- [ ] **Step 2–4:** fail → implement → pass + gate (without `dep:cruise`).
- [ ] **Step 5: Commit** — `feat(core): map tmux sessions to worktrees and start claude sessions`.

---

### Task 7: Task service ("Nova tarefa" + binding)

**Files:**
- Create: `src/core/services/task-service.ts`
- Test: `tests/unit/core/services/task-service.spec.ts`

**Interfaces:**
- Consumes: `SessionService.currentWorkspace()` (Task 6), `SessionLauncher`, `IdGenerator`, Task 4 helpers.
- Produces:
  ```ts
  @Injectable() export class TaskService {
    constructor(sessions: SessionService, launcher: SessionLauncher, ids: IdGenerator) {}
    create(input: {repoId: string; description: string}): Promise<string>; // session name
    bind(): Promise<void>;
  }
  ```
  - **`create`**
    - Errors: `Error('Nenhuma pasta aberta')`, `Error('Repositório não encontrado')`, or `Error('Descreva a tarefa')` when the trimmed description is empty.
    - Name is `sessionName(sessionPrefix(repo.id), ids.hex(3))` and cwd is `repo.path`.
    - Command is `claudeCommand({sessionId: uuid, prompt: '/supera:ship ' + description})`.
    - Options: `@fly_session_id: uuid`, `@fly_task: description.trim()`, `@fly_task_repo: repo.path`, `@fly_task_baseline: JSON.stringify(<that repo's worktree paths>)`.
  - **`bind`**
    - A no-op without a workspace.
    - The pending sessions are those that have `@fly_task_repo` but no `@fly_worktree`. Take them in `createdAt` order, then by name.
    - Candidates are the repo's non-main worktrees whose path is neither in that session's baseline nor already some session's `@fly_worktree`.
    - Each pending session takes the first candidate by path and calls `launcher.setOption(name, '@fly_worktree', path)`; that candidate is then consumed.
    - Launcher errors from `list` are swallowed, because `snapshot` reports them.

- [ ] **Step 1: Write the failing tests**
  - create:
    - the exact `start` input for description `"fix it's\n  $(x)"`. Expected command: `"claude --dangerously-skip-permissions --session-id u1 '/supera:ship fix it'\\''s $(x)'; exit"`, and the baseline holds the repo's current worktree paths.
    - the three errors.
  - bind:
    - binds a pending session to a new worktree;
    - ignores baseline worktrees and the main worktree;
    - two pending sessions plus two new worktrees: the older session gets the first path and the newer one the second;
    - two pending plus one new: only the older one binds;
    - an already-bound worktree is never reused;
    - a no-op without a workspace;
    - swallows a `list` rejection.
- [ ] **Step 2–4:** fail → implement → pass + gate (without `dep:cruise`).
- [ ] **Step 5: Commit** — `feat(core): start ship tasks and bind them to the worktree ship creates`.

---

### Task 8: pty adapter and terminal service

**Files:**
- Create: `src/core/interfaces/terminal-spawner.ts`, `src/infrastructure/pty/node-pty-terminal-service.ts`, `src/core/services/terminal-service.ts`
- Modify: `package.json` (`pnpm add node-pty`, and add `node-pty` to `pnpm.onlyBuiltDependencies`)
- Test: `tests/integration/pty/node-pty-terminal-service.spec.ts`, `tests/unit/core/services/terminal-service.spec.ts`

**Interfaces:**
- Consumes: `SessionLauncher.attachCommand` (Task 5), `IdGenerator` (Task 6).
- Produces:
  ```ts
  // core/interfaces/terminal-spawner.ts
  export type TerminalSize = {cols: number; rows: number};
  export type TerminalProcess = {onData(listener: (data: string) => void): void; onExit(listener: (exitCode: number) => void): void; write(data: string): void; resize(size: TerminalSize): void; kill(): void};
  export abstract class TerminalSpawner { abstract spawn(file: string, args: string[], size: TerminalSize): TerminalProcess; }
  // core/services/terminal-service.ts
  export type TerminalSink = {data(terminalId: string, data: string): void; exit(terminalId: string, exitCode: number): void};
  @Injectable() export class TerminalService {
    constructor(launcher: SessionLauncher, spawner: TerminalSpawner, ids: IdGenerator) {}
    attach(sessionName: string, size: TerminalSize, sink: TerminalSink): string; // terminalId = ids.uuid()
    write(terminalId: string, data: string): void;      // unknown id: ignored
    resize(terminalId: string, size: TerminalSize): void; // clamps cols/rows to integers ≥ 2
    detach(terminalId: string): void;                    // kills the pty only
    detachAll(): void;
  }
  ```
  - `NodePtyTerminalService` spawns with `name: 'xterm-256color'` and `cwd: os.homedir()`.
  - Its env is `process.env` without undefined values, plus `TERM=xterm-256color`, `COLORTERM=truecolor`, and `LANG` (falling back to `en_US.UTF-8`).
  - It maps `onExit(({exitCode}) => …)`.
  - On exit, the terminal service removes the id and forwards `sink.exit`.

- [ ] **Step 1: Write the failing tests**
  - **integration** (real node-pty):
    - `spawn('sh', ['-c', 'printf hello'], {cols: 80, rows: 24})` collects output containing `hello` and exits with 0;
    - `spawn('sh', ['-c', 'printf "$TERM"'], …)` prints `xterm-256color`;
    - `kill()` on a `sleep 30` ends it.
  - **unit** (spawner mocked):
    - attach spawns `attachCommand(name)` with the size;
    - data and exit reach the sink with the terminal id;
    - write and resize reach the right process (a resize to `{cols: 0.5, rows: -1}` becomes `{cols: 2, rows: 2}`);
    - detach kills only that process and ignores later writes;
    - `detachAll` kills every process and empties the map;
    - an exit removes the id.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement.** Confirm `node-pty` loads under both Node (vitest) and Electron: run `pnpm build` and `pnpm dev` (~20 s), and require the module in main via the IPC wiring later. If Electron reports a `NODE_MODULE_VERSION` mismatch, add `@electron/rebuild` with a `postinstall` step and record it.
- [ ] **Step 4: Verify pass + gate** (without `dep:cruise`).
- [ ] **Step 5: Commit** — `feat(pty): attach tmux sessions through node-pty`.

---

### Task 9: Session IPC (list, start, kill, task, poll)

**Files:**
- Create: `src/application/ipc/handlers/session-handler.ts`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`, `src/application/ipc/handlers/workspace-handler.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`
- Test: `tests/unit/application/ipc/handlers/session-handler.spec.ts`, `tests/unit/application/ipc/handlers/workspace-handler.spec.ts`, `tests/unit/core/domain/fly-api.spec.ts`

**Interfaces:**
- Consumes: `SessionService` (6), `TaskService` (7).
- Produces:
  ```ts
  // channels (added)
  sessionList: 'session:list', sessionStart: 'session:start', sessionKill: 'session:kill', sessionChanged: 'session:changed', taskCreate: 'task:create',
  // FlyApi (added)
  sessions: {
    list(): Promise<SessionsSnapshot>;
    start(worktreeId: string): Promise<string>;
    kill(name: string): Promise<void>;
    onChanged(listener: (snapshot: SessionsSnapshot) => void): () => void;
  };
  tasks: {create(input: {repoId: string; description: string}): Promise<string>};
  // handler
  @Injectable() export class SessionHandler {
    register(): void; // handles the 4 invoke channels; starts the poll
    stop(): void;     // clears the poll
  }
  export const SESSION_POLL_MS = 3000;
  ```
  - **Poll tick** (setInterval, unref): `await tasks.bind()`, then `snapshot()`. Broadcast `session:changed` only when the JSON differs from the last one broadcast. Ticks never overlap (a running flag), and a failed tick is logged.
  - **`list`** does `bind` then `snapshot`.
  - **`start`, `kill` and `create`** return their result, then run one immediate tick.
  - **Wiring**
    - `WorkspaceHandler` calls `sessions.setWorkspace(ws)` after every successful discovery: open, refresh and watcher callback.
    - `ipc-module` adds `{provide: SessionLauncher, useClass: TmuxSessionService}`, `{provide: TMUX_SOCKET, useValue: null}`, `{provide: IdGenerator, useClass: CryptoIdGeneratorService}`, `SessionService`, `TaskService` and `SessionHandler`.
    - `main.ts` registers `SessionHandler`.
    - The DI smoke test also resolves and registers `SessionHandler` (and calls `stop()`).

- [ ] **Step 1: Write the failing tests**
  - handler (fake timers, services mocked):
    - registers the 4 channels;
    - `list` binds before snapshot;
    - the tick broadcasts on change and stays silent when unchanged;
    - no overlapping ticks while one is pending;
    - a tick failure is logged with no broadcast;
    - start, kill and create return the result and broadcast immediately;
    - errors propagate as rejections.
  - workspace-handler: `setWorkspace` is called on open, refresh and the watcher callback.
  - The fly-api channel naming test still passes.
- [ ] **Step 2–4:** fail → implement → pass + full gate (`dep:cruise` included from now on, and `test:di`).
- [ ] **Step 5: Commit** — `feat(ipc): expose tmux sessions and ship tasks to the renderer`.

---

### Task 10: Terminal IPC (attach, stream, resize, detach)

**Files:**
- Create: `src/application/ipc/handlers/terminal-handler.ts`
- Modify: `src/application/ipc/ipc-types.ts` (`IpcHost.on`), `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`
- Test: `tests/unit/application/ipc/handlers/terminal-handler.spec.ts`

**Interfaces:**
- Consumes: `TerminalService` (8).
- Produces:
  ```ts
  // channels (added)
  terminalAttach: 'terminal:attach', terminalDetach: 'terminal:detach', terminalInput: 'terminal:input', terminalResize: 'terminal:resize', terminalData: 'terminal:data', terminalExit: 'terminal:exit',
  // IpcHost (added)
  on(channel: Channel, listener: (event: unknown, ...args: any[]) => void): void;
  // FlyApi (added)
  terminal: {
    attach(sessionName: string, size: {cols: number; rows: number}): Promise<string>;
    detach(terminalId: string): Promise<void>;
    write(terminalId: string, data: string): void;           // ipcRenderer.send
    resize(terminalId: string, size: {cols: number; rows: number}): void;
    onData(listener: (terminalId: string, data: string) => void): () => void;
    onExit(listener: (terminalId: string, exitCode: number) => void): () => void;
  };
  // handler
  @Injectable() export class TerminalHandler { register(): void; }
  export const TERMINAL_FLUSH_MS = 8;
  ```
  - **Batching:** data is buffered per terminal id and flushed as one `terminal:data` `{terminalId, data}` broadcast `TERMINAL_FLUSH_MS` after the first chunk.
  - **Exit:** an exit flushes that id's pending data first, then broadcasts `terminal:exit` `{terminalId, exitCode}`.
  - **Detach:** `detach` drops that id's pending buffer.
  - **Payloads:** the preload passes the payload objects through and the listeners receive `(terminalId, data)` and `(terminalId, exitCode)`.
  - **`main.ts`**
    - `const terminals = context.get(TerminalService)`, and registers `TerminalHandler`.
    - `createWindow` gets an `onReset` callback that `main.ts` sets to `terminals.detachAll()`. It's wired to `window.webContents.on('did-start-loading', onReset)` and `window.on('closed', onReset)`.
  - **`ipc-module`** adds `{provide: TerminalSpawner, useClass: NodePtyTerminalService}`, `TerminalService` and `TerminalHandler`. The smoke test registers `TerminalHandler`.

- [ ] **Step 1: Write the failing tests** (fake timers)
  - three chunks within 8 ms become one broadcast with the concatenated data;
  - two terminals are batched separately;
  - an exit sends the pending data before the exit event;
  - a detach drops pending data;
  - input and resize reach `TerminalService`;
  - `attach` returns the id from `TerminalService.attach`.
- [ ] **Step 2–4:** fail → implement → pass + full gate. Then `pnpm dev` (~20 s) with a clean log; stop only your own process.
- [ ] **Step 5: Commit** — `feat(ipc): stream tmux terminals over ipc with batching`.

---

### Task 11: Renderer session state and worktree session indicator

**Files:**
- Modify: `src/application/ui/state/fly-store.ts`, `src/application/ui/panels/worktrees-panel.tsx`, `tests/ui/setup.ts` (stub the new `window.fly` methods)
- Test: `tests/ui/state/fly-store.spec.tsx`, `tests/ui/panels/worktrees-panel.spec.tsx`

**Interfaces:**
- Consumes (type-only): `Session`, `SessionsSnapshot`.
- Produces (added to `FlyState`):
  ```ts
  sessions: SessionsSnapshot;                 // initial {tmux: 'ok', message: null, sessions: []}
  activeSessionName: string | null;
  loadSessions(): Promise<void>;
  applySessions(snapshot: SessionsSnapshot): void;
  startSession(worktreeId: string): Promise<void>;
  killSession(name: string): Promise<void>;
  createTask(input: {repoId: string; description: string}): Promise<boolean>;
  setActiveSession(name: string | null): void;
  ```
  - **`openRoot`** calls `loadSessions()` after a successful open.
  - **`applySessions`** keeps `activeSessionName` only while that session still exists. It also follows a moving session: if the active session moved to a different `worktreeId`, and the selected worktree was the one it moved from, it selects the new worktree.
  - **`startSession`, `killSession` and `createTask`**
    - `startSession` sets `activeSessionName` to the returned name.
    - `createTask` also selects the repo's main worktree, sets `activeSessionName`, and returns `true`.
    - All three then call `loadSessions()`.
    - Failures set `error` through `errorMessage`; `createTask` returns `false`.
  - **`WorktreesPanel`** gets a new prop `sessionCounts: Record<string, number>`. A row with a count ≥ 1 shows a dot in `--ok` with `aria-label="Sessão ativa"`.

- [ ] **Step 1: Write the failing tests**
  - store:
    - `loadSessions` stores the snapshot;
    - `openRoot` loads sessions;
    - `applySessions` drops a vanished active session;
    - **follow test:** active `talon-abc` moves from worktree `talon` (selected) to `talon/.worktrees/feat`, and the selection follows it;
    - no follow when the user had selected another worktree;
    - `startSession` sets the active session;
    - `createTask` selects the main worktree and returns true;
    - a `createTask` rejection sets `error` and returns false.
  - panel:
    - a row with a session shows `Sessão ativa`;
    - a row without one doesn't.
- [ ] **Step 2–4:** fail → implement → pass (`pnpm vitest run --project ui`) + full gate.
- [ ] **Step 5: Commit** — `feat(ui): track tmux sessions in the store and mark worktrees with sessions`.

---

### Task 12: Terminal theme and TerminalView

**Files:**
- Create: `src/application/ui/terminal/terminal-theme.ts`, `src/application/ui/terminal/terminal-view.tsx`
- Modify: `package.json` (`pnpm add @xterm/xterm @xterm/addon-fit`)
- Test: `tests/ui/terminal/terminal-theme.spec.tsx`, `tests/ui/terminal/terminal-view.spec.tsx`

**Interfaces:**
- Consumes: `themeVars`, `ResolvedTheme` (M1), `window.fly.terminal` (Task 10).
- Produces:
  ```ts
  export const terminalTheme: (theme: ResolvedTheme) => ITheme; // ITheme type-only from @xterm/xterm
  export const TerminalView: (props: {sessionName: string; theme: ResolvedTheme; onExit?(exitCode: number): void}) => JSX.Element;
  ```
  - **`terminalTheme` colours**
    - `background`: `themeVars(theme)['--deep']`.
    - `foreground`: `--text`.
    - `cursor`: `--accent`.
    - `selectionBackground`: dark `#1a3d5e`, light `#cfe0ee`.
  - **ANSI palette, dark:** black `#0a1a2c`, red `#ff6b6b`, green `#1fd646`, yellow `#f59e0b`, blue `#39b3f8`, magenta `#c084fc`, cyan `#13c2c2`, white `#dde7ef`, brightBlack `#5e8fc0`, brightRed `#ffa198`, brightGreen `#86efac`, brightYellow `#fcd34d`, brightBlue `#7dd3fc`, brightMagenta `#d8b4fe`, brightCyan `#5eead4`, brightWhite `#ffffff`.
  - **ANSI palette, light:** black `#1f2937`, red `#dc2626`, green `#15803d`, yellow `#c2410c`, blue `#1d4ed8`, magenta `#7c3aed`, cyan `#0e7490`, white `#6b7280`, brightBlack `#374151`, brightRed `#b91c1c`, brightGreen `#166534`, brightYellow `#9a3412`, brightBlue `#1e40af`, brightMagenta `#6d28d9`, brightCyan `#155e75`, brightWhite `#9ca3af`.
  - **`TerminalView` creation:** `new Terminal({fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 13, cursorBlink: true, macOptionClickForcesSelection: true, scrollback: 1000, theme: terminalTheme(theme)})`, load `FitAddon`, `open` into its div, `fit()`, then `attach(sessionName, {cols, rows})`.
  - **Wiring**
    - It routes `onData`/`onExit` only for its own id, and forwards `term.onData` to `write(id, …)`.
    - A `ResizeObserver` triggers `fit()` and sends `resize` only when cols/rows changed.
    - A theme change sets `term.options.theme`.
    - It imports `@xterm/xterm/css/xterm.css`.
  - **Exit:** it renders `<p role="status">Sessão encerrada</p>` over the terminal and calls `onExit`.
  - **Unmount:** it detaches; if `attach` is still pending, it detaches once it resolves. It unsubscribes and calls `dispose()`.
  - **sessionName change:** detach and re-attach.

- [ ] **Step 1: Write the failing tests** (`vi.mock('@xterm/xterm')` and `vi.mock('@xterm/addon-fit')` with fake classes; stub `ResizeObserver`)
  - theme: `background` and `foreground` follow `themeVars` per theme; all 16 ANSI keys are present; `red` is dark `#ff6b6b` and light `#dc2626`.
  - view:
    - attaches with the session name and the fitted size;
    - writes only its own id's data;
    - forwards keystrokes;
    - sends no resize when the size is unchanged and one resize when it changed;
    - shows the exit overlay and keeps the earlier output written;
    - detaches on unmount;
    - detaches after a late attach resolves when it was already unmounted;
    - re-attaches when `sessionName` changes;
    - updates the theme without re-attaching.
- [ ] **Step 2–4:** fail → implement → pass + full gate.
- [ ] **Step 5: Commit** — `feat(ui): render tmux sessions with xterm.js`.

---

### Task 13: Session panel, Nova tarefa dialog and shell wiring

**Files:**
- Create: `src/application/ui/panels/session-panel.tsx`, `src/application/ui/panels/new-task-dialog.tsx`
- Modify: `src/application/ui/app-shell.tsx`, `src/application/ui/panels/top-bar.tsx`
- Test: `tests/ui/panels/session-panel.spec.tsx`, `tests/ui/panels/new-task-dialog.spec.tsx`, `tests/ui/app-shell.spec.tsx`

**Interfaces:**
- Consumes: store (11), `TerminalView` (12).
- Produces:
  ```ts
  export const SessionPanel: (props: {worktree: Worktree | null; snapshot: SessionsSnapshot; activeSessionName: string | null; theme: ResolvedTheme; onStart(worktreeId: string): void; onKill(name: string): void; onSelectSession(name: string): void}) => JSX.Element;
  export const NewTaskDialog: (props: {open: boolean; repos: Repo[]; defaultRepoId: string | null; onCancel(): void; onSubmit(input: {repoId: string; description: string}): void}) => JSX.Element | null;
  ```
  - **SessionPanel**, checked in this order:
    1. No worktree: "Selecione um worktree".
    2. `snapshot.tmux !== 'ok'`: `snapshot.message` with `role="alert"`.
    3. The worktree has no sessions: an "Iniciar sessão" button.
    4. Otherwise:
       - the shown session is the active one if it belongs to this worktree, else the first;
       - a header with the session name and, when there is more than one, an "Outras sessões" list of buttons calling `onSelectSession`;
       - "Encerrar sessão", which turns into "Confirmar" / "Cancelar" (only "Confirmar" calls `onKill`);
       - a `TerminalView` keyed by the session name.
  - **NewTaskDialog**
    - Structure: `role="dialog"`, `aria-modal="true"`, title "Nova tarefa".
    - Fields: a `<select>` "Repositório" and a `<textarea>` "Descrição" (autofocused).
    - Buttons: "Cancelar", and "Iniciar" (disabled while the trimmed description is empty).
    - Keys: Escape cancels; ⌘Enter submits.
    - Returns `null` when closed.
  - **AppShell**
    - Replaces the "Sessão" placeholder with `SessionPanel` and subscribes to `window.fly.sessions.onChanged(applySessions)`.
    - Passes `sessionCounts` to `WorktreesPanel`.
    - ⌘N opens the dialog when a workspace with repos is open. The default repo is the selected worktree's repo, else the first repo.
    - A successful submit closes the dialog; a failed one keeps it open with the store error shown.
  - **TopBar:** "Nova tarefa" is enabled (the `title="Marco 2"` is removed) and opens the dialog; it is disabled when the workspace has no repos.

- [ ] **Step 1: Write the failing tests** (TerminalView mocked in these specs)
  - panel:
    - each of the four states;
    - the kill confirmation (one click doesn't call `onKill`; Confirmar does; Cancelar restores);
    - "Outras sessões" switches;
    - the tmux-missing message.
  - dialog:
    - "Iniciar" is disabled when blank;
    - submit sends the selected repo and the description;
    - Escape cancels;
    - ⌘Enter submits;
    - returns null when closed.
  - app-shell:
    - the "Nova tarefa" button opens the dialog;
    - ⌘N opens it;
    - a submit calls `window.fly.tasks.create` and closes;
    - the session panel renders for the selected worktree;
    - the `onChanged` subscription is cleaned up on unmount.
- [ ] **Step 2–4:** fail → implement → pass + full gate. Then `pnpm dev` (~20 s) with a clean log; stop only your own process.
- [ ] **Step 5: Commit** — `feat(ui): session panel and nova tarefa dialog`.

---

### Task 14: Docs, verification and pull request

**Files:**
- Modify: `README.md` (prerequisites `git`, `tmux`, `claude` and VSCode for "Abrir no VSCode"; an "M2 status" line), `CLAUDE.md` (the tmux test socket rule and the `test:di` command)

- [ ] **Step 1: Update the docs.** Then run the full gate. Expected: all exit 0.
- [ ] **Step 2: Manual checks for the user** (agents cannot see the window or run claude). List these in the PR:
  - "Iniciar sessão" on a worktree opens Claude Code in the terminal.
  - Typing works and resizing the window reflows.
  - Switching worktrees and coming back reattaches.
  - From iTerm or Termius, `tmux ls` shows `<prefix>-<hex>` and `tmux attach -t <name>` reaches the same session.
  - "Encerrar sessão" → "Confirmar" removes it.
  - Reloading the window (⌘R) leaves the sessions alive with no duplicate output.
  - Launched from Finder (`pnpm build && pnpm preview` or the built app), `tmux` and `claude` are found.
  - **Spec §7 risk:** "Nova tarefa" on a repo with description `say hello` confirms whether `claude '/supera:ship …'` runs the slash command as typed. If it does not, record the result in the PR: the fallback (send the prompt with `tmux send-keys` once the TUI is ready) becomes the first M3 task.
- [ ] **Step 3: Push and open the PR** — `git push -u origin feat-m2-terminal`, then `gh pr create --title "feat: fly M2 terminal — tmux sessions, xterm.js, nova tarefa" --body-file <filled .github/PULL_REQUEST_TEMPLATE.md>`. Never merge; the user merges once CI is green and the manual checks pass.
