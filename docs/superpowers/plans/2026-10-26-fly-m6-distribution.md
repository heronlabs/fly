# fly M6 — Distribution and Task Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship fly as an unsigned arm64 `.dmg` with a three-step first-run wizard and a footer update notice, and move the task lifecycle (worktree before the session; PR, CI fixes, review forwarding and cleanup after it) from supera into fly.

**Architecture:**
- **Packaging (PR 1):**
  - `electron-builder.yml` builds `dist/fly-<version>-arm64.dmg`, with `bin/fly` copied to `Contents/Resources/bin/fly`.
  - One `bin/fly` script handles both layouts: a checkout (today) and the bundle (`Contents/Resources/app.asar` present).
  - Dev builds (`!app.isPackaged`) keep their data in `~/Library/Application Support/fly-dev`; the installed app keeps its data in `…/fly`.
  - A `dmg` job in CD uploads the dmg to the tag's Release.
- **Task start (PR 2):**
  - `TaskService.create` fetches the default branch, runs `git worktree add --no-track`, writes the prompt and attachments into a task folder, and starts `claude` in the worktree.
  - A `TaskStore` (`tasks.json`) keeps one record per task worktree.
  - A prompt starting with `/supera:ship ` keeps today's path until PR 4's last task.
- **Open PR (PR 3):**
  - `LifecycleService` types single-line instructions into the worktree's newest live fly session through `SessionLauncher.sendText`. It does so only when the transcript shows the turn ended and fly's terminal holds no draft.
  - It waits for the next `turn_duration`, checks the worktree, then runs `git push` and `gh pr create`.
  - `QueueService` overrides the PR status with the record's phase.
- **CI, review, cleanup (PR 4):**
  - On each PR poll, `LifecycleService.poll` classifies failing checks: logs from `gh run view --job --log-failed` mean a fix goes to the session; anything else is an infrastructure stop.
  - The same poll forwards new review comments and notes conflicts and branches behind their base.
  - `CleanupService` runs after a successful merge, or from "Limpar".
  - The last task removes supera's receipt, `.supera/plan.md` and the ship bind.
- **Setup (PR 5):**
  - Three ports with CLI adapters, all through `CommandRunner`:
    - `Toolchain`: tool versions, `gh auth status`, `brew install`;
    - `AppInstaller`: `osascript` admin symlink, `hdiutil` installer discovery, eject + trash;
    - `AppRuntime`: the bundle path and version.
  - `SetupService` orchestrates them; the renderer's `SetupWizard` replaces the window while open.
- **Updates (PR 6):** `ReleaseSource` (`gh api repos/heronlabs/fly/releases/latest`) plus `UpdateService`. `UpdateHandler` ticks at start and every 6 h, in packaged builds only, and `FooterBar` shows `fly v<x> disponível · Baixar`.

**Tech Stack:** the M5 stack, plus electron-builder 26.15.3, which is already a devDependency (dmg target, ad-hoc signing). No new runtime dependency. External tools run through `CommandRunner`: `git`, `gh`, `tmux`, `claude`, `brew`, `osascript`, `hdiutil`, `plutil`.

**Spec:** `docs/superpowers/specs/2026-10-26-fly-m6-distribution-design.md`. It amends `docs/superpowers/specs/2026-10-19-fly-design.md` (D5–D8b, D12, §5.2–§5.8, §6, §7). Mockups: `.superpowers/brainstorm/37555-1793033900/content/wizard-flow.html` (its supera step is dropped) and `update-notice.html` (option B, footer).

**Decisions from the user (2026-10-26):** everything under "What the user decided" in the design.
- **Distribution:**
  - dmg + drag, then the wizard;
  - footer notice, manual update;
  - dev data in `fly-dev`;
  - "Configurar fly…" reopens the wizard;
  - no signing.
- **Lifecycle:**
  - fly owns it, and supera is retired; one flow for every PR;
  - "Abrir PR" button only;
  - the session commits;
  - fly's own PR template for every repo;
  - CI split: failed-step log → fix, at most 3 attempts; infrastructure/conflict → notify, "Rodar de novo";
  - optional model per task, plugins as enabled in Claude Code;
  - review comments shown and forwarded;
  - "Fazer merge" merges and cleans up, plus a "Limpar" button;
  - supera's signals go away at the end of PR 4, while `ScheduleWakeup`/`/loop` stay;
  - PR order 0–6 below.

**Verified before planning (2026-10-26):**
- **Distribution:**
  - `claude --version` → `2.1.310 (Claude Code)`. `claude --help` has `--model`, `--session-id`, `--settings`, `--fork-session`, `--json-schema` (`-p` only) and `--output-format`.
  - `gh api repos/heronlabs/fly/releases/latest` → `{"tag_name":"v0.3.0","html_url":"https://github.com/heronlabs/fly/releases/tag/v0.3.0","draft":false,"prerelease":false,…}`. The Release has no assets yet.
    - `action-tag-release@v7` creates the Release.
    - Its `tag` output is what `continuous-deployment.yml` already exposes as `needs.release.outputs.tag`.
  - `hdiutil info -plist` with nothing mounted → `{framework, revision, vendor, images: []}`. The mounted shape (`images[].image-path`, `images[].system-entities[].mount-point`) was **not observed**; Task 17 captures it from a real mount before writing the parser.
  - electron-builder 26.15.3:
    - It refuses `electron` in `dependencies` (`Package "electron" is only allowed in "devDependencies"`).
    - Its config comes from package.json `build`, else `electron-builder.yml`. It uses `main` (`./out/main/index.js`).
    - Signing: `mac.identity: null` leaves only the linker ad-hoc signature, and `codesign --verify --deep --strict` fails. `"-"` signs ad-hoc and needs `hardenedRuntime: false`.
    - The default `npmRebuild: true` compiles node-pty **in place**, so `npmRebuild: false` is needed.
    - With `electronFuses` absent, the fuses are untouched.
    - The dmg's default `contents` has the `/Applications` link, and the arm64 dmg is named `fly-<version>-arm64.dmg`.
  - Spike (`--mac dir --arm64`, `npmRebuild=false`, `asarUnpack` node-pty):
    - `ELECTRON_RUN_AS_NODE=1 fly.app/Contents/MacOS/fly fly.app/Contents/Resources/app.asar/out/main/cli.js help` prints the usage and exits 0.
    - RunAsNode is enabled.
    - node-pty loads from the asar and spawns through the unpacked `spawn-helper`.
    - The executable is `Contents/MacOS/fly`.
    - Without a `files` list, the asar took dev files and `node_modules/electron` (318 MB).
- **Sending a prompt to a live session** (private tmux socket, `claude --model haiku` in an `mktemp` dir, `--setting-sources project,local`):
  - **Typing mid-turn:** text submitted mid-turn is **queued**, not an interrupt.
    - Docs: "Claude Code queues the message instead of interrupting the turn". It goes out when the current tool calls finish (within the turn), or at turn end.
    - Observed: `queue-operation enqueue`, then turn 1's `stop_hook_summary` and `turn_duration`, then `dequeue`, then a new `user` line, giving its own turn.
  - **Typing text:** `send-keys -l` with a `\n` inside adds a line and does not submit; a separate `send-keys Enter` submits one message.
  - **Pasting:** a bracketed paste (`load-buffer` + `paste-buffer -p`) collapses to `[Pasted text #1 +41 lines]` and submits on Enter. But Claude Code wraps it as `<pasted_content>` and tells the model that a paste may carry instructions the user did not write. **So fly types the instruction and puts long material in files.**
  - **Turn end in the transcript:** assistant lines (`stop_reason: "end_turn"`), then `system/stop_hook_summary` (only when a Stop hook exists), then `system/turn_duration` (`durationMs`, `messageCount`, `pendingBackgroundAgentCount`). The parser already maps `turn_duration` to `phase: 'turn-ended'` and `lastTurnEndAt`.
  - **Stop hook:** a `--settings` Stop hook merges with file-based hooks; it was rejected in the design.
  - **Trust:** trust for a worktree is taken from the main checkout's root (docs, permissions).
- **gh 2.92.0:**
  - **Failed-job logs:** `gh run view --job <job id> --log-failed` works without a run id.
    - Each line is `<job>\t<step>\t<ISO timestamp>Z <text>`.
    - There is a BOM on each step's first line, ANSI codes appear as literal `^[[36;1m`, plus `##[group]`/`##[endgroup]`/`##[error]` markers. The text may contain tabs.
    - When gh cannot map steps, it prints the whole job log, tagged `UNKNOWN STEP` (903 lines / 132 KB for a Stryker job).
    - A billing-refused job (`steps: []`) prints `log not found: <id>` on stderr, exit 1.
  - **Check ids:** `gh pr checks --json` has no id field; the check's `link` (`detailsUrl` in `statusCheckRollup`) is `https://github.com/<o>/<r>/actions/runs/<run id>/job/<job id>`.
  - **`gh pr create`:** `-t/--title`, `-F/--body-file`, `-B/--base`, `-H/--head`. It prints the PR URL. Push first and pass `--head`, so it never prompts.
- **git 2.54 (scratch repos):**
  - **Creating the worktree:**
    - `git fetch origin trunk` moves `origin/trunk`.
    - `git worktree add -b task-1 <path> origin/trunk` sets the branch to track `origin/trunk`, after which a plain `git push` fails (exit 128). With `--no-track`, `git push -u origin task-2` works.
    - The main checkout's HEAD and dirty files are untouched.
  - **Default branch:**
    - `git symbolic-ref refs/remotes/origin/HEAD` → `refs/remotes/origin/main` on the real repo.
    - When it is unset: `fatal: ref refs/remotes/origin/HEAD is not a symbolic ref` (exit 128), and `--short -q` fails silently (exit 1).
    - `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` → `main`.
- **Current code:**
  - **Tasks and sessions:**
    - `TaskService.create` passes the prompt through `FLY_PROMPT` and `normalizePrompt`, which flattens newlines, with `MAX_DESCRIPTION = 2000` from tmux's command limit.
    - `TaskService.bind` binds sessions that have `@fly_task_repo` and no `@fly_worktree`.
    - `QueueService.readFly` treats a session without `@fly_task_repo` as "started without a prompt", and so idle until its first transcript line.
    - `TmuxSessionService.start` types the command with `send-keys -l` + `Enter`.
    - `TerminalService.write(terminalId, data)` carries every key the user types in fly's terminal.
  - **Queue and PRs:**
    - `PrGateway.merge` runs `gh pr merge <n> --merge`.
    - `gh pr list` asks for `number,url,headRefName,state,isDraft,mergeable,reviewDecision,statusCheckRollup,title`, and `classifyCheck` folds every non-passing conclusion into `failing`.
    - `QueueHandler` ticks the queue every 3 s and refreshes PRs every 30 s.
    - `PrView` shows the receipt under the PR.
  - **Packaging and CLI:**
    - `launchFolder(argv, {defaultApp})` picks `argv[1]` when packaged.
    - `CliHandler.open` spawns `execPath [appDir, folder]`.
    - `cli.ts` hardcodes `~/Library/Application Support/fly`.
    - `main.ts` takes `requestSingleInstanceLock()` at module top level.
    - `JsonConfigStoreService.coerce` keeps only known keys.
    - `.dependency-cruiser.json` `not-to-dev-dep` forbids devDependency imports except `node_modules/@types/`.

## Global Constraints

- Every M1–M5 constraint still holds:
  - layer and dependency rules (`pnpm dep:cruise`);
  - 100% coverage on `src` outside the excluded entry points and UI;
  - 100% Stryker on the `node` project;
  - kebab-case files with role suffixes;
  - pt-BR copy;
  - the renderer reaches main only through `window.fly`.
- Tests never run a real `gh`, `claude`, `brew`, `osascript`, `hdiutil`, `plutil`, `git --version` or `tmux -V`. Those go through a mocked `CommandRunner`. Git integration tests use `mkdtemp` repos with an `mkdtemp` bare `origin`; tmux tests use `-L fly-test-<hex>` with the fake `default-shell`. Tests never touch:
  - `/usr/local/bin`, `/Applications` or `~/.claude`;
  - `~/Library/Application Support/fly` or `…/fly-dev`;
  - the user's repos.
- Constants (exact):
  - **Data folders:** `USER_DATA_FOLDER = 'fly'`, `DEV_USER_DATA_FOLDER = 'fly-dev'`.
  - **Install:** `APPLICATIONS_BUNDLE = '/Applications/fly.app'`, `COMMAND_LINK = '/usr/local/bin/fly'`, `LAUNCHER_IN_BUNDLE = 'Contents/Resources/bin/fly'`.
  - **Doctor:** `MIN_CLAUDE_VERSION = '2.1.309'`.
  - **Updates:** `FLY_RELEASES_API = 'repos/heronlabs/fly/releases/latest'`, `UPDATE_CHECK_MS = 6 * 60 * 60 * 1000`.
  - **Task files:** `TASKS_FILE = 'tasks.json'`, `TASKS_DIR = 'tasks'`, `PROMPT_FILE_ENV = 'FLY_PROMPT_FILE'`.
  - **Limits:** `MAX_PROMPT_CHARS = 100_000`, `MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024`, `BRANCH_SUGGESTION_MAX = 40`, `MAX_CI_ATTEMPTS = 3`, `MAX_TITLE_CHARS = 72`.
  - **Models:** `MODELS = ['opus', 'sonnet', 'haiku'] as const`.
  - **Log excerpt:** `EXCERPT_CONTEXT_LINES = 60`, `EXCERPT_TAIL_LINES = 200`, `EXCERPT_MAX_CHARS = 20_000`.
  - **Titles:** `CONVENTIONAL_TITLE = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\s]+\))?!?: \S/`.
- Timeouts:
  - version probes and `gh auth status`: 10 s;
  - `brew install`: 600 s;
  - `hdiutil`/`plutil`: 15 s, and `hdiutil detach`: 30 s;
  - `gh api`: 15 s;
  - `git fetch`, `git push` and `git push --delete`: 60 s;
  - `git worktree add`/`remove`: 30 s;
  - `gh pr create`: 60 s;
  - `gh run view --log-failed`: 60 s;
  - `gh run rerun`: 30 s;
  - other git/gh calls keep their current 15 s.
- `electron` moves to `devDependencies`. `not-to-dev-dep` gains `node_modules/electron/` in `pathNot`.
- `version.txt` is never edited. `package.json` `version` is bumped only by CD (`bumpNpm: true`).
- pt-BR copy (new):
  - **"Nova tarefa" dialog:**
    - labels `Branch`, `Modelo`, `Padrão do Claude Code`;
    - `Anexar arquivos` and `Arraste arquivos aqui ou cole uma imagem`;
    - `Remover`.
  - **Task errors:**
    - `Nome de branch inválido`;
    - `O branch <b> já existe`;
    - `Já existe uma pasta em <path>`;
    - `Repositório sem remote origin`;
    - `git fetch falhou: <msg>`;
    - `Não foi possível descobrir o branch padrão`;
    - `Prompt muito longo (máx. 100000 caracteres)`;
    - `Arquivo maior que 20 MB: <nome>`;
    - `Modelo inválido`.
  - **PR tab:**
    - `Abrir PR`;
    - `Abrindo PR: aguardando a sessão commitar e escrever o PR…`;
    - `Corrigindo a CI (tentativa <k> de 3)`;
    - `Encaminhando comentários de review…`;
    - `Correções de CI: <k> de 3`;
    - `<k> comentários de review novos`, `Comentários encaminhados à sessão`;
    - `Rodar de novo`, `Retomar`, `Limpar`;
    - `O PR #<n> foi fechado sem merge. Apagar o worktree e o branch mesmo assim?`.
  - **Refusals:**
    - `Nenhuma sessão do fly aberta neste worktree`;
    - `A sessão está ocupada; aguarde o turno terminar`;
    - `Há texto digitado e não enviado na sessão`;
    - `Já existe um PR aberto`;
    - `Nada para rodar de novo`;
    - `Confirme a limpeza de um PR fechado sem merge`.
  - **Stops:**
    - `Ficaram mudanças sem commit: <arquivos separados por ", ">`;
    - `Nada para abrir: o branch não tem commits à frente de <base>`;
    - `A sessão não escreveu o título e o corpo do PR`;
    - `Título fora do padrão Conventional Commits: <título>`;
    - `git push falhou: <msg>`;
    - `gh pr create falhou: <msg>`;
    - `A sessão não commitou uma correção`;
    - `CI falhou 3 vezes; parei de corrigir`;
    - `Falha de infraestrutura na CI: <checks separados por ", ">`;
    - `Conflito com <base>`;
    - `Branch atrás de <base>`;
    - `A sessão do worktree foi encerrada`;
    - `Falha ao limpar: <msg>`.
  - **Instructions typed into the session** (exact, one line each):
    - Open: `fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em <dir>/pr-request.md`.
    - Fix: `fly: a CI do PR #<n> falhou (tentativa <k> de 3). Logs: <arquivos separados por ", ">. Corrija, rode as verificações locais e commite (Conventional Commits, sem push).`.
    - Review: `fly: há comentários de review novos no PR #<n> em <arquivo>. Avalie cada um, corrija o que fizer sentido e commite (Conventional Commits, sem push).`.
  - **Wizard frame:**
    - `Passo N de 3`;
    - `Arraste o fly para Aplicativos e abra de lá.` and `O fly está rodando de <bundlePath>.`.
  - **Wizard step 1:**
    - `Verificando o que o fly precisa`;
    - rows `git`, `gh`, `tmux`, `claude`;
    - `✓ <versão>`;
    - problems `não encontrado`, `não logado`, `versão <v>; precisa <min> ou mais`;
    - `Instalar com brew`, `Copiar`, `Verificar de novo`, `Continuar`;
    - `Homebrew não encontrado` plus the brew.sh link (`https://brew.sh`);
    - `Instalando <id>…`.
  - **Wizard step 2:**
    - `Comando fly no terminal`;
    - `O fly também vai para a linha de comando, como o code do VSCode:`;
    - `/usr/local/bin/fly → /Applications/fly.app`;
    - `Sem mexer no .zshrc: /usr/local/bin já está no PATH padrão do macOS. O macOS vai pedir sua senha de administrador.`;
    - `/usr/local/bin/fly aponta para outro lugar; será substituído.`;
    - `✓ já instalado`;
    - `Instalar e continuar`, `Continuar`, `Tentar de novo`, `Pular`.
  - **Wizard step 3:**
    - `Tudo pronto`;
    - rows `Dependências`, `Comando fly` with `✓` or `pulado`;
    - `Apagar o instalador?`;
    - `<arquivo> em <pasta>. O disco é ejetado e o arquivo vai para a Lixeira.`;
    - `Manter`, `Mover para Lixeira`, `Começar`.
  - **Wizard errors:**
    - `Instalação cancelada`;
    - `Falha ao instalar o comando: <msg>`;
    - `Homebrew não encontrado`;
    - `brew install <x> falhou: <msg>`;
    - `Instale o claude pelo comando indicado`;
    - `Disponível só no app instalado`;
    - `Falha ao ejetar o instalador: <msg>`;
    - `Caminho inválido`.
  - **Menu, footer and `bin/fly`:**
    - menu: `Configurar fly…`;
    - footer: `fly v<x.y.z> disponível`, `Baixar`;
    - `bin/fly`: `fly: executável não encontrado em <dir>: reinstale o fly`.
- Git flow:
  - Each PR goes through `/supera:ship` (worktree from `origin/main`, per-task commits, PR, `/supera:pr-watch`).
  - PRs are sequential: each starts after the previous one is merged by the user.
  - Starting each ship from fly:
    - before PR 2 merges, "Nova tarefa" already runs ship;
    - from PR 2 until PR 4 merges, use "Nova tarefa" with the prompt `/supera:ship <task>` (P5), which keeps ship sessions bound to their worktrees;
    - after PR 4 (Task 14 removes that path), start `/supera:ship` from a session on the main worktree, where it then shows.
  - The PRs:
    - **PR 0** (docs): this plan, the design, and the amendment notes in the main spec.
    - **PR 1** `feat-m6-packaging`: Tasks 1–3.
    - **PR 2** `feat-m6-task-start`: Tasks 4–7.
    - **PR 3** `feat-m6-open-pr`: Tasks 8–10.
    - **PR 4** `feat-m6-ci-fix`: Tasks 11–14.
    - **PR 5** `feat-m6-setup-wizard`: Tasks 15–20.
    - **PR 6** `feat-m6-update-notice`: Tasks 21–22.
  - Never push to `main`. Commits end with the session's `Co-Authored-By` trailer.
- Test commands:
  - Targeted: `pnpm vitest run --project <node|ui> <paths>`.
  - Gate: `pnpm typecheck && pnpm lint:check && pnpm dep:cruise && pnpm test:unit && pnpm test:di && pnpm build`, then `pnpm stryker run stryker.conf.json --mutate '<node-side files of the task>'`.
  - Modules that `main.ts` does not reach until a PR's wiring task may fail only `no-unreachable-from-entry`/`no-orphans` in between. Each PR passes in full.
- Wiring each PR pays once: `fly-api.ts` channels and types, `preload.ts`, `ipc-module.ts` providers, `main.ts` registration, `tests/di/ipc-module.spec.ts`, and the `tests/ui/setup.ts` stub.

## Planning rulings

Each ruling gives the decision, then what it costs if it is wrong.

- **P1. Data folders.**
  - `main.ts` calls `app.setPath('userData', join(app.getPath('appData'), userDataFolder(app.isPackaged)))` **before** `requestSingleInstanceLock()`.
  - `cli.ts` decides with `cliLayout(__dirname, homedir())`. When the parent of `out/` is named `app.asar`, the CLI is packaged (`appDir: null`, folder `fly`); otherwise it is a checkout (`appDir`, folder `fly-dev`).
  - Task records and folders follow `userData`, so dev and installed keep separate tasks.
  - Cost: dev recent folders start empty once; the README says so.
- **P2. One launcher for both layouts.**
  - `bin/fly` resolves `ROOT` as today.
  - When `$ROOT/app.asar` is a file, Electron is `$ROOT/../MacOS/fly` and the CLI is `$ROOT/app.asar/out/main/cli.js`; only the executable is checked.
  - Otherwise the checkout checks run unchanged.
  - Cost: none.
- **P3. Packaged `fly <pasta>`.** `CliContext.appDir: string | null`. With `null`, `open` skips the build check and spawns `execPath [folder]` (env without `ELECTRON_RUN_AS_NODE`). Cost: none.
- **P4. Build config** (`electron-builder.yml`, exact):
  ```yaml
  appId: com.heronlabs.fly
  productName: fly
  directories:
    output: dist
    buildResources: build
  files:
    - out/**/*
    - package.json
  asarUnpack:
    - '**/node_modules/node-pty/**'
  extraResources:
    - from: bin/fly
      to: bin/fly
  npmRebuild: false
  mac:
    target:
      - target: dmg
        arch: [arm64]
    identity: '-'
    hardenedRuntime: false
    category: public.app-category.developer-tools
  dmg:
    artifactName: ${productName}-${version}-${arch}.${ext}
  ```
  - Add the script `"dist": "electron-builder --publish never"`. There is no `electronFuses` key.
  - Cost: if `identity: '-'` fails to sign or launch, fall back to `identity: null`, and the README's unblock step becomes `xattr` only (Task 2 decides). If `files` drops production `node_modules`, `fly help` from the bundle fails and Task 2 catches it.
- **P5. Task start.**
  - **`TaskService.create(input: NewTaskInput)`**, in order:
    1. validate the input;
    2. `vcs.defaultBranch(repo)`, else `prs.defaultBranch(repo)`;
    3. `vcs.fetch(repo, base)`;
    4. `vcs.addWorktree({repoPath, path: <repo>/.worktrees/<branch>, branch, base: 'origin/' + base})`;
    5. `vcs.ensureIgnored(repo, '.worktrees')`;
    6. write `prompt.md` and copy the attachments into `<userData>/tasks/<task id>/`;
    7. `SessionService.launch(worktreeId, path, {promptFile, model, task: label})`;
    8. save the record (`phase: 'working'`).
  - **Validation** (before anything is created):
    - branch: `vcs.validBranchName` → `Nome de branch inválido`;
    - existing branch → `O branch <b> já existe`;
    - existing path (`FileStore.exists`) → `Já existe uma pasta em <path>`;
    - model outside `MODELS` and not `null` → `Modelo inválido`;
    - prompt over `MAX_PROMPT_CHARS` → `Prompt muito longo (máx. 100000 caracteres)`;
    - an attachment over `MAX_ATTACHMENT_BYTES` → `Arquivo maior que 20 MB: <basename>`.
  - **Failures after the worktree exists** (prompt files, session start): the worktree and branch stay, and the error shows. The user can start a session on it by hand. That costs no data.
  - **The prompt file** is the text, with control characters other than `\n`/`\t` dropped, plus, when there are attachments, `\n\nArquivos anexados:\n` and one `- <absolute path>` line per copy.
  - **The command** is `claude --dangerously-skip-permissions --session-id <uuid>[ --model <m>] "$(cat "$FLY_PROMPT_FILE")"; exit`, with `FLY_PROMPT_FILE` in the tmux env.
  - **Transitional:** a description starting with `/supera:ship ` takes the current code path unchanged (repo root, `FLY_PROMPT`, `@fly_task_repo`, bind). Task 14 deletes it.
  - Cost: a fetch failure blocks task creation offline. That is accepted, because the design wants the up-to-date base.
- **P6. Talking to a session.** `LifecycleService.target(worktree)` is the newest (`createdAt`) live session mapped to the worktree with `@fly_session_id`.
  - **Idle:** `forSession({launchCwd: worktree.path, sessionId})` gives `phase === 'turn-ended' && !asking && backgroundAgents === 0`.
  - **Draft:** `TerminalService.hasDraft(session.name)`.
  - **Send:** `launcher.sendText(name, text)` runs `send-keys -t =<name>: -l <text>`, then `send-keys -t =<name>: Enter`. The record's `pending = {kind, sentAt: now, headSha}`.
  - **Turn done:** a pending action completes when `summary.lastTurnEndAt > pending.sentAt`.
  - A pending action with no live target stops with `A sessão do worktree foi encerrada`.
  - Cost: a turn that never writes `turn_duration` (an interrupted turn) leaves the action pending; "Retomar" clears it.
- **P7. Draft rule** (`TerminalService`, per session name, updated on every `write`):
  - First strip `\x1b\[[0-9;?]*[ -/]*[@-~]` and `\x1bO.`.
  - When the data contains `\r` or `\x03`, `draft` = whether a printable character (`[^\x00-\x1f\x7f]`) follows the last of them.
  - Otherwise, a printable character sets `draft = true`.
  - Data with only control characters leaves `draft` unchanged.
  - Cost: a draft typed from Termius is invisible (accepted in the design).
- **P8. Open PR** (`LifecycleService.openPullRequest(worktreeId)`):
  - **Refusals:**
    - main worktree or no branch → `Worktree não encontrado`;
    - open PR exists → `Já existe um PR aberto`;
    - no target → `Nenhuma sessão do fly aberta neste worktree`;
    - not idle → `A sessão está ocupada; aguarde o turno terminar`;
    - draft → `Há texto digitado e não enviado na sessão`.
  - **The record:** created when absent (base by P5's default-branch rule, no prompt file). The click writes `pr-request.md` (P9), sends the Open instruction, and sets `phase: 'opening'` with the stop cleared.
  - **On turn done** (`tick`):
    1. `vcs.status` not empty → stop `Ficaram mudanças sem commit: …`;
    2. `vcs.aheadCount(worktree, 'origin/' + base) === 0` → stop `Nada para abrir: …`;
    3. `pr.json` missing, not JSON, or without string `title`/`body` → stop `A sessão não escreveu o título e o corpo do PR`;
    4. a title failing `CONVENTIONAL_TITLE` or longer than `MAX_TITLE_CHARS` → stop `Título fora do padrão Conventional Commits: <t>`;
    5. `vcs.push(worktree, branch)` failure → stop `git push falhou: <msg>`;
    6. write `pr-body.md`, then `prs.create({cwd: worktree, title, bodyFile, base, head: branch})`. A failure → stop `gh pr create falhou: <msg>`; success → `prNumber`, `phase: 'ci'`, `reviewSeenAt: now`.
  - Every stop is `{kind: 'open', message}` with `phase: 'stopped'`.
  - Cost: none.
- **P9. `pr-request.md`** (built by `prRequest({template, prompt, outFile})` in `task-rules.ts`; `prompt` is the original prompt text or `null`). It is English and must contain:
  - `Write the pull request for this branch as JSON to <outFile>: {"title": string, "body": string}.`
  - The title rule: Conventional Commits, at most 72 characters, describing the whole branch.
  - The body rule: fill the template below section by section, in English, deleting a section's comment hints, and leaving a section empty only when it does not apply.
  - Motivation: with a prompt, `quote the original task under Motivation:` followed by the prompt as a `>` block; without one, `write Motivation from this conversation`.
  - The template itself, verbatim.
  - The template is `PR_TEMPLATE` in `src/core/domain/pr-template.ts`. A unit test asserts it equals `.github/PULL_REQUEST_TEMPLATE.md` byte for byte, so the repo file stays the single source.
  - Cost: none.
- **P10. CI and review poll** (`LifecycleService.poll(now)`, after each PR refresh, for each record whose worktree still exists). Order per record:
  1. **Adopt:** when `prNumber === null`, `phase === 'working'`, and an open PR exists for the branch → `prNumber`, `phase: 'ci'`, `reviewSeenAt: now`.
  2. **Skip:** the PR is not open, or `pending`/`outbox` is set.
  3. **Green:** checks `passing` → `ciAttempts = 0`, `fixedSha = null`. A stop of kind `ci`/`infra` clears, and `phase` becomes `ci`.
  4. **Conflict and behind:** `mergeable === 'conflicting'` → stop `{kind: 'conflict', message: 'Conflito com <base>'}`; `behind` → stop `{kind: 'behind'}`. Each clears by itself when its condition is gone.
  5. **Failing checks**, when `checks === 'failing'`, `headSha !== fixedSha` and there is no stop:
     - candidates are failing `CheckRun`s with `conclusion === 'FAILURE'` and a `jobId`;
     - each candidate's `prs.failedLog(repo, jobId)` (`null` on any failure);
     - for jobs with a log, write `ci-<jobId>-<sha7>.log` = `logExcerpt(raw)`;
     - no log at all → stop `{kind: 'infra', message: 'Falha de infraestrutura na CI: <names>', runIds}` with the distinct `runId`s of all failing checks;
     - `ciAttempts >= MAX_CI_ATTEMPTS` → stop `{kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'}`;
     - otherwise `outbox = {kind: 'fix', text: <Fix instruction with k = ciAttempts + 1>, headSha}`.
  6. **Review**, only when no outbox was set: `prs.reviewComments(repo, n)` filtered to `createdAt > reviewSeenAt` and non-empty `body`. When any remain:
     - write `review-<n>-<newest createdAt>.md` (one block per comment: `### <author> — <path:line or "PR">`, the body, the link);
     - set `outbox = {kind: 'review', text: <Review instruction>, headSha: pr.headSha}`;
     - set `reviewSeenAt` to the newest `createdAt`;
     - set `review = {count, state: 'queued'}`.
  - **`tick(now)`:**
    - an `outbox` with an idle, draftless target is sent: `pending` is set, then `phase` is `fixing` (with `ciAttempts += 1` and `fixedSha = headSha`) or `reviewing` (with `review.state = 'sent'`);
    - a pending `fix`/`review` on turn done:
      - dirty → stop `Ficaram mudanças sem commit: …`;
      - head unchanged: `fix` → stop `{kind: 'ci', message: 'A sessão não commitou uma correção'}`; `review` → `phase: 'ci'`, `review.state = 'done'`;
      - head changed → `vcs.push`, whose failure is a stop; then `phase: 'ci'`, and a review's state becomes `done`.
  - **Network failures** in `poll` are swallowed and retried next poll.
  - Cost: a fix and a review never travel together. A CI fix goes first, and the comments go on the next poll.
- **P11. Status override** (`worktreeStatus` gains `task: TaskRecord | null`):
  - `opening`/`fixing`/`reviewing` → `engineer`;
  - `stopped` → `waiting`;
  - otherwise unchanged.
  - Cost: none.
- **P12. Cleanup** (`CleanupService.clean(worktreeId, {confirmed})`):
  - **Availability:** any non-main worktree whose PR (`pullRequestOf`) is `merged`, or `closed` with `confirmed`. Otherwise it rejects `Worktree não encontrado` or `Confirme a limpeza de um PR fechado sem merge`.
  - **Steps**, each skipped when already done:
    1. kill every tmux session mapped to the worktree;
    2. `vcs.removeWorktree(repo, path)` when listed;
    3. `vcs.deleteBranch(repo, branch)` when it exists;
    4. `vcs.deleteRemoteBranch(repo, branch)`, where stderr containing `remote ref does not exist` counts as done;
    5. `files.remove(taskId)` and `tasks.remove(path)` when a record exists.
  - Any failure rejects `Falha ao limpar: <msg>`.
  - `QueueService.mergePullRequest` is unchanged. `LifecycleService.merge(worktreeId)` calls it, then `cleanup.clean(worktreeId, {confirmed: true})`. A cleanup failure after a successful merge still rejects, so the renderer shows it, and "Limpar" retries.
  - Cost: none.
- **P13. Wizard visibility.**
  - `SetupService.info(requested)` returns `open = packaged && (requested || !done)`.
  - `SetupHandler` keeps a `pending` flag in the `LaunchHandler` style. Dev never opens it.
  - `inApplications` false → the move screen.
  - Cost: none.
- **P14. Doctor rules** (`checkTool` in `setup-rules.ts`):
  - **Missing:** version `null` → `não encontrado`; the fix is `{kind: 'brew', formula: id}` for git/gh/tmux, and `{kind: 'copy', command: 'npm install -g @anthropic-ai/claude-code'}` for claude.
  - **gh logged out:** gh present but `loggedIn` false → `não logado`, copy `gh auth login`.
  - **Old claude:** claude below `MIN_CLAUDE_VERSION` → `versão <v>; precisa 2.1.309 ou mais`, copy `claude update`.
  - **Versions:** `compareVersions` uses `parseInt` per dot part, and a missing part is 0.
  - Cost: a tool outside the login-shell PATH reads as missing; `main.ts` merges the login PATH.
- **P15. Command install.**
  - `osascript -e 'do shell script "mkdir -p /usr/local/bin && ln -sf " & quoted form of "<launcher>" & " /usr/local/bin/fly" with administrator privileges'`. A launcher containing `"` or `\` → `Caminho inválido`.
  - **Failures:** `-128` → `Instalação cancelada`; other → `Falha ao instalar o comando: <stderr>`.
  - **`commandState`:** absent → `missing`; same real path → `installed`; else `other`.
  - Cost: none.
- **P16. Installer discovery and trash.**
  - Discovery runs `/bin/sh -c 'hdiutil info -plist | plutil -convert json -o - -'`. The first image whose mount point holds `fly.app` is the installer.
  - Trash re-discovers the installer, runs `hdiutil detach <mountPoint>`, then `TRASH_ITEM(imagePath)` (`shell.trashItem`).
  - Cost: none.
- **P17. Updates.**
  - `UpdateService.check()` calls `ReleaseSource.latest()`: newer → `{version, url}`, otherwise `null`; a failure keeps the previous notice.
  - `UpdateHandler.start()` checks at once and every `UPDATE_CHECK_MS` (`unref`). It broadcasts `update:changed` only on change, and only runs when packaged.
  - Cost: dev never shows a notice.
- **P18. Menu.** `appMenuTemplate(onSetup)` returns the app menu `[about, separator, 'Configurar fly…', separator, services, separator, hide, hideOthers, unhide, separator, quit]` plus the `fileMenu`, `editMenu`, `viewMenu` and `windowMenu` roles. It is set only when packaged. Cost: none.

## Review Focus

1. **Typing into a session at the wrong moment**: fly must not type while
   - a turn is running;
   - an `AskUserQuestion` is open;
   - a background agent runs;
   - the user left text unsent in fly's terminal (including after arrow keys or Ctrl+C);
   - the session died between poll and tick.
   Expected: fly waits (outbox kept) or refuses with the pt-BR message, and never sends twice for one outbox. Tests: Task 8 (`hasDraft` sequences), Task 9 (`openPullRequest` refusals, the turn-done comparison against `sentAt`), Task 12 (outbox kept while busy, dead target stop).
2. **Git surprises at start and at PR open**:
   - **At start:**
     - no `origin`;
     - offline fetch;
     - an existing branch, path or invalid name;
     - `origin/HEAD` unset (gh fallback);
     - `.worktrees` already ignored vs not;
     - a prompt with newlines and `$`/quotes (it must reach `claude` verbatim).
   - **At open:**
     - leftovers after the commit turn;
     - zero commits ahead;
     - `pr.json` missing or malformed;
     - a non-conventional or 73-character title;
     - push rejected.
   Expected: one clear message, nothing half-created before validation, and a stop rather than a push. Tests: Task 5 (integration on mkdtemp repos), Task 6, Task 9.
3. **CI log shapes and loop edges**:
   - a billing-refused job with no log;
   - a 132 KB `UNKNOWN STEP` log;
   - no `##[error]`;
   - literal `^[[` codes and tabs inside text;
   - a StatusContext failure;
   - the same head SHA failing after a fix;
   - the third attempt;
   - green resetting the counter;
   - conflict and behind clearing by themselves.
   Expected: the right fixable/infra split, excerpts under 20 000 characters that keep the error, and no resend for the same SHA. Tests: Task 11 (parsers), Task 12 (`logExcerpt`, `poll` cases).
4. **Cleanup hazards**:
   - a dirty worktree;
   - a closed, unmerged PR without confirmation;
   - a remote branch already deleted (GitHub auto-delete);
   - a step failing halfway, then "Limpar" again;
   - a worktree without a record (pre-M6).
   Expected: git's refusal is shown and nothing after it runs; the retry skips the steps already done; records are touched only when they exist. Tests: Task 13.
5. **Distribution system changes**:
   - `pnpm dev` beside the installed app;
   - the password cancelled;
   - `/usr/local/bin` absent or `fly` pointing elsewhere;
   - a launcher path with a quote;
   - no dmg, or two dmgs mounted;
   - the dmg ejected before the trash;
   - claude older than 2.1.309;
   - gh logged out;
   - brew absent;
   - offline update check.
   Expected: two independent instances, a clear pt-BR error with retry/skip, no crash, and no notice change on failure. Tests: Tasks 1, 15–21.

---

### Task 1: Dev and installed data folders, packaged `fly <pasta>`

**Files:**
- Create: `src/core/domain/app-data.ts`, `src/application/cli/cli-layout.ts`
- Modify: `src/application/cli/cli-handler.ts` (`CliContext.appDir`, `open`), `src/cli.ts`, `src/main.ts` (before the lock)
- Test: `tests/unit/core/domain/app-data.spec.ts`, `tests/unit/application/cli/cli-layout.spec.ts`, `tests/unit/application/cli/cli-handler.spec.ts`

**Interfaces:**
- Produces:
  - `USER_DATA_FOLDER`, `DEV_USER_DATA_FOLDER`, `userDataFolder(packaged: boolean): string`;
  - `type CliLayout = {appDir: string | null; userData: string}` and `cliLayout(dirname: string, home: string): CliLayout`;
  - `CliContext.appDir: string | null` (null = installed app).

- [ ] **Step 1: Write the failing tests**
  - `app-data.spec.ts`: `userDataFolder(true) === 'fly'`; `userDataFolder(false) === 'fly-dev'`.
  - `cli-layout.spec.ts`:
    - `Should read a checkout layout`: `cliLayout('/repo/out/main', '/h')` → `{appDir: '/repo', userData: '/h/Library/Application Support/fly-dev'}`.
    - `Should read the installed bundle`: `cliLayout('/Applications/fly.app/Contents/Resources/app.asar/out/main', '/h')` → `{appDir: null, userData: '/h/Library/Application Support/fly'}`.
    - `Should not take a folder named like the asar for the bundle`: `cliLayout('/x/app.asar.bak/out/main', '/h').appDir === '/x/app.asar.bak'`.
  - `cli-handler.spec.ts`:
    - `Should open the folder on the installed app without an app dir`, with:
      - context `appDir: null`, `execPath: '/Applications/fly.app/Contents/MacOS/fly'`, env `{ELECTRON_RUN_AS_NODE: '1', HOME: '/h'}`;
      - `run(['/w'])` → `processes.detached` called with `('/Applications/fly.app/Contents/MacOS/fly', ['/w'], {HOME: '/h'})`, `files.exists` not called, exit 0.
    - The existing checkout tests keep passing with `appDir: '/repo'`.
- [ ] **Step 2: Run them and confirm they fail.** `pnpm vitest run --project node tests/unit/core/domain/app-data.spec.ts tests/unit/application/cli` → FAIL.
- [ ] **Step 3: Implement.**
  - `cliLayout`: root = `resolve(dirname, '../..')`, packaged when `basename(root) === 'app.asar'`, userData = `join(home, 'Library', 'Application Support', userDataFolder(packaged))`.
  - `open` handles `appDir === null` per P3.
  - `cli.ts` uses `cliLayout(__dirname, homedir())`.
  - `main.ts` applies P1's `app.setPath` before `requestSingleInstanceLock()`.
- [ ] **Step 4: Run them and confirm they pass.** Then the gate, and Stryker on `src/core/domain/app-data.ts,src/application/cli/cli-layout.ts,src/application/cli/cli-handler.ts`.
- [ ] **Step 5: Manual check.** `pnpm dev`, open a folder, quit. `~/Library/Application Support/fly-dev/config.json` lists it, and the mtime of `…/fly/config.json` is unchanged.
- [ ] **Step 6: Commit** `feat: separate dev data folder and open folders on the installed app`.

### Task 2: Bundle layout in `bin/fly`, electron-builder config, `pnpm dist`

**Files:**
- Create: `electron-builder.yml` (P4, exact)
- Modify:
  - `bin/fly` (P2);
  - `package.json`: `electron` moves to `devDependencies`; add the `dist` script;
  - `pnpm-lock.yaml`;
  - `.dependency-cruiser.json`: `not-to-dev-dep.to.pathNot` gains `"node_modules/electron/"`.
- Test: `tests/integration/cli/fly-launcher.spec.ts`

**Interfaces:**
- Produces: `dist/fly-<version>-arm64.dmg` and `dist/mac-arm64/fly.app`, with `Contents/MacOS/fly`, `Contents/Resources/app.asar` and an executable `Contents/Resources/bin/fly`. Tasks 3, 17 and 19 rely on these paths.

- [ ] **Step 1: Write the failing tests** in `fly-launcher.spec.ts`. The fake bundle is:
  - `<dir>/fly.app/Contents/MacOS/fly`: the printing stub;
  - `<dir>/fly.app/Contents/Resources/app.asar`: an empty file;
  - the real `bin/fly` at `<dir>/fly.app/Contents/Resources/bin/fly`.
  The cases:
  - `Should run cli.js inside the asar on the bundle executable through /usr/local/bin-style link`: a symlink `<dir>/links/fly` to the bundle's `bin/fly`. Running it with `['ls']` → stdout `['1', '<bundle>/Contents/Resources/app.asar/out/main/cli.js', 'ls', ''].join('\n')`, empty stderr, status 0.
  - `Should report a bundle without its executable`: with `MacOS/fly` removed → status 1, stderr `fly: executável não encontrado em <bundle>/Contents/MacOS: reinstale o fly\n`.
  - The existing checkout tests pass unchanged.
- [ ] **Step 2: Run them and confirm they fail.** `pnpm vitest run --project node tests/integration/cli/fly-launcher.spec.ts` → the two new cases FAIL.
- [ ] **Step 3: Implement P2 in `bin/fly`.** Branch on `[ -f "$ROOT/app.asar" ]`; the final `exec` line is shared. Add a comment naming both layouts.
- [ ] **Step 4: Run them and confirm they pass.**
- [ ] **Step 5: Apply the config.** Write `electron-builder.yml`, move `electron`, run `pnpm install`, and update `.dependency-cruiser.json`. The gate passes.
- [ ] **Step 6: Build and check the bundle.** `pnpm build && pnpm dist`, then:
  - `ls dist/fly-*-arm64.dmg` → one file;
  - `codesign --verify --deep --strict dist/mac-arm64/fly.app` → exit 0 (else apply P4's fallback and note it in the PR body);
  - `test -x dist/mac-arm64/fly.app/Contents/Resources/bin/fly`;
  - `dist/mac-arm64/fly.app/Contents/Resources/bin/fly help` → prints `Uso:`;
  - `test ! -e dist/mac-arm64/fly.app/Contents/Resources/app.asar.unpacked/node_modules/electron`;
  - `ls …/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64` → `pty.node spawn-helper`;
  - `du -sh dist/mac-arm64/fly.app` → under 400 MB.
- [ ] **Step 7: Manual check.** `open dist/mac-arm64/fly.app` while `pnpm dev` runs. Both windows open, and a terminal session attaches in the packaged one.
- [ ] **Step 8: Commit** `build: package fly as an arm64 dmg with the fly launcher`.

### Task 3: CD dmg job and install docs

**Files:**
- Modify:
  - `.github/workflows/continuous-deployment.yml`: replace the `TODO(fly M6)` line;
  - `README.md`;
  - `CLAUDE.md` and `CONTRIBUTING.md`: the `pnpm dist` row, and the `fly-dev` note.

**Interfaces:**
- Consumes: `pnpm dist` (Task 2), `needs.release.outputs.tag`.

- [ ] **Step 1: Add the job** (exact):
  ```yaml
    dmg:
      needs: release
      runs-on: macos-latest
      timeout-minutes: 30
      permissions:
        contents: write
      steps:
        - uses: actions/checkout@v7
          with:
            ref: ${{ needs.release.outputs.tag }}

        - uses: pnpm/action-setup@v6

        - uses: actions/setup-node@v7
          with:
            node-version-file: '.node-version'
            cache: 'pnpm'

        - run: pnpm install --frozen-lockfile

        - run: pnpm build

        - run: pnpm dist

        - run: gh release upload "$TAG" dist/*.dmg --clobber
          env:
            GH_TOKEN: ${{ github.token }}
            TAG: ${{ needs.release.outputs.tag }}
  ```
- [ ] **Step 2: Update the docs.**
  - **README "Install":**
    - download `fly-<versão>-arm64.dmg` from the latest Release, drag it to Aplicativos, open it;
    - the unblock step: Ajustes > Privacidade e Segurança > "Abrir mesmo assim", or `xattr -dr com.apple.quarantine /Applications/fly.app`;
    - updating = drag the new dmg over the old app.
  - **README "Development":**
    - `pnpm dev`, `pnpm cli:install`;
    - `~/.local/bin` usually precedes `/usr/local/bin`;
    - dev data lives in `fly-dev`.
  - **`CLAUDE.md`/`CONTRIBUTING.md`:** `pnpm dist | Build the arm64 dmg into dist/ (run pnpm build first)`.
- [ ] **Step 3: Verify.** `pnpm lint:check` passes. As a post-merge check in the PR body, `gh release view <tag> --json assets` lists the dmg.
- [ ] **Step 4: Commit** `ci: build the dmg on release and document the install`.

### Task 4: Task domain, `TaskStore`, `TaskFiles`

**Files:**
- Create:
  - `src/core/domain/task.ts`, `src/core/domain/pr-template.ts`;
  - `src/core/interfaces/task-store.ts`, `src/core/interfaces/task-files.ts`;
  - `src/infrastructure/environment/json-task-store-service.ts`, `src/infrastructure/filesystem/node-task-files-service.ts`.
- Test: `tests/unit/core/domain/pr-template.spec.ts`, `tests/unit/infrastructure/environment/json-task-store-service.spec.ts`, `tests/integration/filesystem/node-task-files-service.spec.ts`

**Interfaces:**
- Produces (`task.ts`):
  - `type TaskPhase = 'working' | 'opening' | 'ci' | 'fixing' | 'reviewing' | 'stopped'`;
  - `type TaskStop = {kind: 'open' | 'ci' | 'infra' | 'conflict' | 'behind' | 'session'; message: string; runIds?: string[]}`;
  - `type TaskAction = {kind: 'open' | 'fix' | 'review'; text?: string; sentAt?: number; headSha: string | null}`;
  - `type TaskRecord = {id: string; repoPath: string; worktreePath: string; branch: string; base: string; model: string | null; promptFile: string | null; prNumber: number | null; phase: TaskPhase; ciAttempts: number; fixedSha: string | null; reviewSeenAt: number | null; review: {count: number; state: 'queued' | 'sent' | 'done'} | null; outbox: TaskAction | null; pending: TaskAction | null; stop: TaskStop | null; createdAt: number}`;
  - `type NewTaskInput = {repoId: string; description: string; branch: string; model: string | null; attachments: string[]}`;
  - the task constants from Global Constraints (`TASKS_FILE` … `CONVENTIONAL_TITLE`).
- Produces: `PR_TEMPLATE: string` (`pr-template.ts`), equal to `.github/PULL_REQUEST_TEMPLATE.md`.
- Produces (ports):
  - `abstract class TaskStore {list(): Promise<TaskRecord[]>; get(worktreePath: string): Promise<TaskRecord | null>; save(record: TaskRecord): Promise<void>; remove(worktreePath: string): Promise<void>}`;
  - `abstract class TaskFiles {dir(taskId: string): string; write(taskId: string, name: string, content: string): Promise<string>; read(taskId: string, name: string): Promise<string | null>; copyIn(taskId: string, source: string): Promise<string>; remove(taskId: string): Promise<void>}`.

- [ ] **Step 1: Write the failing tests.**
  - `pr-template.spec.ts`: `PR_TEMPLATE === readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8')`.
  - `JsonTaskStoreService` (fake `FileStore`, `USER_DATA_DIR` `/u`):
    - `save` then `get('/r/.worktrees/a')` returns the record, and `/u/tasks.json` holds `[record]`;
    - a second `save` with the same `worktreePath` replaces it;
    - `remove` drops it;
    - a missing file, invalid JSON, or entries without string `id`/`worktreePath` → `list()` gives the valid entries only;
    - reads after the first `list` come from memory (one `readText`).
  - `NodeTaskFilesService` (`mkdtemp` user-data dir):
    - `write('t1', 'prompt.md', 'x')` → `<dir>/tasks/t1/prompt.md` with `x`;
    - `read` of a missing name → `null`;
    - `copyIn('t1', <src>/spec.pdf)` → `<dir>/tasks/t1/attachments/spec.pdf` with the same bytes;
    - two sources with the same basename → `spec.pdf` and `spec-2.pdf`;
    - a source of `MAX_ATTACHMENT_BYTES + 1` bytes → rejects `Arquivo maior que 20 MB: big.bin`, and nothing is copied;
    - `remove('t1')` deletes the folder, and removing a missing one resolves.
- [ ] **Step 2: Run them and confirm they fail.** `pnpm vitest run --project node tests/unit/core/domain/pr-template.spec.ts tests/unit/infrastructure/environment/json-task-store-service.spec.ts tests/integration/filesystem/node-task-files-service.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `JsonTaskStoreService` (ctor `(files: FileStore, @Inject(USER_DATA_DIR) dir: string)`) keeps an in-memory list after the first read and writes the whole file on every change.
  - `NodeTaskFilesService` (ctor `(@Inject(USER_DATA_DIR) dir: string)`) uses `node:fs/promises`: `stat` before `copyFile`, and `rm -r` with `force`.
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on `src/infrastructure/environment/json-task-store-service.ts,src/infrastructure/filesystem/node-task-files-service.ts`.
- [ ] **Step 5: Commit** `feat: add task records and task folders`.

### Task 5: Git and gh commands for task start

**Files:**
- Modify: `src/core/interfaces/vcs-gateway.ts`, `src/infrastructure/git/git-cli-service.ts`, `src/core/interfaces/pr-gateway.ts`, `src/infrastructure/github/gh-cli-service.ts`
- Test: `tests/integration/git/git-cli-service.spec.ts`, `tests/unit/infrastructure/git/git-cli-service.spec.ts`, `tests/unit/infrastructure/github/gh-cli-service.spec.ts`

**Interfaces:**
- Produces (`VcsGateway`):
  - `defaultBranch(repoPath: string): Promise<string | null>`;
  - `fetch(repoPath: string, branch: string): Promise<void>`;
  - `validBranchName(repoPath: string, name: string): Promise<boolean>`;
  - `branchExists(repoPath: string, name: string): Promise<boolean>`;
  - `addWorktree(input: {repoPath: string; path: string; branch: string; base: string}): Promise<void>`;
  - `ensureIgnored(repoPath: string, entry: string): Promise<void>`.
- Produces (`PrGateway`): `defaultBranch(repoPath: string): Promise<string>`.

- [ ] **Step 1: Write the failing tests.**
  - Integration, on an `mkdtemp` bare `origin` with branch `trunk` and a clone:
    - `defaultBranch` → `'trunk'`; after `git remote set-head origin -d` → `null`;
    - `fetch(clone, 'trunk')` after a new commit on origin moves `origin/trunk`;
    - `validBranchName`: `'feat-x'` true; `'a..b'`, `'-x'` and `'x y'` false;
    - `branchExists`: `'trunk'` true, `'nope'` false;
    - `addWorktree({…, path: <clone>/.worktrees/feat-x, branch: 'feat-x', base: 'origin/trunk'})` → the worktree exists at origin's head, `git -C <wt> rev-parse --abbrev-ref @{u}` fails (no upstream), and the clone's HEAD is unchanged;
    - `ensureIgnored(clone, '.worktrees')` → `/.worktrees/` appended to `.git/info/exclude` once (a second call adds nothing);
    - with `.worktrees/` in `.gitignore` → the exclude file is untouched;
    - a clone without `origin` → `fetch` rejects `Repositório sem remote origin`;
    - an unreachable origin → `fetch` rejects with a message starting `git fetch falhou: `.
  - Unit (fake runner): the exact args.
    - `['fetch', 'origin', 'trunk']` with `timeoutMs: 60_000`;
    - `['worktree', 'add', '--no-track', '-b', 'feat-x', '<path>', 'origin/trunk']` with `30_000`;
    - `['check-ref-format', '--branch', 'feat-x']`;
    - `['show-ref', '--verify', '--quiet', 'refs/heads/feat-x']`;
    - `['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']`, whose stdout `origin/main\n` → `'main'`;
    - `['check-ignore', '-q', '.worktrees']` code 0 → no write.
  - `GhCliService.defaultBranch`:
    - `('gh', ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'], {cwd, timeoutMs: 15_000})` stdout `main\n` → `'main'`;
    - empty stdout or non-zero → rejects `Não foi possível descobrir o branch padrão`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - `fetch` maps git's `'origin' does not appear to be a git repository` to `Repositório sem remote origin`, and other failures to `git fetch falhou: <stderr trimmed>`.
  - `ensureIgnored` writes through `node:fs/promises` `appendFile` on `<git-common-dir>/info/exclude` (from `git rev-parse --git-common-dir`).
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on both service files.
- [ ] **Step 5: Commit** `feat: fetch, validate and create task worktrees with git`.

### Task 6: `TaskService.create` on the new flow

**Files:**
- Modify:
  - `src/core/services/session-naming.ts` (`claudeCommand`, `cleanPrompt`);
  - `src/core/services/session-service.ts` (`launch` options);
  - `src/core/services/task-service.ts`;
  - `src/core/services/queue-service.ts` (`readFly`'s "started without a prompt").
- Test: `tests/unit/core/services/session-naming.spec.ts`, `tests/unit/core/services/session-service.spec.ts`, `tests/unit/core/services/task-service.spec.ts`, `tests/unit/core/services/queue-service.spec.ts`

**Interfaces:**
- Consumes: Task 4 (`TaskStore`, `TaskFiles`, `NewTaskInput`, constants) and Task 5 (gateways).
- Produces:
  - `claudeCommand(input: {sessionId: string; withPrompt?: boolean; promptFile?: boolean; model?: string | null}): string`;
  - `cleanPrompt(text: string): string`;
  - `SessionService.launch(id: string, path: string, extra?: {promptFile?: string; model?: string | null; task?: string}): Promise<string>`;
  - `TaskService.create(input: NewTaskInput): Promise<string>` (the session name); ctor adds `vcs: VcsGateway, prs: PrGateway, files: FileStore, tasks: TaskStore, taskFiles: TaskFiles`.

- [ ] **Step 1: Write the failing tests.**
  - `claudeCommand`:
    - `({sessionId: 'u', promptFile: true, model: 'opus'})` → `claude --dangerously-skip-permissions --session-id u --model opus "$(cat "$FLY_PROMPT_FILE")"; exit`;
    - without a model → no `--model`;
    - `withPrompt` keeps today's `"$FLY_PROMPT"` form.
  - `cleanPrompt('a\u0007b\n\tc\r\n')` → `'ab\n\tc\n'`: `\r` and BEL dropped, and newlines and tabs kept.
  - `launch(..., {promptFile: '/u/tasks/t/prompt.md', model: 'haiku', task: 'Faz X'})` → `launcher.start` with `env: {FLY_PROMPT_FILE: '/u/tasks/t/prompt.md'}` and options `@fly_session_id`, `@fly_worktree: path`, `@fly_task: 'Faz X'`.
  - `TaskService.create` (fakes; workspace with repo `/r`, root `/w`):
    - `Should create the worktree from the fetched default branch and start claude in it`: input `{repoId, description: 'Faz X\ncom exemplo', branch: 'feat-x', model: null, attachments: ['/d/spec.md']}`.
      - Calls, in order: `validBranchName`, `branchExists`, `exists('/r/.worktrees/feat-x')`, `defaultBranch`, `fetch('/r', 'main')`, `addWorktree({repoPath: '/r', path: '/r/.worktrees/feat-x', branch: 'feat-x', base: 'origin/main'})`, `ensureIgnored('/r', '.worktrees')`, `copyIn`, `write(…, 'prompt.md', 'Faz X\ncom exemplo\n\nArquivos anexados:\n- /u/tasks/<id>/attachments/spec.md')`, and `launch` with the worktree's id.
      - The saved record has `phase: 'working'`, `base: 'main'`, `prNumber: null`, `ciAttempts: 0`.
    - `Should fall back to gh for the default branch`: `vcs.defaultBranch` → `null`, `prs.defaultBranch` → `'trunk'`.
    - Each validation of P5 rejects with its message **before** `fetch` is called.
    - `fetch` rejecting `git fetch falhou: offline` → the same rejection, with no `addWorktree`.
    - `Should keep the ship path for a /supera:ship prompt`: description `/supera:ship faz x` → today's `launcher.start` call (repo root, `FLY_PROMPT`, `@fly_task_repo`, `@fly_task_baseline`), and no gateway call.
  - `queue-service.spec.ts`: a fly session with `@fly_task` and no transcript yet reads as `unknown`, not `waiting`. A session with neither `@fly_task` nor `@fly_task_repo` and no transcript reads `waiting` (unchanged).
- [ ] **Step 2: Run them and confirm they fail.** `pnpm vitest run --project node tests/unit/core/services/session-naming.spec.ts tests/unit/core/services/session-service.spec.ts tests/unit/core/services/task-service.spec.ts tests/unit/core/services/queue-service.spec.ts` → FAIL.
- [ ] **Step 3: Implement** per P5.
  - The worktree id is `posix.relative(workspace.root, path)`, the rule `WorkspaceService` uses.
  - The task label is the first 200 code points of the description.
  - `readFly` treats `@fly_task` or `@fly_task_repo` as "started with a prompt".
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on the four files.
- [ ] **Step 5: Commit** `feat: start tasks in their own worktree from the default branch`.

### Task 7: "Nova tarefa" dialog, attachments and wiring

**Files:**
- Create: `src/application/ui/panels/branch-name.ts`
- Modify:
  - `src/core/domain/fly-api.ts` (`tasks.create(input: NewTaskInput)`, `tasks.pickAttachments`);
  - `src/preload.ts`;
  - `src/application/ipc/handlers/session-handler.ts` (`task:create`, `task:pick-attachments`);
  - `src/application/ipc/ipc-types.ts` (`FILE_PICKER`);
  - `src/application/ipc/ipc-module.ts`;
  - `src/application/ui/panels/new-task-dialog.tsx`;
  - `src/application/ui/state/fly-store.ts`;
  - `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`.
- Test: `tests/ui/panels/branch-name.spec.ts`, `tests/ui/panels/new-task-dialog.spec.tsx`, `tests/unit/application/ipc/handlers/session-handler.spec.ts`

**Interfaces:**
- Consumes: `NewTaskInput` (type-only). `application/ui` may import `core/domain` only as types, so `branch-name.ts` keeps its own `MODEL_OPTIONS = ['opus', 'sonnet', 'haiku']` and `BRANCH_SUGGESTION_MAX = 40`, matching Global Constraints.
- Produces:
  - `suggestBranch(description: string): string`;
  - channel `taskPickAttachments: 'task:pick-attachments'` → `Promise<string[]>` (`dialog.showOpenDialog` with `openFile` and `multiSelections`; `[]` when cancelled);
  - the dialog's `onSubmit(input: NewTaskInput)`.

- [ ] **Step 1: Write the failing tests.**
  - `suggestBranch`:
    - `'Adicionar ação de Limpar no PR'` → `'adicionar-acao-de-limpar-no'` (first 5 words, accents stripped, lowercase);
    - `'  ###  '` → `''`;
    - a 60-character single word → its first 40 characters;
    - no leading or trailing `-`.
  - Dialog:
    - **Branch field:** typing the description fills `Branch` with `suggestBranch(description)` until the user edits `Branch` by hand; after that, it is never overwritten.
    - **Model:** `Modelo` offers `Padrão do Claude Code`, `opus`, `sonnet`, `haiku`, and the default submits `model: null`.
    - **Attachments:**
      - dropping two Finder files (`window.fly.attachments.pathForFile`) lists them, each with `Remover`;
      - `Anexar arquivos` adds the paths from `tasks.pickAttachments()`;
      - pasting an image calls `attachments.saveImage` and lists the returned path;
      - submit sends `attachments` in order.
    - **Disabled submit:** with an empty branch, unless the description starts with `/supera:ship `.
    - **Errors:** a create rejection shows its message in the dialog, which stays open.
  - Handler: `task:create` passes the whole input to `TaskService.create`; `task:pick-attachments` returns the picker's paths.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire.** `FILE_PICKER` is `{pick(): Promise<string[]>}`, provided in `ipc-module` with `dialog.showOpenDialog`. The DI spec's electron mock gains it.
- [ ] **Step 4: Run them and confirm they pass.** Then the full gate.
- [ ] **Step 5: Manual check** (PR body, done by the user in the dev app):
  1. "Nova tarefa" with a two-line prompt and an attached `.md` creates `.worktrees/<branch>`, opens `claude` in it, and the first message shows both lines and the attachment path.
  2. The main checkout's branch and files are unchanged.
  3. `git -C <wt> push -u origin <branch>` works later, because the branch has no upstream from `--no-track`.
  4. A `/supera:ship …` prompt still starts ship in the repo root.
- [ ] **Step 6: Commit** `feat: new task dialog with branch, model and attachments`.

### Task 8: Typing into a session, push and PR creation adapters

**Files:**
- Modify:
  - `src/core/interfaces/session-launcher.ts`, `src/infrastructure/tmux/tmux-session-service.ts` (`sendText`);
  - `src/core/services/terminal-service.ts` (`hasDraft`);
  - `src/core/interfaces/vcs-gateway.ts`, `src/infrastructure/git/git-cli-service.ts` (`headSha`, `aheadCount`, `push`);
  - `src/core/interfaces/pr-gateway.ts`, `src/infrastructure/github/gh-cli-service.ts` (`create`).
- Test: `tests/unit/infrastructure/tmux/tmux-session-service.spec.ts`, `tests/integration/tmux/tmux-session-service.spec.ts`, `tests/unit/core/services/terminal-service.spec.ts`, `tests/integration/git/git-cli-service.spec.ts`, `tests/unit/infrastructure/github/gh-cli-service.spec.ts`

**Interfaces:**
- Produces:
  - `SessionLauncher.sendText(name: string, text: string): Promise<void>`;
  - `TerminalService.hasDraft(sessionName: string): boolean`;
  - `VcsGateway.headSha(worktreePath: string): Promise<string>`;
  - `VcsGateway.aheadCount(worktreePath: string, ref: string): Promise<number>`;
  - `VcsGateway.push(worktreePath: string, branch: string): Promise<void>`;
  - `PrGateway.create(input: {cwd: string; title: string; bodyFile: string; base: string; head: string}): Promise<{number: number; url: string}>`.

- [ ] **Step 1: Write the failing tests.**
  - `sendText('fly-a1b2c3', 'fly: x')`:
    - unit: `['send-keys', '-t', '=fly-a1b2c3:', '-l', 'fly: x']`, then `['send-keys', '-t', '=fly-a1b2c3:', 'Enter']`;
    - integration (private socket, fake shell): the recorded line is `fly: x`.
  - `hasDraft`, after `attach('s1', …)` gives a terminal id:
    - `write(id, 'abc')` → true;
    - then `write(id, '\r')` → false;
    - `write(id, 'ab\rcd')` → true;
    - `write(id, 'x\x03')` → false;
    - `write(id, '\x1b[A')` alone leaves the previous value;
    - an unknown session → false;
    - after `detach`, the draft of that session is kept (it is per session, not per terminal).
  - Git integration:
    - `headSha` equals `git rev-parse HEAD`;
    - `aheadCount(wt, 'origin/trunk')` → 0, then 2 after two commits;
    - `push(wt, 'feat-x')` creates `refs/heads/feat-x` on the bare origin and sets the upstream;
    - a rejected push (origin moved, non-fast-forward) rejects `git push falhou: …`.
  - `GhCliService.create`:
    - args `['pr', 'create', '--title', 't', '--body-file', '/u/tasks/t/pr-body.md', '--base', 'main', '--head', 'feat-x']` with `{cwd, timeoutMs: 60_000}`;
    - stdout `https://github.com/o/r/pull/42\n` → `{number: 42, url: 'https://github.com/o/r/pull/42'}`;
    - code 1 with stderr `boom` → rejects `gh pr create falhou: boom`;
    - stdout without `/pull/<n>` → the same failure with the stdout.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
  - `hasDraft` follows P7, kept in a `Map<sessionName, boolean>` fed by `write` (terminal id → session name, recorded at `attach`).
  - `push` runs `['push', '-u', 'origin', branch]` with 60 s.
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on the changed node files.
- [ ] **Step 5: Commit** `feat: type into sessions, track drafts, push and create PRs`.

### Task 9: `LifecycleService` — open the PR

**Files:**
- Create: `src/core/services/task-rules.ts`, `src/core/services/lifecycle-service.ts`
- Modify: `src/core/services/queue-rules.ts` (`worktreeStatus` input `task`), `src/core/services/queue-service.ts` (task view, `canOpenPr`), `src/core/domain/queue.ts`
- Test: `tests/unit/core/services/task-rules.spec.ts`, `tests/unit/core/services/lifecycle-service.spec.ts`, `tests/unit/core/services/queue-rules.spec.ts`, `tests/unit/core/services/queue-service.spec.ts`

**Interfaces:**
- Consumes: Tasks 4–8.
- Produces:
  - `task-rules.ts`: `isConventionalTitle(title: string): boolean`, `prRequest(input: {template: string; prompt: string | null; outFile: string}): string`, `taskStatus(task: TaskRecord | null): QueueStatus | null` (P11);
  - `type TaskView = {phase: TaskPhase; ciAttempts: number; stop: TaskStop | null; review: TaskRecord['review']}` in `queue.ts`;
  - `WorktreeQueue` gains `task: TaskView | null` and `canOpenPr: boolean`;
  - `QueueService` ctor gains `tasks: TaskStore`, and `pullRequestOf` becomes public as `pullRequestFor(worktreeId: string): PullRequest | null`;
  - `LifecycleService` (ctor `(sessions: SessionService, transcripts: TranscriptSource, launcher: SessionLauncher, terminals: TerminalService, vcs: VcsGateway, prs: PrGateway, queue: QueueService, tasks: TaskStore, taskFiles: TaskFiles, ids: IdGenerator)`) with `openPullRequest(worktreeId: string, now?: number): Promise<void>` and `tick(now?: number): Promise<void>`. Task 12 adds `poll`, `rerun` and `resume`; Task 13 adds `merge` and `clean`.

- [ ] **Step 1: Write the failing tests.**
  - **Rules:**
    - `isConventionalTitle`: `feat: add x` and `fix(ui)!: y` are true; `Feat: x`, `feat:x`, `update stuff` and a 73-character `feat: …` are false.
    - `prRequest` contains the out file path, the template verbatim, and `> line1\n> line2` for prompt `line1\nline2`; with `prompt: null` it contains `write Motivation from this conversation`.
    - `taskStatus`: `opening` → `engineer`, `stopped` → `waiting`, `ci` → `null`.
  - **`openPullRequest`** (fakes, `now = 1000`):
    - Each P8 refusal, with its message.
    - `Should ask the idle session to commit and write the PR`:
      - `sendText` with the exact Open instruction (dir = `taskFiles.dir(id)`);
      - `pr-request.md` written;
      - the record `{phase: 'opening', pending: {kind: 'open', sentAt: 1000, headSha}}`;
      - with no record before, the record is created with `base` from the default-branch rule and `promptFile: null`.
  - **`tick`**, with a pending open:
    - `lastTurnEndAt` 900 (≤ sentAt) → nothing happens;
    - `lastTurnEndAt` 1500 runs the P8 checks, one test per stop with its exact message;
    - **success:** `push`, then `pr-body.md` = body, then `create({cwd: wt, title, bodyFile, base: 'main', head: 'feat-x'})`, then the record `{prNumber: 42, phase: 'ci', pending: null, reviewSeenAt: 1500}`;
    - no target while pending → stop `{kind: 'session', message: 'A sessão do worktree foi encerrada'}`.
  - **Queue:**
    - a record with `phase: 'stopped'` and failing checks → status `waiting`, `task.stop.message` set;
    - `opening` with an open PR → `engineer`;
    - `canOpenPr` is true only for a non-main worktree with a branch, no open PR, a fly session, and activity `waiting`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** per P6, P8, P9 and P11. `tick` handles only `pending.kind === 'open'` in this task.
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on `task-rules.ts`, `lifecycle-service.ts`, `queue-rules.ts` and `queue-service.ts`.
- [ ] **Step 5: Commit** `feat: open PRs through the session and push from fly`.

### Task 10: Lifecycle IPC and the PR tab

**Files:**
- Create: `src/application/ipc/handlers/lifecycle-handler.ts`, `src/application/ui/panels/task-section.tsx`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/handlers/queue-handler.ts` (tick calls `lifecycle.tick()` before the snapshot), `src/application/ipc/ipc-module.ts`, `src/main.ts`, `src/application/ui/panels/pr-view.tsx`, `src/application/ui/state/fly-store.ts`, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`
- Test: `tests/unit/application/ipc/handlers/lifecycle-handler.spec.ts`, `tests/unit/application/ipc/handlers/queue-handler.spec.ts`, `tests/ui/panels/task-section.spec.tsx`, `tests/ui/panels/pr-view.spec.tsx`

**Interfaces:**
- Produces:
  - channel `prOpen: 'pr:open'`;
  - `FlyApi.pullRequests.open(worktreeId: string): Promise<void>`;
  - `LifecycleHandler.register()`;
  - `TaskSection({queue, onOpenPr})`. Task 13 adds `onRerun`, `onResume`, `onClean`.

- [ ] **Step 1: Write the failing tests.**
  - **Handler:** `pr:open` calls `openPullRequest` and then triggers a queue tick, and rejections propagate.
  - **QueueHandler:** each tick awaits `lifecycle.tick()` once before `snapshot()`, and a `tick` rejection is logged without stopping the snapshot.
  - **TaskSection:**
    - `canOpenPr` → an enabled `Abrir PR`, which calls `onOpenPr`;
    - `opening` → `Abrindo PR: aguardando a sessão commitar e escrever o PR…` and no button;
    - a stop shows its message in `var(--err)`;
    - a rejection from `onOpenPr` shows its message.
  - **PrView:** renders `TaskSection` above the PR section, and still renders the receipt (it goes away in Task 14).
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire.**
  - `ipc-module` provides `TaskStore`/`JsonTaskStoreService`, `TaskFiles`/`NodeTaskFilesService`, `LifecycleService` and `LifecycleHandler`. `main.ts` registers the handler.
  - The DI spec resolves `LifecycleHandler`.
- [ ] **Step 4: Run them and confirm they pass.** Then the full gate.
- [ ] **Step 5: Manual check** (PR body, done by the user):
  1. On a task worktree whose session is idle, `Abrir PR` types the Open instruction into the terminal, and the session commits and writes `pr.json`.
  2. A PR opens on GitHub with a Conventional title and fly's template, and the worktree turns to CI.
  3. With an uncommitted file left, the PR tab shows `Ficaram mudanças sem commit: …`, and nothing is pushed.
  4. With text typed and not sent in fly's terminal, `Abrir PR` refuses with `Há texto digitado e não enviado na sessão`.
- [ ] **Step 6: Commit** `feat: Abrir PR button and lifecycle state in the PR tab`.

### Task 11: gh data for CI and reviews

**Files:**
- Modify:
  - `src/core/domain/queue.ts` (`PullRequest.headSha`, `PullRequest.behind`, `CheckRun.kind/conclusion/runId/jobId`);
  - `src/infrastructure/github/pr-list-parser.ts`, `src/infrastructure/github/gh-cli-service.ts` (json fields `headRefOid,mergeStateStatus`; `failedLog`, `rerun`, `reviewComments`);
  - `src/core/interfaces/pr-gateway.ts`.
- Create: `src/infrastructure/github/review-comments-parser.ts`
- Test: `tests/unit/infrastructure/github/pr-list-parser.spec.ts`, `tests/unit/infrastructure/github/review-comments-parser.spec.ts`, `tests/unit/infrastructure/github/gh-cli-service.spec.ts`

**Interfaces:**
- Produces:
  - `type ReviewComment = {id: string; author: string; body: string; path: string | null; line: number | null; url: string; createdAt: number}` (`queue.ts`);
  - `PrGateway.failedLog(repoPath: string, jobId: string): Promise<string | null>`;
  - `PrGateway.rerun(repoPath: string, runId: string): Promise<void>`;
  - `PrGateway.reviewComments(repoPath: string, number: number): Promise<ReviewComment[]>`.

- [ ] **Step 1: Write the failing tests.**
  - **Parser:**
    - a CheckRun `{conclusion: 'CANCELLED', detailsUrl: 'https://github.com/o/r/actions/runs/40097015929/job/121586961078'}` → `{kind: 'run', state: 'failing', conclusion: 'CANCELLED', runId: '40097015929', jobId: '121586961078'}`;
    - a StatusContext → `{kind: 'status', conclusion: null, runId: null, jobId: null}`;
    - `headRefOid` → `headSha`;
    - `mergeStateStatus: 'BEHIND'` → `behind: true`, and anything else → false.
  - **`failedLog`:**
    - args `['run', 'view', '--job', '121586961078', '--log-failed']` with `{cwd, timeoutMs: 60_000}`;
    - stdout returned as is;
    - code 1 with `log not found: 121586961078` → `null`;
    - empty stdout → `null`.
  - **`rerun`:** `['run', 'rerun', '40097015929', '--failed']` with 30 s, and a non-zero exit rejects with stderr.
  - **`reviewComments`:**
    - `gh pr view 42 --json reviews,comments` and `gh api repos/{owner}/{repo}/pulls/42/comments` (both 15 s, cwd repo; `{owner}/{repo}` is gh's placeholder);
    - merged and sorted by `createdAt`;
    - review entries map `author.login`, `body`, `submittedAt`, `url`;
    - line comments map `user.login`, `body`, `path`, `line ?? original_line`, `html_url`, `created_at`;
    - invalid JSON on either call → rejects `Resposta inesperada do GitHub`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on the parser files and `gh-cli-service.ts`.
- [ ] **Step 5: Commit** `feat: read check ids, failed-job logs and review comments from gh`.

### Task 12: CI fix loop and review forwarding

**Files:**
- Modify:
  - `src/core/services/task-rules.ts` (`logExcerpt`, `fixInstruction`, `reviewInstruction`, `reviewFile`);
  - `src/core/services/lifecycle-service.ts` (`poll`, `tick` for fix/review, `rerun`, `resume`);
  - `src/application/ipc/handlers/queue-handler.ts` (refresh calls `lifecycle.poll()` after `refreshPullRequests`);
  - `src/application/ipc/handlers/lifecycle-handler.ts` (`pr:rerun`, `pr:resume`).
- Test: `tests/unit/core/services/task-rules.spec.ts`, `tests/unit/core/services/lifecycle-service.spec.ts`, `tests/unit/application/ipc/handlers/queue-handler.spec.ts`, `tests/unit/application/ipc/handlers/lifecycle-handler.spec.ts`, `tests/fixtures/gh/log-failed-steps.txt`, `tests/fixtures/gh/log-failed-unknown-step.txt`

**Interfaces:**
- Produces:
  - `logExcerpt(raw: string): string`;
  - `LifecycleService.poll(now?: number): Promise<void>`;
  - `rerun(worktreeId: string): Promise<void>`;
  - `resume(worktreeId: string): Promise<void>`;
  - channels `prRerun: 'pr:rerun'`, `prResume: 'pr:resume'`;
  - `FlyApi.pullRequests.rerun`/`resume`.

- [ ] **Step 1: Write the fixtures and the failing tests.**
  - **Fixtures:**
    - `log-failed-steps.txt`: 34 lines in the verified shape (job, tab, step, tab, timestamp, BOM on a step's first line, `^[[36;1m`, a tab inside the text, one `##[error]`);
    - `log-failed-unknown-step.txt`: 900 `UNKNOWN STEP` lines with an `##[error]` near line 700 and a tail after it.
  - **`logExcerpt`:**
    - steps fixture: no timestamps, BOM or `^[[…m`; the `##[error]` line kept; the tab inside the text kept;
    - unknown-step fixture: holds the 60 lines before the error and the error, and is ≤ `EXCERPT_MAX_CHARS`;
    - no `##[error]` → the last 200 lines;
    - two errors 10 lines apart → one merged window;
    - an input of 50 000 characters in one window → the last 20 000.
  - **`poll`** (record `ci`, PR 42 open, `headSha: 'abc1234…'`):
    - one FAILURE run with a log → excerpt file `ci-<job>-abc1234.log` and outbox Fix text `… (tentativa 1 de 3). Logs: <path>. …`;
    - only a CANCELLED run, or a FAILURE whose `failedLog` is `null` → stop `infra` `Falha de infraestrutura na CI: <name>`, with `runIds`;
    - a StatusContext failure only → `infra`;
    - `headSha === fixedSha` → nothing;
    - `ciAttempts: 3` with a new SHA → stop `CI falhou 3 vezes; parei de corrigir`;
    - `checks: 'passing'` after a `ci` stop → attempts 0, stop cleared, phase `ci`;
    - `conflicting` → stop `Conflito com main`, and it clears when the PR is mergeable again;
    - `behind` → stop `Branch atrás de main`, and it clears;
    - a record with `prNumber: null` and an open PR for its branch → adopted (`prNumber`, `phase: 'ci'`, `reviewSeenAt: now`);
    - three comments (one with an empty body, one older than `reviewSeenAt`, one from `ana` on `src/a.ts:3` at `1700000000000`) → `review-42-1700000000000.md` with `### ana — src/a.ts:3`, an outbox Review text, `reviewSeenAt: 1700000000000`, and `review: {count: 1, state: 'queued'}`;
    - a pending action → `failedLog`/`reviewComments` are not called;
    - `failedLog` rejecting → no stop, and the next `poll` retries.
  - **`tick` with an outbox:**
    - target busy, or with a draft → not sent, outbox kept;
    - idle → sent once (a second `tick` does not resend), `ciAttempts` 1, `fixedSha` set, phase `fixing`;
    - turn done with a new head and a clean tree → `push`, phase `ci`;
    - the same head → stop `A sessão não commitou uma correção` (fix), or phase `ci` with `review.state: 'done'` (review);
    - dirty → stop with the files.
  - **`rerun`:** calls `prs.rerun` for each `runId` of an `infra` stop, then clears the stop. Without an infra stop → rejects `Nada para rodar de novo`.
  - **`resume`:** clears any stop and `pending`, sets `ciAttempts: 0` and `fixedSha: null`, and sets the phase to `ci` with an open PR, else `working`.
  - **QueueHandler:** refresh calls `poll()` after `refreshPullRequests()`; a `poll` rejection is logged.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement** per P10.
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on `task-rules.ts`, `lifecycle-service.ts` and both handlers.
- [ ] **Step 5: Commit** `feat: send CI failures and review comments to the session`.

### Task 13: Merge with cleanup, "Limpar", and the PR tab buttons

**Files:**
- Create: `src/core/services/cleanup-service.ts`
- Modify:
  - `src/core/interfaces/vcs-gateway.ts`, `src/infrastructure/git/git-cli-service.ts` (`removeWorktree`, `deleteBranch`, `deleteRemoteBranch`);
  - `src/core/services/lifecycle-service.ts` (`merge`, `clean`);
  - `src/application/ipc/handlers/queue-handler.ts` (`pr:merge` → `lifecycle.merge`);
  - `src/application/ipc/handlers/lifecycle-handler.ts` (`pr:clean`);
  - `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`;
  - `src/application/ui/panels/task-section.tsx`, `src/application/ui/panels/pr-view.tsx`.
- Test: `tests/integration/git/git-cli-service.spec.ts`, `tests/unit/core/services/cleanup-service.spec.ts`, `tests/unit/core/services/lifecycle-service.spec.ts`, `tests/ui/panels/task-section.spec.tsx`, `tests/ui/panels/pr-view.spec.tsx`

**Interfaces:**
- Produces:
  - `VcsGateway.removeWorktree(repoPath: string, path: string): Promise<void>`, `deleteBranch(repoPath: string, branch: string): Promise<void>`, `deleteRemoteBranch(repoPath: string, branch: string): Promise<void>`;
  - `CleanupService` (ctor `(sessions: SessionService, launcher: SessionLauncher, vcs: VcsGateway, queue: QueueService, tasks: TaskStore, taskFiles: TaskFiles)`) with `clean(worktreeId: string, options: {confirmed: boolean}): Promise<void>`;
  - `LifecycleService` ctor gains `cleanup: CleanupService`;
  - `LifecycleService.merge(worktreeId: string): Promise<void>`;
  - channel `prClean: 'pr:clean'` (`worktreeId`, `confirmed`);
  - `TaskSection` props `onRerun`, `onResume`, `onClean(confirmed: boolean)`.

- [ ] **Step 1: Write the failing tests.**
  - **Git integration:**
    - `removeWorktree` of a clean worktree removes it;
    - a dirty one rejects with git's message, and the worktree stays;
    - `deleteBranch` after removal deletes the branch;
    - `deleteRemoteBranch` deletes it on the bare origin, and a second call resolves (remote ref already gone).
  - **`CleanupService`:**
    - **Merged PR:** the call order is: `kill` for each mapped session, `removeWorktree`, `deleteBranch`, `deleteRemoteBranch`, `taskFiles.remove(id)`, `tasks.remove(path)`.
    - **Closed PR:** without `confirmed`, rejects `Confirme a limpeza de um PR fechado sem merge` with no calls; with `confirmed`, it runs.
    - **Skipped steps:**
      - a worktree no longer listed skips `removeWorktree`;
      - a missing branch skips `deleteBranch`;
      - a worktree without a record skips the last two.
    - **Failure:** `removeWorktree` rejecting `contains modified or untracked files` → rejects `Falha ao limpar: contains modified or untracked files`, and nothing after it runs.
    - **Refused:** a main worktree, or an open PR → `Worktree não encontrado`.
  - **`merge`:** calls `queue.mergePullRequest`, then `clean(id, {confirmed: true})`. A merge rejection → no cleanup.
  - **TaskSection:**
    - an `infra` stop shows `Rodar de novo`;
    - any stop shows `Retomar`;
    - `Correções de CI: 2 de 3`, and `fixing` → `Corrigindo a CI (tentativa 2 de 3)`;
    - review `queued` → `1 comentários de review novos`; `sent` → `Encaminhando comentários de review…`; `done` → `Comentários encaminhados à sessão`;
    - a merged PR shows `Limpar`;
    - a closed PR's `Limpar` asks `O PR #42 foi fechado sem merge. Apagar o worktree e o branch mesmo assim?` and calls `onClean(true)` only on confirm (inline confirm, like the merge confirm);
    - rejections show their message.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire** per P12. `removeWorktree` runs `['worktree', 'remove', path]` (30 s, cwd repo), `deleteBranch` runs `['branch', '-D', branch]`, and `deleteRemoteBranch` runs `['push', 'origin', '--delete', branch]` (60 s).
- [ ] **Step 4: Run them and confirm they pass.** Then the gate, and Stryker on `cleanup-service.ts`, `lifecycle-service.ts`, `git-cli-service.ts` and both handlers.
- [ ] **Step 5: Commit** `feat: clean up task worktrees on merge and on demand`.

### Task 14: Remove supera's signals

**Files:**
- Delete: `src/infrastructure/supera/receipt-parser.ts`, `tests/unit/infrastructure/supera/`, and the receipt fixtures only those tests use.
- Modify:
  - `src/core/domain/transcript.ts` (drop `Receipt`, `ReceiptResult`, `worktreePath`, `receipt`), `src/core/domain/queue.ts` (`WorktreeQueue.receipt`);
  - `src/infrastructure/claude/transcript-parser.ts` (the engineer call and receipt channels, ship worktree tracking);
  - `src/core/services/queue-rules.ts` (`hasPlan`), `src/core/services/queue-service.ts` (`.supera/plan.md`, `@fly_task_repo` launch cwd, receipt);
  - `src/core/services/task-service.ts` (`bind`, the `/supera:ship` path, `parseBaseline`), `src/core/interfaces/session-launcher.ts` (`@fly_task_repo`, `@fly_task_baseline` from `flyOptions`);
  - `src/core/services/session-naming.ts` (`withPrompt`, `PROMPT_ENV`, `normalizePrompt` if unused);
  - `src/application/ipc/handlers/session-handler.ts` (`bind` calls);
  - `src/application/ui/panels/pr-view.tsx` (the receipt section), `src/application/ui/panels/new-task-dialog.tsx` (the `/supera:ship` branch exception).
- Test: the specs of each modified file

**Interfaces:**
- Consumes: nothing new. `ScheduleWakeup`, `scheduled_task_fire`, `wakeupAt` and `looping` stay.

- [ ] **Step 1: Update the tests first.**
  - Delete the receipt, bind, baseline and `.supera/plan.md` cases.
  - Add `Should not bind a session that enters .worktrees`: a fly session in the main worktree whose transcript `cwd` moves into `/r/.worktrees/x` stays on the main worktree.
  - Add `Should treat a /supera:ship prompt like any prompt`: a worktree is created for it.
  - After Step 3, `rg -n "supera|receipt|plan\.md|fly_task_repo|fly_task_baseline" src` prints nothing.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Remove the code.** `dep:cruise` has no orphan left under `src/infrastructure/supera`, and the folder is gone.
- [ ] **Step 4: Run the full gate.** Then Stryker on every modified node file. `pnpm build` passes.
- [ ] **Step 5: Docs.** In `README.md`, "Nova tarefa" now describes worktree + session + "Abrir PR"; no `/supera:ship`. `CLAUDE.md`'s hard rule is **not** changed (a follow-up).
- [ ] **Step 6: Manual check** (PR body): a `/loop` session still shows as scheduled, and a session started from "Nova tarefa" binds to its worktree from the start.
- [ ] **Step 7: Commit** `refactor: drop supera receipt, plan and ship binding`.

### Task 15: Setup domain, rules and the `setupDone` setting

**Files:**
- Create: `src/core/domain/setup.ts`, `src/core/interfaces/app-runtime.ts`, `src/core/interfaces/toolchain.ts`, `src/core/interfaces/app-installer.ts`, `src/core/services/setup-rules.ts`
- Modify: `src/core/domain/settings.ts`, `src/infrastructure/environment/json-config-store-service.ts`, the store's default `config` in `src/application/ui/state/fly-store.ts`
- Test: `tests/unit/core/services/setup-rules.spec.ts`, `tests/unit/infrastructure/environment/json-config-store-service.spec.ts`, `tests/unit/core/services/settings-service.spec.ts`

**Interfaces:**
- Produces (`setup.ts`):
  - `type ToolId = 'git' | 'gh' | 'tmux' | 'claude'`;
  - `type ToolFix = {kind: 'brew'; formula: string} | {kind: 'copy'; command: string}`;
  - `type ToolCheck = {id: ToolId; ok: boolean; version: string | null; problem: string | null; fix: ToolFix | null}`;
  - `type DoctorReport = {tools: ToolCheck[]; brew: boolean}`;
  - `type CommandState = 'installed' | 'missing' | 'other'`;
  - `type InstallerImage = {imagePath: string; mountPoint: string}`;
  - `type SetupInfo = {packaged: boolean; inApplications: boolean; bundlePath: string | null; open: boolean}`;
  - `type UpdateNotice = {version: string; url: string}`;
  - the distribution constants (except timeouts and `UPDATE_CHECK_MS`).
- Produces (ports):
  - `abstract class AppRuntime {abstract readonly bundlePath: string | null; abstract readonly version: string}`;
  - `abstract class Toolchain {version(tool: ToolId): Promise<string | null>; ghLoggedIn(): Promise<boolean>; hasBrew(): Promise<boolean>; brewInstall(formula: string): Promise<void>}`;
  - `abstract class AppInstaller {commandState(launcher: string): Promise<CommandState>; installCommand(launcher: string): Promise<void>; findInstaller(): Promise<InstallerImage | null>; trashInstaller(image: InstallerImage): Promise<void>}`.
- Produces (rules and setting):
  - `compareVersions(a: string, b: string): number`, `isNewer(candidate: string, current: string): boolean`;
  - `checkTool(id: ToolId, probe: {version: string | null; loggedIn?: boolean}): ToolCheck`, `BREW_TOOLS: readonly ToolId[] = ['git', 'gh', 'tmux']`;
  - `AppConfig.setupDone: boolean` (default `false`).

- [ ] **Step 1: Write the failing tests.**
  - `compareVersions('2.1.310', '2.1.309') > 0`, `('2.1.309', '2.1.309') === 0`, `('3.5a', '3.5') === 0`, `('2.10', '2.9') > 0`, `('1', '1.0.1') < 0`.
  - `isNewer('0.4.0', '0.3.0') === true`; `('0.3.0', '0.3.0')` and `('0.2.9', '0.3.0')` are false.
  - `checkTool`, one case per P14 rule, asserting the full `ToolCheck`:
    - `('tmux', {version: null})` → `{id: 'tmux', ok: false, version: null, problem: 'não encontrado', fix: {kind: 'brew', formula: 'tmux'}}`;
    - `('claude', {version: '2.1.300'})` → `versão 2.1.300; precisa 2.1.309 ou mais`, copy `claude update`;
    - `('gh', {version: '2.92.0', loggedIn: false})` → `não logado`;
    - `('git', {version: '2.54.0'})` → ok;
    - claude missing → copy `npm install -g @anthropic-ai/claude-code`;
    - claude `2.1.309` → ok.
  - Config: `setupDone: true` survives `load`; `'yes'`, `1` and absent → `false`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Fix the UI fixtures that build `AppConfig`.
- [ ] **Step 4: Run them and confirm they pass.** Then Stryker on `setup-rules.ts` and `json-config-store-service.ts`.
- [ ] **Step 5: Commit** `feat: add setup domain, version rules and setupDone setting`.

### Task 16: `ToolchainCliService`

**Files:**
- Create: `src/infrastructure/environment/toolchain-cli-service.ts`
- Test: `tests/unit/infrastructure/environment/toolchain-cli-service.spec.ts`

**Interfaces:**
- Consumes: `Toolchain`, `ToolId` (Task 15), `CommandRunner`.
- Produces: `ToolchainCliService extends Toolchain` (ctor `(runner: CommandRunner)`).

- [ ] **Step 1: Write the failing tests** (fake runner keyed by command and args).
  - **Versions:**
    - `git --version` `git version 2.54.0\n` → `'2.54.0'`;
    - `gh --version` `gh version 2.92.0 (2026-10-01)\n…` → `'2.92.0'`;
    - `tmux -V` `tmux 3.5a\n` → `'3.5a'`;
    - `claude --version` `2.1.310 (Claude Code)\n` → `'2.1.310'`;
    - every call passes `{timeoutMs: 10_000}`.
  - **Missing:** an ENOENT rejection, a non-zero exit, or `no digits here` → `null`.
  - **`ghLoggedIn`:** `gh auth status` 0 → true; 1 → false; a rejection → false.
  - **`hasBrew`:** `brew --version` 0 → true; a rejection → false.
  - **`brewInstall('tmux')`:** `('brew', ['install', 'tmux'], {timeoutMs: 600_000})`. Code 1 with stderr `Error: No formulae found\n` → rejects `brew install tmux falhou: Error: No formulae found`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.** `VERSION_ARGS`: tmux `['-V']`, the others `['--version']`. The version is the first `/\d+(?:\.\d+)+[a-z]?/` match.
- [ ] **Step 4: Run it and confirm it passes.** Then Stryker.
- [ ] **Step 5: Commit** `feat: probe git, gh, tmux and claude and install with brew`.

### Task 17: `MacosInstallerService`

**Files:**
- Create: `src/infrastructure/environment/hdiutil-info-parser.ts`, `src/infrastructure/environment/macos-installer-service.ts`, `tests/fixtures/hdiutil/info-mounted.json`, `tests/fixtures/hdiutil/info-two-images.json`
- Modify: `src/infrastructure/environment/tokens.ts` (`TRASH_ITEM`)
- Test: `tests/unit/infrastructure/environment/hdiutil-info-parser.spec.ts`, `tests/unit/infrastructure/environment/macos-installer-service.spec.ts`

**Interfaces:**
- Consumes: `AppInstaller`, `CommandState`, `InstallerImage`, `COMMAND_LINK` (Task 15), `CommandRunner`, `FileStore`.
- Produces:
  - `TRASH_ITEM = Symbol('TRASH_ITEM')` and `type TrashItem = (path: string) => Promise<void>`;
  - `parseHdiutilInfo(stdout: string): {imagePath: string; mountPoints: string[]}[]`;
  - `MacosInstallerService extends AppInstaller` (ctor `(runner, files, @Inject(TRASH_ITEM) trash)`).

- [ ] **Step 1: Capture the fixture.**
  1. `pnpm build && pnpm dist`;
  2. `hdiutil attach -nobrowse dist/fly-*-arm64.dmg`;
  3. `hdiutil info -plist | plutil -convert json -o - - > tests/fixtures/hdiutil/info-mounted.json`;
  4. detach;
  5. replace the home directory with `/Users/user`.
  Confirm the keys. If they differ, write the parser to what was captured and note it in the PR body. Hand-write `info-two-images.json` with an unrelated image first.
- [ ] **Step 2: Write the failing tests.**
  - **Parser:**
    - the fixture → one image with the `/Volumes/…` mount point;
    - entities without `mount-point` are skipped;
    - `{images: []}` and invalid JSON → `[]`.
  - **`commandState`:** missing → `missing`; same real path → `installed`; different → `other`; `realPath` rejecting → `other`.
  - **`installCommand`:**
    - the exact `osascript` call per P15;
    - `-128` → `Instalação cancelada`;
    - other → `Falha ao instalar o comando: other`;
    - `/A/fl"y` → `Caminho inválido` with no runner call.
  - **`findInstaller`:**
    - `('/bin/sh', ['-c', 'hdiutil info -plist | plutil -convert json -o - -'], {timeoutMs: 15_000})`;
    - the two-image fixture → the second image;
    - no `fly.app` → `null`;
    - code 1 → `null`.
  - **`trashInstaller`:** `hdiutil detach <mp>` (30 s), then `trash(imagePath)`. `busy` → `Falha ao ejetar o instalador: busy` with no trash.
- [ ] **Step 3: Run them and confirm they fail.**
- [ ] **Step 4: Implement** per P15/P16.
- [ ] **Step 5: Run them and confirm they pass.** Then Stryker on both files.
- [ ] **Step 6: Commit** `feat: install the fly command and find the dmg installer`.

### Task 18: `SetupService`

**Files:**
- Create: `src/core/services/setup-service.ts`
- Test: `tests/unit/core/services/setup-service.spec.ts`

**Interfaces:**
- Consumes: Task 15 ports and rules, `SettingsService`.
- Produces: `SetupService` (ctor `(toolchain: Toolchain, installer: AppInstaller, settings: SettingsService, runtime: AppRuntime)`) with:
  - `info(requested: boolean): Promise<SetupInfo>`;
  - `doctor(): Promise<DoctorReport>`, `installTool(id: ToolId): Promise<DoctorReport>`;
  - `commandState(): Promise<CommandState>`, `installCommand(): Promise<CommandState>`;
  - `installer(): Promise<InstallerImage | null>`, `trashInstaller(): Promise<void>`;
  - `complete(): Promise<void>`.

- [ ] **Step 1: Write the failing tests.**
  - **`info`:**
    - packaged at `/Applications/fly.app` with `setupDone: false` → `open: true`;
    - `setupDone: true` → `false`;
    - `info(true)` → `true`;
    - `/Volumes/…` → `inApplications: false`;
    - `bundlePath: null` → all false, even requested.
  - **`doctor`:** git/gh/tmux/claude in order, equal to `checkTool` of each probe; `ghLoggedIn` is not called when gh is missing.
  - **`installTool`:**
    - `installTool('tmux')` → `brewInstall`, then a fresh report;
    - `installTool('claude')` → `Instale o claude pelo comando indicado`;
    - no brew → `Homebrew não encontrado`.
  - **`commandState`/`installCommand`:** use `join(bundlePath, LAUNCHER_IN_BUNDLE)`; with `null` → `Disponível só no app instalado`.
  - **Installer:** `installer` delegates only when packaged; `trashInstaller` re-finds the image.
  - **`complete`:** `settings.update({setupDone: true})`.
- [ ] **Step 2: Run it and confirm it fails.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and confirm it passes.** Then Stryker.
- [ ] **Step 5: Commit** `feat: add setup service for the first-run wizard`.

### Task 19: `SetupHandler`, app menu and wiring

**Files:**
- Create: `src/application/ipc/handlers/setup-handler.ts`, `src/application/ipc/app-menu.ts`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`
- Test: `tests/unit/application/ipc/handlers/setup-handler.spec.ts`, `tests/unit/application/ipc/app-menu.spec.ts`

**Interfaces:**
- Consumes: `SetupService` (Task 18), adapters (Tasks 16–17).
- Produces:
  - channels `setup:info`, `setup:doctor`, `setup:install-tool`, `setup:command-state`, `setup:install-command`, `setup:installer`, `setup:trash-installer`, `setup:complete`, `setup:requested`;
  - `FlyApi.setup: {info; doctor; installTool(id); commandState; installCommand; installer; trashInstaller; complete; onRequested(listener): () => void}`;
  - `SetupHandler.register()`/`request()`, `appMenuTemplate(onSetup: () => void): MenuItemConstructorOptions[]`.

- [ ] **Step 1: Write the failing tests.**
  - **Handler:**
    - each invoke channel delegates with its argument;
    - `setup:info` → `info(false)`, and after `request()` → `info(true)` once;
    - `request()` broadcasts `setup:requested`;
    - rejections propagate.
  - **Menu (P18):** `Configurar fly…` sits between separators after `about` and calls `onSetup`; then the four roles in order; `quit` last.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire.**
  - Providers:
    - `Toolchain`/`ToolchainCliService`, `AppInstaller`/`MacosInstallerService`;
    - `AppRuntime` (`useFactory`: `{bundlePath: app.isPackaged ? resolve(process.execPath, '../../..') : null, version: app.getVersion()}`);
    - `TRASH_ITEM` (`shell.trashItem`);
    - `SetupService`, `SetupHandler`.
  - `main.ts` registers the handler and sets the menu when packaged.
  - The DI mock gains `app.isPackaged`, `app.getVersion`, `shell.trashItem`.
- [ ] **Step 4: Run them and confirm they pass.** Then the full gate and Stryker on both files.
- [ ] **Step 5: Commit** `feat: expose setup over IPC and add the Configurar fly menu`.

### Task 20: Wizard UI and gating

**Files:**
- Create: `src/application/ui/panels/setup-wizard.tsx`, `src/application/ui/panels/setup-steps.tsx`
- Modify: `src/application/ui/state/fly-store.ts` (`setup`, `loadSetup`, `closeSetup`), `src/application/ui/app-shell.tsx`, `README.md`
- Test: `tests/ui/panels/setup-wizard.spec.tsx`, `tests/ui/panels/setup-steps.spec.tsx`, `tests/ui/state/fly-store.spec.tsx`, `tests/ui/app-shell.spec.tsx`

**Interfaces:**
- Consumes: `window.fly.setup` (Task 19).
- Produces:
  - `SetupWizard({info, onDone})`;
  - `type StepResult = 'done' | 'skipped'`;
  - `DependenciesStep({onNext})`, `CommandStep({onNext})`;
  - `DoneStep({results, onFinish}: {results: Record<'tools' | 'command', StepResult>; onFinish(): void})`;
  - store `setup`, `loadSetup`, `closeSetup`.

- [ ] **Step 1: Write the failing tests** (copy exact).
  - **Store:** `bootstrap` loads `setup` before the workspace; a rejection leaves `null`.
  - **AppShell:**
    - `setup.open` renders only the wizard;
    - `onRequested` reloads it;
    - `onDone` shows the welcome screen.
  - **Wizard:**
    - `inApplications: false` → the move screen only;
    - otherwise `Passo 1 de 3` → `Passo 2 de 3` → `Passo 3 de 3`;
    - finish → `complete()`, then `onDone`.
  - **DependenciesStep:**
    - four rows;
    - `Continuar` is disabled until all are ok;
    - `Verificar de novo` re-runs;
    - `Instalar com brew` → `Instalando tmux…` → the new report;
    - without brew → `Homebrew não encontrado`, `Copiar`, and the brew.sh link via `shell.openExternal`;
    - rejections are shown.
  - **CommandStep:**
    - `missing` → explanation + `Instalar e continuar`;
    - `other` → the "será substituído" line;
    - `installed` → `✓ já instalado`;
    - a rejection → message + `Tentar de novo`/`Pular`.
  - **DoneStep:**
    - rows `Dependências`, `Comando fly` with `✓`/`pulado`;
    - the installer line `fly-0.4.0-arm64.dmg em /Users/u/Downloads. O disco é ejetado e o arquivo vai para a Lixeira.`;
    - `Mover para Lixeira` → `trashInstaller` → `onFinish`;
    - `Manter` → `onFinish`;
    - `null` → only `Começar`;
    - a trash rejection keeps both buttons.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** Follow `wizard-flow.html` without its supera step: a centered card on `var(--page)`, the muted uppercase step label, dashed `var(--border)` rows, `var(--ok)`/`var(--err)`, `var(--accent)` buttons.
- [ ] **Step 4: Run them and confirm they pass.** Then the gate.
- [ ] **Step 5: Docs.** README: the wizard checks tools, puts `fly` in `/usr/local/bin` (admin password), and offers to trash the dmg; "Configurar fly…" reopens it.
- [ ] **Step 6: Manual checks** (PR body, on the built dmg):
  1. The first open shows the wizard, then the welcome screen; a restart goes straight to the app.
  2. With `tmux` off the PATH, the row shows ✗ and `Continuar` is disabled.
  3. A cancelled password shows `Instalação cancelada`; "Tentar de novo" installs, and `which fly` → `/usr/local/bin/fly`.
  4. Opening from the mounted dmg shows the move screen.
  5. "Mover para Lixeira" ejects and trashes the dmg.
  6. "Configurar fly…" reopens the wizard, with step 2 showing `✓ já instalado`.
- [ ] **Step 7: Commit** `feat: first-run setup wizard`.

### Task 21: Release check and `UpdateHandler`

**Files:**
- Create: `src/core/interfaces/release-source.ts`, `src/infrastructure/github/gh-release-service.ts`, `src/core/services/update-service.ts`, `src/application/ipc/handlers/update-handler.ts`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`
- Test: `tests/unit/infrastructure/github/gh-release-service.spec.ts`, `tests/unit/core/services/update-service.spec.ts`, `tests/unit/application/ipc/handlers/update-handler.spec.ts`

**Interfaces:**
- Consumes: `isNewer`, `UpdateNotice`, `AppRuntime` (Task 15).
- Produces:
  - `abstract class ReleaseSource {abstract latest(): Promise<{version: string; url: string}>}`, `GhReleaseService`;
  - `UpdateService` (ctor `(releases: ReleaseSource, runtime: AppRuntime)`) with `check(): Promise<UpdateNotice | null>` and `current(): UpdateNotice | null`;
  - `UpdateHandler` `register()`/`start()`/`stop()`;
  - channels `update:get`, `update:changed`;
  - `FlyApi.updates: {get(): Promise<UpdateNotice | null>; onChanged(listener): () => void}`.

- [ ] **Step 1: Write the failing tests.**
  - **`latest`:**
    - `('gh', ['api', 'repos/heronlabs/fly/releases/latest'], {timeoutMs: 15_000})` with the verified JSON → `{version: '0.3.0', url: 'https://github.com/heronlabs/fly/releases/tag/v0.3.0'}`;
    - `HTTP 404` → rejects with it;
    - no string `tag_name`/`html_url` → `Resposta inesperada do GitHub`.
  - **`check`**, with the runtime at `0.3.0`:
    - latest `0.4.0` → the notice;
    - `0.3.0` → `null`;
    - a rejection after a notice keeps it.
  - **Handler** (fake timers):
    - `update:get` → `current()`;
    - `start()` checks at once and broadcasts;
    - after `UPDATE_CHECK_MS`, no broadcast when unchanged and a broadcast on change;
    - the timer survives rejections;
    - `stop()` clears it.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement and wire.** `main.ts` registers, and calls `start()` only when `app.isPackaged`.
- [ ] **Step 4: Run them and confirm they pass.** Then the gate and Stryker on the three node files.
- [ ] **Step 5: Commit** `feat: check for new fly releases`.

### Task 22: Footer notice

**Files:**
- Modify: `src/application/ui/panels/footer-bar.tsx`, `src/application/ui/state/fly-store.ts` (`update`, `applyUpdate`), `src/application/ui/app-shell.tsx`, `README.md`
- Test: `tests/ui/panels/footer-bar.spec.tsx`, `tests/ui/state/fly-store.spec.tsx`, `tests/ui/app-shell.spec.tsx`

**Interfaces:**
- Consumes: `window.fly.updates` (Task 21).
- Produces: `FooterBar` props `update: UpdateNotice | null`, `onDownload(url: string): void`.

- [ ] **Step 1: Write the failing tests.**
  - **Footer:**
    - `{version: '0.4.0', url}` → `fly v0.4.0 disponível` and `Baixar`, right-aligned;
    - `Baixar` → `onDownload(url)`;
    - `null` → nothing;
    - the queue message and the notice render together.
  - **Store:** `bootstrap` reads `updates.get()` (a rejection → `null`); `applyUpdate` sets it.
  - **AppShell:** `onChanged` reaches the footer, and `Baixar` calls `shell.openExternal(url)`.
- [ ] **Step 2: Run them and confirm they fail.**
- [ ] **Step 3: Implement.** The notice uses `var(--accent)`, and `Baixar` is a text button.
- [ ] **Step 4: Run them and confirm they pass.** Then the gate.
- [ ] **Step 5: Docs.** README "Updating": the footer shows `fly vX disponível · Baixar` (checked at start and every 6 h through `gh`).
- [ ] **Step 6: Manual check** (PR body): with the dmg of this release installed, the next release shows the notice within 6 h or on restart, and `Baixar` opens the Release page.
- [ ] **Step 7: Commit** `feat: footer notice for new fly versions`.
