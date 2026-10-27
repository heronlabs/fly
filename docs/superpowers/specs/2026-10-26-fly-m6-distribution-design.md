# fly M6 — Distribution and task lifecycle

Date: 2026-10-26 (distribution approved; task lifecycle added the same day). Milestone 6 of `docs/superpowers/specs/2026-10-19-fly-design.md` (§5.6, §5.8, §6 item 6), amended by this document where they disagree (see "Amendments to the main spec").

M6 has two parts:
- **Distribution:** a dmg, a first-run wizard, the `fly` command, and an update notice.
- **Task lifecycle:** fly takes over what happens before and after a Claude Code session, which today is supera's job: worktree and branch, the PR, and the CI fix loop. supera is retired once fly covers the whole cycle.

## Intent

### Distribution

Today fly runs from a source checkout, and the `fly` command comes from `pnpm cli:install` (a symlink into `~/.local/bin`). The user wants to install fly like any Mac app:
1. download a `.dmg` and drag fly into Applications;
2. open it once and get walked through setup;
3. from then on, have the `fly` command in the terminal, the way VSCode puts `code` on the command line.

After that, fly tells the user when a new version is out.

Success: on a Mac with nothing set up, the user downloads the dmg from the GitHub Release, drags, opens, goes through three wizard screens, and lands on "Abrir pasta". `fly ~/Workfolder` then works in a new terminal tab without touching `.zshrc`.

### Task lifecycle

fly becomes the owner of a task's lifecycle, which happens before and after the session. supera stops being fly's engine.

The user's flow:
1. **Before (fly, in code):**
   - fly creates the branch and its worktree (`.worktrees/<slug>`) from the up-to-date default branch.
   - fly starts `claude` inside that worktree with the user's prompt. The prompt can carry text, examples and specs (attached files).
2. **During:** the model works with whatever plugin the user has enabled: superpowers, none, or another. fly depends on no plugin's commands or formats.
3. **End:** the user clicks "Abrir PR".
   - fly asks the session to commit its work and to write the PR title and body.
   - The deterministic steps are fly's code: checking what is left, push, and `gh pr create`.
4. **CI:**
   - fly follows the checks with the existing `gh` poller.
   - When CI goes red with a failure the code can fix, fly sends the failing job and the relevant log excerpt to the same session to fix it.
   - It repeats until CI is green or a limit is hit. When it stops, the worktree goes to "esperando por mim".
   - With CI green, merging stays the user's action, through the existing merge button.

There are no lanes: every PR follows the same flow. The user reviews sensitive PRs (cloud, IaC, docker, pipelines) personally, but fly does not tell them apart.

**Why.** The lifecycle happens outside the session, and a plugin can act only while the model is in a turn. The current design shows the cost:
- D7 has to follow the transcript until ship creates the worktree, then move the session there.
- pr-watch keeps the model awake with `ScheduleWakeup` only to wait for CI.
- All of D8b exists to interpret that behaviour.

fly already reads transcripts, polls `gh` and writes to tmux. Being plugin-agnostic also lets the user run any plugin in the session.

Success: the user clicks "Nova tarefa", types a prompt, and gets a session already in its own worktree. When the work looks done they click "Abrir PR" and, unless CI or a review needs them, next see the worktree as "pronto para merge". One click on "Fazer merge" merges and removes the worktree and its branches. No `/supera:*` command is involved.

## Goals

### Distribution

1. CD builds a `.dmg` on every release and attaches it to that tag's GitHub Release.
2. A first-run wizard of three steps (dependencies; `fly` command; done + delete installer) that ends on the existing welcome screen.
3. The packaged app installs the `fly` command into `/usr/local/bin/fly`, and it works from the bundle.
4. A footer notice when a newer fly release exists, linking to the release page. Updating is manual: drag the new dmg over the old app.

### Task lifecycle

5. "Nova tarefa" creates the branch and worktree from the up-to-date default branch and starts `claude` there with the prompt. The prompt carries text and attachments, and the model can be picked per task.
6. An "Abrir PR" button: the session commits and writes the title and body in fly's PR template, then fly pushes and runs `gh pr create`.
7. A CI loop for the PRs of task worktrees:
   - fixable failures go to the same session, at most 3 attempts per PR;
   - infrastructure failures and conflicts only notify, with a "Rodar de novo" button for the former;
   - when the loop stops, the worktree goes to "esperando por mim".
8. New review comments on those PRs are shown and forwarded to the session. A branch behind its base is only shown.
9. "Fazer merge" merges and then cleans up: session, worktree, local and remote branch, task folder. A "Limpar" button does the cleanup alone.
10. Queue state with no supera signals: no `supera-engineer` receipt, no `.supera/plan.md`, no binding of a ship session to the worktree it creates. `ScheduleWakeup` and `/loop` stay recognised, because they are Claude Code's, not supera's.

## Non-goals

- Code signing and notarization (there is no Apple Developer account). The build stays unsigned. Real auto-update (`electron-updater`, which requires a signed app) is a later upgrade.
- Self-updating fly (downloading and swapping the app bundle). Updating fly is manual.
- Intel (x64) builds.
- Uninstalling the `fly` command or the app from inside fly.
- Changing the dev commands. `pnpm dev` and `pnpm cli:install` stay as they are for working from source; only their data folder moves to `fly-dev`.
- Flipping `heronlabs/fly` to public. The user may do it (`gh repo edit heronlabs/fly --visibility public --accept-visibility-change-consequences`); nothing in this design depends on it.
- Opening the PR automatically when a turn ends. The button is the only trigger.
- Choosing plugins per task. The session uses what is enabled in Claude Code.
- Different flows for sensitive PRs.
- Automating PRs of worktrees without a task record, such as worktrees from before M6 or made by hand. They keep today's view, without the CI loop or review forwarding; "Fazer merge" and "Limpar" still clean them up.
- Rebasing, or force-pushing, a branch that is behind its base.
- Replying to review comments on GitHub. fly forwards them to the session; the session decides.
- Removing supera from the user's machine, archiving its repo, or rewriting the `CLAUDE.md` hard rules. These are follow-ups.

## Anti-goals

- Editing `.zshrc`, `.zprofile` or any shell file. The `fly` command must work through the default macOS `PATH` alone.
- Installing `claude` for the user. This is unchanged from the main spec: fly shows the npm command and never runs it.
- Touching a supera the user installed (any marketplace, any `--plugin-dir`). fly no longer installs, updates or reads supera at all.
- A wizard that reappears on every launch or blocks the app after the first run.
- Depending on a plugin's commands, files or output formats. If a plugin changes, fly must not break.
- Typing into a session while it is in a turn, while it waits on a question, or on top of text the user typed in fly's terminal and has not sent. Any of these would cut into the user's own conversation.
- Cleaning up a worktree that has uncommitted changes, or a task whose PR was closed without merge, without the user's confirmation.
- Pushing, or opening a PR, with uncommitted work left behind.
- Merging. Merging is always the user's click.
- A chat UI that hides what Claude Code does. fly's requests to the session are typed into the terminal, where the user sees them.

## Constraints

- Every existing repo rule holds:
  - layer rules (`pnpm dep:cruise`);
  - 100% coverage;
  - 100% Stryker on the `node` project;
  - kebab-case files with role suffixes;
  - the renderer talks only through `window.fly`.
- Tests never run:
  - a real `gh`, `claude`, `brew`, `osascript` or `hdiutil`;
  - `git` against the user's repos;
  - `tmux` on the default server.
- Tests never touch the real `~/.claude`, `~/Library/Application Support/fly`, `…/fly-dev` or `/usr/local/bin`.
- New external commands go through `CommandRunner` or the existing gateways (`VcsGateway`, `PrGateway`, `SessionLauncher`) and are mocked. Examples: `git fetch`, `git worktree add`, `git push`, `gh pr create`, the failed-job log, `gh run rerun`, `tmux send-keys` into a live session.
- `version.txt` is never edited by hand. CD's `action-tag-release@v7` with `bumpNpm: true` already keeps `package.json` `version` in step with the tag, and electron-builder reads that.
- PR titles follow Conventional Commits. The CD computes the version bump from the merge commit, whose message is the PR title.
- `cli.ts` never reaches `electron`. The CLI keeps running on Electron in Node mode (`ELECTRON_RUN_AS_NODE`), now also from inside the packaged bundle. The `RunAsNode` Electron fuse must stay enabled in the packaged build.
- The packaged app's Electron userData stays `~/Library/Application Support/fly` (`productName` "fly"), the path `cli.ts` hardcodes today. Dev builds move to `fly-dev` (see "What the user decided").
- `node-pty` is a native module, so the packaged build must load it: asar unpacking of its `.node` file and `spawn-helper`.
- CD's build job runs on a GitHub-hosted macOS runner (`macos-latest`, arm64), as the main spec's D12 already says; the release job stays on `ubuntu-24.04`. A `TODO(fly M6)` in `.github/workflows/continuous-deployment.yml` marks the spot.
- The CI loop runs only while fly is open. A closed app pauses it, and the loop picks up again from the GitHub state at the next start.
- UI strings are in Portuguese, like the rest of the app. Docs stay in English.
- **Transition:** supera keeps working until fly covers the cycle. M6's own PRs still go through `/supera:ship`, the current hard rule of `CLAUDE.md`, because fly cannot build itself before it exists.

## What the user decided

### Distribution

- **Install shape:** a standard dmg, drag to Applications, then a wizard inside fly on first open. The wizard tells the user `fly` also goes to the command line.
- **Wizard screens** (validated on mockups, `.superpowers/brainstorm/`; the supera step was dropped when the lifecycle moved into fly):
  1. *Verificando o que o fly precisa*:
     - one row per dependency (`git`, `gh` logged in, `tmux`, `claude`), with ✓ and the version, or ✗ and what is missing;
     - a missing `brew`-installable tool shows its `brew install …` command and an "Instalar com brew" button;
     - "Verificar de novo" re-runs the checks.
  2. *Comando `fly` no terminal*: explains that `fly` goes to `/usr/local/bin/fly`, pointing into the app, with no `.zshrc` change, and that macOS will ask for the admin password. Button: "Instalar e continuar".
  3. *Tudo pronto*:
     - a summary (dependencies ✓, comando fly ✓);
     - "Apagar o instalador?", naming the dmg. "Mover para Lixeira" ejects the mounted volume and moves the dmg to the Trash; "Manter" leaves it.
  Then the existing welcome screen ("Abrir pasta").
- **Updates:** no signing for now.
  - fly checks the latest GitHub Release. When it is newer than the running version, fly shows `fly v<x.y.z> disponível · Baixar` **in the footer, right side** (mockup option B).
  - "Baixar" opens the release page in the browser.
  - Updating = download the dmg and drag it over the old app.
  - The check covers fly only.
- **Dev and installed fly side by side:**
  - Dev builds use their own userData, `~/Library/Application Support/fly-dev`, set before the single-instance lock is taken. Dev builds means `!app.isPackaged`: `pnpm dev`, and the checkout Electron that the dev `fly` opens.
  - So dev has its own lock, config, recent folders, wizard state and task records. `pnpm dev` runs while the installed fly is open, and an older build in some worktree can never rewrite the installed app's `config.json`.
  - The dev CLI (`bin/fly` from the checkout, linked by `pnpm cli:install`) reads and hands folders to `fly-dev`; the packaged launcher uses `fly`.
  - Accepted cost: dev and installed do not share recent folders.
  - Dev builds never show the wizard on their own.
- **Back into the wizard:**
  - The wizard opens automatically only on the first run of the installed app.
  - Afterwards, a menu item **"Configurar fly…"** in the app menu reopens it on demand, from step 1. That is where a skipped `fly` command or a removed dependency gets fixed.
  - The app never reopens the wizard by itself. This supersedes the mockup's subtitle "e depois de atualizar, se algo mudou".

### Task lifecycle

- **Ownership:** fly owns the lifecycle; supera is retired when fly covers it. This reverses the main spec's non-goal "Replacing supera" and its anti-goal against reimplementing ship's worktree, commit, push and PR logic.
- **One flow for every PR.** No lanes, and no special handling for sensitive repos.
- **Opening the PR:** only the "Abrir PR" button starts it. A turn ending with changes does not.
- **Commits:**
  - During the session, the model, or its plugin, commits however it likes.
  - At "Abrir PR", fly asks **the session** to commit what is pending. fly never commits on its own.
- **PR title and body:**
  - The model of the same session writes them, at fly's request.
  - The body always uses **fly's own template**, the same `.github/PULL_REQUEST_TEMPLATE.md` that fly's repo uses for its features. Every repo gets it, and a repo's own template is ignored.
  - The title follows Conventional Commits.
- **CI failures:**
  - **Sent to the session to fix:** a job that concluded `failure` and has a failed-step log (lint, test, typecheck, build, Stryker).
  - **Notify only**, worktree to "esperando por mim":
    - infrastructure failures: runner not acquired, `cancelled`, no steps, a billing refusal. These come with a "Rodar de novo" button (`gh run rerun --failed`);
    - a conflict with the base branch.
  - **Limit:** 3 fix attempts per PR, as in supera. The counter resets when CI goes green.
- **Review comments:** fly shows new review comments in the PR tab and forwards them to the session, the same way it forwards CI failures.
- **After the merge:**
  - "Fazer merge" merges and, when the merge succeeds, cleans up in the same click.
  - A separate "Limpar" button does the cleanup alone, for a PR merged on GitHub or a cleanup that stopped halfway.
- **Removing supera's signals:**
  - The receipt, `.supera/plan.md` and the binding of ship sessions go away at the end of the lifecycle work, as the last step of the CI PR, not in the task-start PR. M6's own PRs still run through `/supera:ship`, and their sessions keep showing correctly until then.
  - `ScheduleWakeup` and `/loop` stay recognised: they are Claude Code features, and dropping them would misreport any session that uses `/loop`.
- **Model and plugins:**
  - The "Nova tarefa" dialog has an optional model selector. The default is Claude Code's own configuration; any other choice becomes `claude --model <x>`.
  - Plugins are whatever Claude Code has enabled; fly offers no choice.
- **Order of M6 PRs** (approved):
  1. docs;
  2. packaging;
  3. task start;
  4. open PR;
  5. CI fix, which also takes the review comments, the cleanup and the removal of supera's signals;
  6. setup wizard;
  7. update notice.
  Each PR goes through `/supera:ship` and starts after the previous one is merged.

## Calls made by the assistant (not discussed; the user can override)

### Distribution

- **Location of the command:**
  - `/usr/local/bin/fly`, a symlink to a launcher script inside the bundle.
  - It is created with admin rights through `osascript … with administrator privileges`, which is what VSCode's "Install 'code' command in PATH" does.
  - `mkdir -p /usr/local/bin` runs first, since the directory is absent on fresh Apple Silicon Macs.
  - An existing `/usr/local/bin/fly` is replaced.
- **Password cancelled or install failed:** step 2 shows the failure with "Tentar de novo" and "Pular". Skipping is allowed, and the wizard still completes.
- **Launcher in the bundle:**
  - A packaged variant of `bin/fly` ships as an extra resource (e.g. `Contents/Resources/bin/fly`).
  - It runs `Contents/MacOS/fly` with `ELECTRON_RUN_AS_NODE=1` on the CLI entry inside the app, like VSCode's `Contents/Resources/app/bin/code`.
  - The symlink-chain resolution of today's `bin/fly` carries over.
- **`fly <pasta>` from the packaged CLI:**
  - Today `CliHandler` opens the app by spawning `execPath appDir <pasta>`: the checkout's Electron with the checkout dir.
  - From the bundle, `appDir` is meaningless. The packaged CLI must launch the bundle's app with the folder (spawn `Contents/MacOS/fly <pasta>`, or `open -a` with `--args`), and the single-instance hand-off must keep working.
- **Wizard gating:** step 1's "Continuar" is enabled only when all four dependencies are ✓.
- **Dependency fixes:**
  - `git`, `gh`, `tmux` get "Instalar com brew", which runs `brew install <x>` and then re-checks.
  - `gh` installed but not logged in shows `gh auth login` to run in a terminal. It is interactive, so fly does not run it.
  - `claude` missing shows `npm install -g @anthropic-ai/claude-code` with a copy button.
  - `brew` itself missing: the row shows the command and a link to brew.sh, with no button.
- **App not in /Applications:**
  - When fly runs from the dmg volume (`/Volumes/…`) or from any path other than `/Applications/fly.app`, the wizard shows only "Arraste o fly para Aplicativos e abra de lá" instead of the steps.
  - The reason: a `fly` symlink into a mounted volume would break on eject.
- **Finding the installer:**
  - Through `hdiutil info -plist`: the mounted image whose volume contains a `fly.app`. Its `image-path` is the dmg to trash.
  - If none is found (already ejected), step 3 omits the "Apagar o instalador?" block.
- **First-run flag:**
  - Completion is stored in the app's config store (`json-config-store`), and later launches go straight to the app.
  - Reaching step 3 counts as completion, even with steps skipped.
- **Menu item only in packaged builds.** In dev, "Configurar fly…" is absent: step 2 would point `/usr/local/bin/fly` at a checkout, and the `/Applications` check would always fail.
- **How the dev/packaged split reaches `cli.ts`:** left to the builder, as long as both paths are testable with an injected user-data dir. For example, the launcher passes the data folder, or `cli.ts` derives it from whether it runs inside a `.app` bundle.
- **Update check:**
  - Runs on launch and every 6 h while the app runs.
  - `gh api repos/heronlabs/fly/releases/latest` works whether the repo is private or public, and the doctor already guarantees `gh` is logged in.
  - Compare `tag_name` (strip `v`) with `app.getVersion()` by semver.
  - Any failure (offline, gh error) is silent: no notice, and a retry on the next tick.
- **Minimum `claude` version:**
  - The doctor's `claude` row shows ✗ with "atualize o Claude Code" below **2.1.309**.
  - That is the oldest version whose transcript shape fly was checked against: PR #20's fixtures, and the 2026-10-26 checks on 2.1.310 of `turn_duration`, the message queue and `--model`.
  - The earlier 2.1.287 floor came from the `claude plugin … --json` commands, which fly no longer runs.
- **Release existence:** `action-tag-release@v7` creates the GitHub Release for the tag, so the `dmg` job only uploads to it. Checked: `v0.3.0` is a Release whose tag points at the bump commit, with `package.json` 0.3.0.
- **Build:**
  - electron-builder, `mac.target: dmg`, `arch: arm64`, the default dmg window with the Applications shortcut, `appId` `com.heronlabs.fly`, `productName` `fly`.
  - Signing: unsigned, but ad-hoc signed so the bundle launches on Apple Silicon after the user clears quarantine.
  - Artifact name: `fly-<version>-arm64.dmg`.
- **CD:** a `dmg` job after `release` (`needs: release`), on `macos-latest`:
  1. checkout at the new tag;
  2. `pnpm install`;
  3. `pnpm build`;
  4. `pnpm dist --publish never`;
  5. `gh release upload <tag> dist/*.dmg`.
- **Docs:**
  - README's install section switches to the dmg flow.
  - The from-source flow (`pnpm dev`, `pnpm cli:install`) moves under a development heading. It notes two things:
    - `~/.local/bin` usually precedes `/usr/local/bin` in `PATH`, so a dev link wins over the installed one;
    - dev keeps its data (recent folders, config) in `fly-dev`, apart from the installed app.
  - The quarantine step is documented. After each new download, macOS blocks the first open; allow it in Ajustes > Privacidade e Segurança > "Abrir mesmo assim", or with `xattr -dr com.apple.quarantine /Applications/fly.app`. Right-click > Open no longer bypasses Gatekeeper since macOS 15.

### Task lifecycle

- **Branch name:**
  - The "Nova tarefa" dialog gets a "Branch" field, prefilled from the first words of the description, which the user can edit. The prefill is lowercase ASCII with accents stripped, other characters turned into `-`, and at most 40 characters.
  - The worktree goes to `<repo>/.worktrees/<branch>`.
  - The dialog refuses three cases: a name `git check-ref-format --branch` rejects, an existing local branch, and an existing path.
- **Default branch:**
  - Read with `git symbolic-ref --short refs/remotes/origin/HEAD` (minus `origin/`).
  - When that ref is unset, fall back to `gh repo view --json defaultBranchRef`.
  - It is stored with the task as the PR base.
- **Creating the worktree:**
  1. `git fetch origin <default>`;
  2. `git worktree add --no-track -b <branch> <path> origin/<default>`. `--no-track` matters: without it the branch tracks `origin/<default>`, and a plain `git push` fails.
  3. If `.worktrees/` is not ignored (`git check-ignore`), fly adds `/.worktrees/` to the repo's `.git/info/exclude`. That file is local and never committed.
  A repo without an `origin` remote, or a failed fetch, stops the dialog with the error, and nothing is created.
- **Prompt delivery:**
  - The prompt is written to a file in the task's folder.
  - The session starts with `claude … --session-id <uuid> [--model <x>] "$(cat "$FLY_PROMPT_FILE")"`.
  - This keeps newlines and lifts today's 2000-character limit, which came from tmux's command size; the new cap is 100 000 characters.
  - Control characters other than newline and tab are dropped.
- **Attachments:**
  - Files dragged into the dialog or picked with "Anexar arquivos", and images pasted with ⌘V, are copied into the task's folder.
  - The prompt ends with their absolute paths.
  - Copies live outside the worktree, so they are never committed. Files over 20 MB are refused.
- **Task folder and record:**
  - Each task has a folder `<userData>/tasks/<task id>/` holding the prompt, attachments, fly's request files and CI excerpts.
  - It also has a record in `<userData>/tasks.json`, keyed by worktree path. The record holds: repo, worktree, branch, base, model, PR number, phase, CI attempts, the last head SHA a fix was sent for, the timestamp of the newest review comment forwarded, and the stop reason.
  - Dev and installed keep separate records, because the folders differ.
- **Session for the task:**
  - Started directly in the worktree (cwd = worktree, `@fly_worktree` set at start). The bind step of D7 goes away.
  - Claude Code's trust check for a worktree uses the main checkout's root, so a repo the user already trusts shows no dialog. Otherwise the dialog appears in the terminal, and the user answers it there.
  - **A dead session is replaced, not resumed.** The lifecycle talks to the newest live fly-started session on the task's worktree, whichever it is. After a reboot or a killed tmux, the user starts a session on the worktree with the existing button, and the task carries on with it. The record keeps no session id for this purpose. A CI fix sent to a fresh session still works, because the instruction names the log files.
- **Talking to a live session:**
  - fly types a single-line instruction with `tmux send-keys -l`, then a separate `Enter`.
  - Anything long (the PR instructions, CI excerpts) goes into a file in the task folder, which the instruction names by absolute path.
  - fly never pastes, because Claude Code marks pasted text as untrusted.
  - fly sends only when the session is idle: the transcript's last turn has ended (`system/turn_duration`), no `AskUserQuestion` is open, and no background agent is running. Otherwise fly waits.
  - fly also waits while the user has a draft. A draft means printable keys typed into that session through fly's own terminal with no Enter or Ctrl+C since. fly sees those keys on `terminal:input`. A draft typed from Termius is invisible to fly; that risk is accepted.
  - A Stop hook passed with `--settings` was considered and rejected. The transcript already gives the signal, and the hook would need a settings file per session.
- **"Abrir PR":**
  - Where it appears: in the PR tab of a worktree that has no open PR, is not the main checkout, and has a live fly-started session. It is enabled when that session is idle and has no draft.
  - This covers any such worktree, not only those made by "Nova tarefa". When the worktree has no task record, the click creates one: the base comes from the default-branch rule, and there is no original prompt. In that case the request asks the model to write Motivation from the conversation.
  - Steps:
    1. fly types: `fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em <pasta>/pr-request.md`.
    2. That file asks the model to write `<pasta>/pr.json` with `{title, body}`, filling fly's template and quoting the original task prompt under Motivation. The text is in English.
    3. fly waits for the turn to end.
    4. A dirty worktree stops the flow and lists the files left.
    5. So do a branch with no commits ahead of `origin/<base>`, a missing or invalid `pr.json`, and a title that is not Conventional Commits.
    6. Otherwise fly runs `git push -u origin <branch>`, then `gh pr create --title … --body-file … --base <base> --head <branch>`, and records the PR number.
  - The request goes through the live session rather than through `claude -p --resume … --fork-session`. The live session already has the context and the tools, and the user sees the request in the terminal. The fork path was not verified on a session live in tmux, it runs the user's hooks, and it starts in manual permission mode.
- **CI loop:**
  - Runs on the existing 30 s PR poll, for the open PR of any worktree with a task record. That includes a PR the session's plugin opened by itself, which the task adopts.
  - Each failing check is classified:
    - **fixable:** a CheckRun with conclusion `FAILURE` whose `gh run view --job <id> --log-failed` returns a log;
    - **infrastructure:** everything else. That covers `CANCELLED`, `TIMED_OUT`, `STARTUP_FAILURE`, `ACTION_REQUIRED`, `STALE`, a failed StatusContext, and "log not found", as billing refusals produce.
    - The job and run ids come from the check's URL.
  - When any fixable check failed on a head SHA no fix was sent for, and the session is idle:
    1. fly writes one excerpt file per job;
    2. fly types `fly: a CI do PR #<n> falhou (tentativa <k> de 3). Logs: <arquivos>. Corrija, rode as verificações locais e commite (Conventional Commits, sem push).`;
    3. after the turn, it pushes the new commits.
  - When the loop stops, the worktree goes to "esperando por mim" with the reason. The reasons:
    - no new commit;
    - a dirty worktree;
    - a dead session;
    - the third failed attempt;
    - an infrastructure-only failure;
    - a conflict.
  - The stop clears in three ways: CI going green; "Retomar", which resets the counter and goes back to watching; or, for a stop while opening the PR, clicking "Abrir PR" again.
  - "Rodar de novo" runs `gh run rerun <run id> --failed` for each distinct run.
- **Log excerpt:**
  - Each `gh` line is `<job>\t<step>\t<timestamp> <text>`. Split on the first two tabs only, drop the timestamp, and strip the BOM and ANSI codes (real and literal `^[[`).
  - Keep up to 60 lines before each `##[error]` line, merging overlapping windows; without any `##[error]`, keep the last 200 lines.
  - Cap at 20 000 characters, keeping the tail.
  - The reason: when `gh` cannot map steps, `--log-failed` returns the whole job log (132 KB for a Stryker job).
- **Review comments:**
  - Read on the same PR poll:
    - review bodies and PR conversation comments from `gh pr view <n> --json reviews,comments`;
    - line comments from `gh api repos/{owner}/{repo}/pulls/<n>/comments`.
  - "New" means created after the newest comment already forwarded, which the record keeps as a timestamp. Empty review bodies are skipped.
  - The PR tab shows `<k> comentários de review novos`.
  - When the session is idle with no draft:
    1. fly writes them to `review-<n>.md` in the task folder: author, `path:line` when there is one, the text, and the link;
    2. fly types `fly: há comentários de review novos no PR #<n> em <arquivo>. Avalie cada um, corrija o que fizer sentido e commite (Conventional Commits, sem push).`;
    3. after the turn, it pushes as it does after a CI fix.
  - A turn that ends with no new commit is not a stop. The model may have judged the comments need no change; the PR tab still shows them as forwarded.
  - There is no attempt limit, because comments come from people. Each comment is forwarded once.
- **Branch behind its base:**
  - Detected from `mergeStateStatus: BEHIND` in `gh pr list`.
  - The worktree goes to "esperando por mim" with `Branch atrás de <base>`, and fly does nothing else. This was proposed in the conversation and the user did not object.
- **Cleanup** ("Fazer merge" after a successful merge, or "Limpar"), in order, each step skipped when already done:
  1. kill the worktree's tmux sessions;
  2. `git worktree remove <path>`, without `--force`. A dirty worktree stops here with git's message;
  3. `git branch -D <branch>`, run only once the PR is merged or the user confirmed;
  4. `git push origin --delete <branch>`. A remote branch that is already gone counts as done;
  5. remove the task folder and the record.
  - A failure stops the sequence, shows the message, and leaves "Limpar" to retry.
  - "Limpar" appears on worktrees whose PR is merged or closed. For a closed, unmerged PR it asks first: `O PR #<n> foi fechado sem merge. Apagar o worktree e o branch mesmo assim?`.
  - The local default branch is not touched; the next task fetches it anyway.
- **Queue state:**
  - Gone, as the last step of the CI PR: the receipt, `.supera/plan.md`, and the transcript's tracking of a ship session moving into `.worktrees/<slug>` (D7's bind).
  - `ScheduleWakeup` and `/loop` handling stays.
  - The lifecycle overrides the PR status:
    - opening the PR, fixing CI or handling review comments → "engineer";
    - stopped → "esperando por mim", even with failing checks.
  - The PR tab replaces the receipt with the lifecycle:
    - the phase;
    - `Correções de CI: <k> de 3`;
    - the stop reason;
    - the review notice;
    - the "Abrir PR", "Rodar de novo", "Retomar" and "Limpar" buttons.
- **`/supera:ship` during the transition:**
  - From the task-start PR until the last step of the CI PR, a "Nova tarefa" prompt that starts with `/supera:ship ` keeps today's path: a session in the repo root and the bind step, with no worktree created by fly. This is how M6's own remaining PRs are started from fly.
  - That last step removes this rule together with the bind. After it, the remaining M6 PRs (wizard, update notice) start `/supera:ship` from a session on the main worktree, where it shows. Accepted, since fly covers the cycle by then.

## Left to the builder

- Module and service names, and IPC channel names, for the wizard, doctor, CLI install, update notice and lifecycle. Also how the renderer decides between wizard and app.
- Wizard and PR-tab visuals beyond the mockups (fly's design tokens apply).
- How the packaged/dev difference (`app.isPackaged`, paths of launcher and CLI entry) is injected so both stay testable.
- electron-builder config location (`package.json` `build` key or `electron-builder.yml`) and the `asarUnpack` details for `node-pty`.
- The version comparison helper (a dependency or a small function).
- The exact wording of `pr-request.md`, within the rules above.

## Amendments to the main spec (2026-10-19-fly-design.md)

The plan edits these lines in the main spec to point here.

- **§1 Intent, Goals 4–5, Non-goals, Anti-goals:**
  - "Nova tarefa" no longer runs `/supera:ship`.
  - "Replacing supera" is no longer a non-goal.
  - "Reimplementing ship's worktree, commit, push or PR logic … supera wins" is reversed.
- **D5 / §8 D5:** "no fly CLI and no PATH registration in v1" is superseded: the CLI exists (PR #23), and the packaged app registers it in `/usr/local/bin`.
- **D6 and §5.6:** superseded. fly neither vendors nor installs supera, and depends on no plugin.
- **D7 and §5.3:** "Nova tarefa = session + ship" is superseded by the lifecycle above.
- **D8, D8a, D8b and §5.4:** the queue reads neither the receipt nor `.supera/plan.md`, and no longer binds ship sessions. `ScheduleWakeup` and `/loop` stay recognised. Task sessions start in their worktree, and the lifecycle phase overrides the PR status.
- **D12:** "user right-clicks Open" is replaced by the Privacy & Security / `xattr` step.
- **§5.2 layout:** `infrastructure/supera/` and `plugin-installer-service.ts` go away.
- **§5.8:** first run no longer installs a plugin. "Updates: manual download in v1" now includes the footer notice.
- **§6 item 6:** M6 is distribution plus the task lifecycle.
- **§7 risk "Initial prompt argument with a slash command":** no longer applies.

## Follow-ups outside this milestone

- Archive `heronlabs/supera` once fly covers the cycle (the user's action).
- Replace the hard rule "ALWAYS use `/supera:ship`" in fly's `CLAUDE.md`/`CONTRIBUTING.md`, and in the heronlabs repos' `CLAUDE.md`, with fly's flow.
- The first fly task done by fly itself.
- **Repo visibility:** the user's call, any time.
- **Signing + notarization + `electron-updater`:** when an Apple Developer account exists.
