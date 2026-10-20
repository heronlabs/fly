# fly — Claude Code transcript spike

Read-only spike for milestone 3 (spec D7, D8, D8a, D8b, §5.3, §5.4, §5.6, §7). It pins down what the transcript parser must handle, measured on the user's real `~/.claude/projects` and the supera source (v2.2.0, `ai/supera`).

**Corpus.** 256 main session files and 602 subagent files (plus 602 `.meta.json`) in 53 project dirs: 428,756 lines, 1.7 GB. Claude Code versions 2.1.278 to 2.1.304 (23 versions, all 2.1.x). Timestamps run from 2026-09-19 to 2026-10-20. The corpus begins almost exactly 30 days before today, which looks like Claude Code's transcript retention, though that is not confirmed. There are 0 malformed lines. Counts below cover main files unless marked "subagent". Every example line is synthetic: the values are invented and only the shape is real.

**Not covered.** Older formats (1.x/2.0, e.g. `summary` or `progress` lines) do not occur, so they are not observed. supera's version per session is not recorded (`attributionPlugin` is just `"supera"`).

## 1. Layout

- **Encoding.** Project dir = launch cwd with every char outside `[A-Za-z0-9]` replaced by `-`. 255/256 files: the first line's `cwd` encodes exactly to the dir name. Examples: `/.worktrees/` becomes `--worktrees-`, `/.github` becomes `--github`, `/private/tmp/claude-501/-Users-…` becomes `-private-tmp-claude-501--Users-…`. The longest dir name is 143 chars, and truncation or hashing of long paths is not observed. No project path contains `_`, a space, `@` or `+`. Those chars appear only in later in-session cwds, so the rule for them is not observed (assume the same regex).
- **The exception (1 file).** The session was launched inside a worktree but its file sits in the repo root's dir, with `relocated {relocatedCwd}` and `worktree-state {worktreeSession:{originalCwd, worktreePath, worktreeName, worktreeBranch, enteredExisting}}` lines. Both line types appear only in 2.1.278–2.1.287 and only with the `EnterWorktree` tool (2 uses total, 0 in ship sessions).
- **Sessions started inside a worktree** get their own dir, e.g. `…-<repo>--worktrees-<slug>`. 4 such dirs exist.
- **Contents of a project dir:**
  - `<uuid>.jsonl`: the main transcript.
  - `<uuid>/subagents/agent-<agentId>.jsonl` plus `agent-<agentId>.meta.json`: one per Agent call. Meta keys are `agentType` (= subagent_type), `description`, `toolUseId` (= the parent's Agent `tool_use.id`), `spawnDepth`, `requestShape` (`background` 290 / `foreground` 4), `requestNonInteractive`, and optionally `model`, `finished`, `stoppedByUser`, `launchedWithDefaults`, `parentAgentId`.
  - `<uuid>/tool-results/`: spilled large outputs. These are `hook-<uuid>-N-additionalContext.txt` (69), `toolu_<id>.txt|json` (6) and MCP image blobs (7).
  - `memory/`: auto-memory, not transcripts.
- **Subagent lines** always have `isSidechain: true`, with `sessionId` = the parent uuid and `agentId` = the id in the filename (602/602). Main files never contain sidechain lines (157,654/157,654 are `isSidechain: false`).
- **`--session-id <uuid>`** is not directly observed. `sessionId` equals the filename in 256/256 files, and `claude --help` says "Use a specific session ID for the conversation". So `X` is inferred to write `X.jsonl` in the dir of the launch cwd.
- **`--resume`** is not observed: 0 `SessionStart:resume` hook entries among 1,196 SessionStart attachments. `--help` says resume continues "under the same ID", which implies appending to the same file, while `--fork-session` creates a new ID.
- **`/clear` starts a NEW file.** 39 files begin with `SessionStart:clear` hooks. In 32 of them the `/clear` command line is the new file's first user line.
  - The new file has a new uuid (`sessionId` = its filename). From roughly line 20 onward its lines carry snake_case `session_id` = the **original launch uuid**.
  - The link always points back to the original, never to the previous file: 9 originals have 2 successors and 1 has 3.
  - 7 files on ≤2.1.289 lack `session_id`.
  - **The old file gets no `/clear` marker.** Its tail is whatever came last: a turn_duration, an away_summary or another local command.
  - In the new file, the first lines (the SessionStart:clear hooks and the `/clear` command) carry no `session_id`. The field first appears on the attachments written with the next prompt, before the first assistant line (32/32).
- **Compaction stays in the same file.** There are 43 `system/compact_boundary` lines (22 manual, 21 auto) in 35 files, see §4.

## 2. Line envelope

Top-level `type` counts (main files; subagent counts in brackets):

| type | count | notes |
|---|---|---|
| attachment | 96,026 [121,690] | `attachment.type`: hook_success 62,984 (hookEvent PreToolUse/PostToolUse/Stop/SessionStart), total_tokens_reminder, deferred_tools_*, hook_additional_context, environment, queued_command 361, task_status 17, … |
| assistant | 33,112 [45,423] | §3 |
| user | 21,146 [25,707] | prompts, tool results, notifications, meta |
| last-prompt | 8,977 | `{lastPrompt, leafUuid, sessionId}`, no uuid/timestamp |
| atis-latch / mode / permission-mode | 8,796 / 8,781 / 7,769 | session settings snapshots, re-emitted often |
| api-request-blob / api-request / api-request-shape | 7,181 / 3,648 / 90 [9,224 / 5,115 / 157] | only on ≥2.1.300; bulky (lines up to 1.8 MB) |
| system | 7,085 | §4 |
| ai-title | 6,252 | |
| queue-operation | 4,329 | `operation` enqueue/dequeue/remove: prompts typed while busy |
| pr-link | 4,156 | `{prNumber, prUrl, prRepository, timestamp}`, a free PR hint |
| file-history-snapshot / -delta | 2,132 / 486 | |
| frame-link, bridge-session, cost-state, worktree-state, agent-setting, relocated, artifact-* | < 330 each | |

- **Conversational lines** (user/assistant/system/attachment) always carry `uuid, parentUuid, isSidechain, sessionId, cwd, gitBranch, timestamp, version, userType, entrypoint`.
- **Frequent extras:** `session_id` (§1), `slug`, `requestId` (assistant), `promptId`, `sourceToolAssistantUUID` and `toolUseResult` (tool results), `isMeta`, `turnOrigin`, `promptSource`, `origin`, `turnPosition {promptIndex, turnIndex}`.
- **Metadata lines** (last-prompt, mode, …) have no uuid and often no timestamp.
- **Ordering.** Line order is chain order, but 27,493 of 170,792 timestamps are earlier than the previous line's timestamp. **Use file order. Never sort by timestamp.** `parentUuid` never dangles (0 lines).
- **Version drift (2.1.278–304) is additive only.** Each core shape is present in at least 21 of 23 versions (the low-volume versions explain the gaps): `type/uuid/parentUuid/message`, tool_use/tool_result blocks, `turn_duration`, `stop_hook_summary`, `scheduled_task_fire` and `turnOrigin`. Fields new within the range:
  - `api-request*` ≥2.1.300
  - `turnPosition` ≥2.1.284
  - `permissionDecision` ≥2.1.293
  - `requestedModel` ≥2.1.295
  - `thinkingDisplay` ≥2.1.296
  - `origin.kind: "peer"` 2.1.280–302
  - `interruptedMessageId` ≤2.1.296
  - `worktree-state` / `relocated` ≤2.1.287

## 3. Assistant lines

- **One content block per line**, always (78,650/78,650 incl. subagent). Block types: tool_use 41,146 `{id, name, input}`, thinking 25,678, text 9,701, server_tool_use 1,094, advisor_tool_result 1,031.
- **One API message spans N lines that share `message.id`.** Distribution: 1 line 11,687; 2 lines 20,893; 3 lines 5,308; 4 lines 945; up to ≥10. Parallel tool calls are separate lines with one tool_use each.
- **`message.stop_reason`:** tool_use 45,117, null 28,780, end_turn 4,722, stop_sequence 31. Within a split message it may be on every line, only on the last, or on none (~4,200 messages have null on all lines). **stop_reason is a hint, not a turn-end signal.**
- **API errors:** `isApiErrorMessage: true`, `message.model: "<synthetic>"`, `stop_reason: "stop_sequence"`, `error: "rate_limit"` (`apiErrorStatus` 429, 20 cases) or `"server_error"` (1).
- **Tool names seen:** Bash 32,344, Read, Edit, Write, ScheduleWakeup 714, **Agent 619 (no `Task` in this range)**, Skill, SendMessage 234, ToolSearch, AskUserQuestion 156, SubagentHandback 155 (subagent only), Monitor 27, TaskStop, EnterWorktree 2, plus `mcp__*`.

## 4. Tool results, interrupts, errors, meta, system

- **Tool results.** The user line's `message.content` is a one-element array: `{type:"tool_result", tool_use_id, content, is_error?}`, never several per line. `content` is a string (38,404) or an array of `text|image|tool_reference`.
- **`toolUseResult`** sits at the top level and depends on the tool. It is an object normally and a plain string on errors (e.g. `"Error: …"`). Bash: `{stdout, stderr, interrupted, isImage, noOutputExpected[, backgroundTaskId, backgroundCwdHint]}`.
- **`is_error: true`** is most common on Bash (1,188 cases).
- **Interrupts.** A user line with a text block `[Request interrupted by user]` (17) or `[Request interrupted by user for tool use]` (10), often with `interruptedMessageId`. 25/27 are followed by **no** turn_duration.
- **Compaction.** `system/compact_boundary {parentUuid:null, logicalParentUuid, compactMetadata:{trigger:"auto"|"manual", preTokens, …}}`, then a user line with `isCompactSummary: true, isVisibleInTranscriptOnly: true`.
- **Local (built-in) commands**, e.g. `/clear` and `/model`, write three lines:
  1. user `isMeta: true` (`<local-command-caveat>`)
  2. user string `<command-name>/x</command-name><command-message>…<command-args>…`
  3. `system/local_command {content:"<local-command-stdout>…", level:"info"}`

  Skill commands (`/supera:ship`, `/supera:pr-watch`) write the `<command-name>` user line and then an assistant turn, with **no** `system/local_command`.
- **Prompt origin.** User lines carry `turnOrigin`: human 1,489, task_notification 789, scheduled 549, peer 177, sdk 6, system 3, auto_continuation 2. They also carry `promptSource` (typed 1,256, system, queued, suggestion_accepted, sdk) and `origin.kind` (human, task-notification, peer, coordinator, auto-continuation).
- **System subtypes:**

| subtype | count | fields |
|---|---|---|
| turn_duration | 2,972 | `durationMs, messageCount, isMeta`, `pendingBackgroundAgentCount` (only present when >0) |
| stop_hook_summary | 2,915 | `hookCount, hookInfos, hookErrors, preventedContinuation, stopReason, toolUseID, level:"suggestion"` |
| scheduled_task_fire | 548 | §7 |
| away_summary | 468 | `content` (recap while user away) |
| local_command | 102 | above |
| informational | 46 | `content, level:"notice"`, e.g. "Usage limit reached · continuing automatically at …" (9), "Compacted while idle…" (21) |
| compact_boundary / bridge_status / agents_killed | 43 / 6 / 6 | |

## 5. Turn end

- **`system/turn_duration` is the turn-end marker.** It follows `system/stop_hook_summary` and is written once per finished turn. What directly precedes it:
  - assistant `text`/end_turn: 2,865
  - a ScheduleWakeup tool_result: 84 (a turn can end on the wakeup call with no closing text)
  - an API-error line: 21
  - an interrupt: 2
- **What follows an assistant end_turn text:** `stop_hook_summary` and then `turn_duration` in ~2,830/2,860 cases. Only after that do the next human prompt, task-notification, scheduled fire or away_summary appear.
- **`stop_hook_summary` alone is not an end.** In ~19 cases a Stop hook injected more work and a user line plus assistant work followed with no turn_duration.
- **Pending tool_use** = a `tool_use.id` with no later tool_result whose `tool_use_id` matches. No turn_duration is written while one is open. Exception: tools that return immediately (async Agent, background Bash) close at once.
- **Live test on this session's own file** while a Bash call ran:
  - The assistant `thinking` + `tool_use` lines appear a few ms after the tool starts. One early sample still showed the previous tool_result and api-request lines as the tail.
  - The PreToolUse/PostToolUse `hook_success` attachments are written **with the result**, after completion.
- **Long calls.** During a long Bash call the tail is `assistant tool_use(Bash)`. During a long Agent call nothing is added to the main file: Agent calls come back `async_launched` immediately (§8), and progress goes only to `subagents/agent-<id>.jsonl`. No `progress` lines are observed.

## 6. AskUserQuestion

- **Calls.** Tool name `AskUserQuestion`: 156 calls, all in main sessions (0 in subagents).
- **Input.** `{questions:[{question, header, multiSelect, options:[{label, description[, preview]}]}]}`.
- **Unanswered:** the last conversational line is the assistant tool_use. Between it and the answer only metadata lines appear (last-prompt, mode, permission-mode, atis-latch, ai-title, pr-link, api-request*). **No turn_duration** is written.
- **Answered:** a user tool_result with `toolUseResult {questions, answers, annotations}` (149). The content wording varies ("Your questions have been answered: …" / "The user answered: …").
- **Declined:** `is_error: true`, with `toolUseResult` the string `"Error: The user doesn't want to proceed with this tool use…"` (5) or `"User rejected tool use"` (1).
- **Answer latency:** median 145 s, max 15.7 h.

## 7. ScheduleWakeup, /loop, background notifications

- **Calls.** Tool name `ScheduleWakeup`: 715 calls. Input is `{delaySeconds, prompt, reason, noop}` (657) or `{stop: true}` (58).
- **Result content:** `"Next wakeup scheduled for HH:MM:SS (in Ns)…"` or `"Loop stopped — …"`.
- **`toolUseResult`:** `{scheduledFor: <epoch ms>, clampedDelaySeconds, wasClamped}`. A stop adds `stopped: true, cancelledWakeups: 0|1`.
- **Fire line:** `system/scheduled_task_fire` with these fields:
  - `taskId`: 8 hex, unique per fire
  - `cron`: one-shot `"M H * * *"` in local time
  - `prompt`: the loop prompt
  - `taskKind` / `cronKind`: `"loop"`
  - `content`: `"Claude resuming /loop wakeup (…)"`
  - after noop ticks: `noOpStreak, streakStartedAt, foldedUuids`

  Next comes a user line with `turnOrigin: "scheduled", scheduledTaskId, scheduledFireId` whose content is the prompt (e.g. a `/supera:pr-watch … --tick N` command line). All 548 fires are `/loop` dynamic mode (prompts `/supera:pr-watch`, `/pr-watch` or free text). CronCreate is never used.
- **Fire time ≈ `scheduledFor`.** The difference is ≤2 s in 450/481 matched fires. 31 fires were 2 s to 17 min late (machine asleep or session busy), and 14 were up to 52 s early.
- **Single slot.** A stop cancels at most 1 wakeup, and a new ScheduleWakeup replaces the pending one (163 superseded wakeups never fired). Outcomes: 481 fired (26 of them after a human turn in between), 58 stopped, 12 still pending at file end, and 1 overdue that never fired because its process ended.
- **Wakeups survive human turns.** 26 fired after a human prompt in between. No fire ever followed a stop result.
- **Fallback heartbeat (observed, not documented, not reliable).** 62 fires had no ScheduleWakeup result since the previous fire. Their gap from the preceding turn_duration clusters at 1,200–1,253 s (47/62); 60/62 fall within 1,500 s. So a looping session whose turn ends without rescheduling *sometimes* gets a ~20 min fire.
  - It is not guaranteed. Of fired turns that ended without rescheduling, 48 got a fallback fire, while 22 saw no fire for more than 40 min until the human came back.
  - pr-watch's normal exit ("list empty, exit without rescheduling") calls no `stop`, so the end of a loop is often silent. The mechanism is unconfirmed.
- **Background completions** arrive as a user line with string content `<task-notification>…</task-notification>`, `turnOrigin: "task_notification"` and `origin {kind:"task-notification"[, producer:"session-task", runId]}`.
  - Tags: `task-id`, `tool-use-id` (the launching tool_use), `output-file`, `status` (completed 722 / failed 10 / killed 4), `summary`, and optionally `note`, `result`, `usage{subagent_tokens, tool_uses, duration_ms}`.
  - Monitor events use `<event>` and have a `<task-id>` but no `<tool-use-id>` and no status (39). Monitor completions carry both ids plus a status (15).
  - Background Bash results carry `toolUseResult.backgroundTaskId` (478). 111 notifications for such shells arrived while a pure D8b rule would have said "waiting"; these were pr-watch's `gh pr checks --watch` watcher.

## 8. Agent tool and the receipt

- **Calls.** Tool name `Agent` (619). Input `{description, prompt, subagent_type[, model, run_in_background, name]}`; `isolation` is never set.
- **`subagent_type` values:** general-purpose 300, **supera:supera-engineer 294**, Explore 21, plus 4 singletons.
- **The receipt is almost never in the Agent tool_result.** `toolUseResult.status` is `async_launched` in 597 cases, 533 of them **without** `run_in_background`. The other statuses are `teammate_spawned` 17 (calls with `name`) and `completed` 5.
- **The async result** is `{agentId, description, prompt, status, isAsync, outputFile, canReadOutputFile, resolvedModel[, canContinueAgent]}` with content text.
- **Outstanding agents at a turn end** are counted in `turn_duration.pendingBackgroundAgentCount`.
- **Receipt channels**, per engineer Agent tool_use id:
  - **(a) Task notification:** the `<result>` of the `<task-notification>` whose `<tool-use-id>` = the id. 210 such notifications: 189 hold a valid receipt in the last ```json fence, 14 have an invalid fence, 7 have no JSON. 197 `<result>` bodies contain HTML entities (`&quot;` …), and parsing raw vs unescaped never changed validity. **Parse raw.**
  - **(b) Peer hand-back:** the engineer called `SubagentHandback({message})`. The parent gets a user line with `turnOrigin:"peer"` and `origin {kind:"peer", handback:true, senderTaskId:<agentId>, from, body[, handbackReportText]}`, content `"Another Claude session sent a message:\n<agent-message from=…>…"`. `senderTaskId` = the async `agentId` in 130/130.
  - **(c) Sync result:** the `status:"completed"` tool_result content (2 valid of 4).
  - **(d) Subagent file:** `subagents/agent-<agentId>.jsonl` (linked by meta `toolUseId`). The receipt is the last `SubagentHandback` input, else the last assistant text block. Over 294 engineer subagents: last text valid 212, hand-back valid 60 (1 both), none 23. 34 engineer runs left no notification or hand-back in the parent at all, so (d) is the only source for them.
- **Schema** (`schema/receipt.schema.json`): `required: ["summary", "filesChanged", "verification"]`, `additionalProperties: false`.
  - `summary`: string, minLength 1
  - `filesChanged`: string[]
  - `verification`: object whose values are in enum `pass|fail|skipped`
  - `notes`: optional string

  The fence rule from `hooks/validate-receipt.sh`: the last ```json fence (fences open on a ``` line of any language and close on a bare ```), else the whole message if it is a bare JSON object.
- **Invalid receipts:** prose in verification values (`"pass - pnpm build …"`, 12) and extra keys (3). All 23 invalid or missing receipts are from before 2026-10-07, when supera's SubagentStop validator (`e24ee51`, v2.2.0) landed. Since then: 83/83 valid.
- **Background agents** (`run_in_background: true`, 64) have the same result shape and completion path.

## 9. Ship sessions started at the repo root

- **Counts.** 109 main files contain a `/supera:ship` command line. 101 of the root-launched ones later show `cwd` = `<root>/.worktrees/<slug>`.
- **`cwd` follows the Bash tool's persistent working dir.** It flips on the **tool_result line** of the Bash call running `create-worktree.sh … && cd "$WT" && pwd`, and on that call's PostToolUse attachments.
  - The file stays in the root's project dir, so the known path never moves.
  - `toolUseResult.stdout` of create-worktree.sh ends with the worktree path in 66/72 runs.
- **Transitions in root-launched sessions:** root→worktree 391, worktree→worktree 463, worktree→root 357 (pr-watch `cd "$REPO_ROOT"`, cleanup), plus subdirs (node_modules, …).
- **`gitBranch` lags.** It equals the slug on the first worktree line in only 32/101 sessions, lags up to 170 lines, and never catches up in 3. **Do not use it.**
- **25/101 ship sessions touch 2–4 slugs** (side PRs, multi-PR pr-watch).
- **Linking fields.** `EnterWorktree` and `worktree-state` are never used by ship. The only reliable link is `cwd`; the create-worktree stdout and `git worktree list` (D7) can confirm it.

## 10. Write behavior

- **Append-only JSONL**, one object per `\n`-terminated line. At rest: 0 malformed lines and 0 files without a trailing newline.
- **Live poll** of this session's file: 94,883 polls in 240 s and 40 growth events. **0 partial last lines** were seen, the file never shrank, and the largest single append was 22.6 KB. Partial visibility of MB-sized lines was not tested.
- **Line sizes:** median 774 B, p99 29 KB. The largest are an api-request-blob of 1.8 MB and a user tool_result of 1.4 MB.
- **File sizes:** main files median 1.4 MB, p90 5.5 MB, max 28.7 MB; subagent max 54 MB.
- **Growth** averaged over each session's span: median 15.8 KB/min, p90 111 KB/min, max 578 KB/min. The busiest minute had 167 timestamped lines.

## 11. `.supera/plan.md`

- **Who and where.** Written by **supera-engineer**, the subagent (`agents/supera-engineer.md` step 2): `mkdir -p .supera`, then `.supera/plan.md` in the **worktree root**, i.e. `<root>/.worktrees/<slug>/.supera/plan.md`. It has sections `## Steps`, `## Files` and `## Out of scope`. All 29 Write/Edit calls on it in the corpus use that path; the rest go through Bash heredocs.
- **When.** After ship has created the worktree and dispatched the engineer (ship step 4). It is rewritten by every later engineer dispatch (ship retries, pr-watch fixes). Ship reads `## Files` at step 4a.
- **Removal.** supera never deletes it. `.supera/` goes into `info/exclude` (`exclude-supera.sh`) and is never committed. The file disappears only when pr-watch `cleanup.sh` runs `git worktree remove --force` after merge. ship also writes `.supera/pr-template.md` (step 7).
- **Meaning.** "plan.md present" = the engineer started at least once, and it stays true until cleanup.

## Parser contract

**Input.**
- Read the main file `<dir>/<uuid>.jsonl` in byte order and keep an offset.
- Parse only `\n`-terminated lines; keep the trailing remainder for the next read.
- On a JSON parse failure, skip the line and count it. Ignore unknown `type`s and unknown fields.
- Never sort by timestamp.

**File resolution.**
- **F1.** dir = `encode(launchCwd)` = launchCwd with each `[^A-Za-z0-9]` replaced by `-`. File = `<dir>/<sessionId>.jsonl`. It may not exist yet until the first prompt is written.
- **F2. Successor after `/clear`.** The trigger is any new `*.jsonl` appearing in the dir (fs.watch). The old file carries no `/clear` marker, so nothing in it can trigger the switch.
  - On the trigger, re-read the new file's head until it finds a `session_id` field. If it equals the launch uuid, switch to that file. Successors all point to the launch uuid, so a later `/clear` is matched the same way.
  - Until the new file's first prompt lands, it has no `session_id`. The user has just run `/clear` and is at the keyboard, so the old file's "waiting-for-me" is the correct state for that window.
  - If no successor is found and the old file is stale, fall back to D8a best-effort.

**Reducer state.**
- `open`: Map<tool_use_id, toolName>. Each assistant `tool_use` adds an entry; each user `tool_result.tool_use_id` deletes one.
- `last`: one of `prompt | toolResult | assistant | turnEnd | interrupt | localCommand | none`.
- `wakeup`: `{scheduledFor}` or null. On a ScheduleWakeup result: if `toolUseResult.stopped`, set null and `loop = false`. Otherwise set `scheduledFor` and `loop = true`. On `scheduled_task_fire`: set null, `loop = true`, `last = prompt`.
- `bgAgents` = the latest `turn_duration.pendingBackgroundAgentCount ?? 0` (also 0 on `system/agents_killed`).
- `bgShells`: Set<tool_use_id>. Add when a tool_result has `toolUseResult.backgroundTaskId` (Bash) or `taskId` (Monitor). Delete when a `<task-notification>` that has a `<status>` matches by `<tool-use-id>` or by `<task-id>` (= `backgroundTaskId` / `taskId`). Monitor `<event>` lines have no status and do not delete.
- `lastTurnEndAt`: the timestamp of the last turn_duration.

**Line to event mapping.**
- `assistant` → `last = assistant`.
- `user` with a tool_result → `toolResult`.
- `user` with a text block starting `[Request interrupted by user` → `interrupt`, and clear `open`.
- `user` with `isMeta`, `isCompactSummary` or `isVisibleInTranscriptOnly` → no change.
- Any other `user` → `prompt`. This covers typed prompts, `<command-name>` lines, task-notifications, peer messages and scheduled prompts.
- `system/turn_duration` → `turnEnd`.
- `system/local_command` → `localCommand`.
- `system/stop_hook_summary`, `compact_boundary`, `away_summary`, `informational`, `bridge_status`, `attachment` and all metadata types → no change.

**Classification at time `now`** (`G` = 20 min grace, chosen because the max observed fire lateness is 17 min):
1. `last == none` → **unknown**.
2. `open` contains an `AskUserQuestion` → **waiting-for-me**.
3. `last ∈ {prompt, toolResult, assistant}` → **agent-running** (mid-turn).
4. `last ∈ {turnEnd, interrupt, localCommand}`:
   - a. `wakeup` set: if `now ≤ scheduledFor + G` → **agent-running** (scheduled at `scheduledFor`), else → **unknown** (stale).
   - b. `loop` and no `wakeup`: if `now ≤ lastTurnEndAt + 1500 s` → **agent-running** (possible fallback fire; 60/62 observed fall in this window). Otherwise, clear `loop` and continue with c/d. Loops often end silently (§7).
   - c. `bgAgents > 0` or `bgShells` non-empty → **agent-running**. Background shells are an extension of D8b: the agent will resume by itself.
   - d. Otherwise → **waiting-for-me**. This includes API-error turns and interrupts.
5. A dead tmux session overrides all of the above (idle, §5.4); the parser does not decide it.

**Receipt (engineer).**
- **Select calls:** assistant tool_use with `name ∈ {"Agent","Task"}` and `input.subagent_type == "supera:supera-engineer"`.
- **Find the text**, first hit wins:
  1. A tool_result with `toolUseResult.status == "completed"`: its content text.
  2. A `<task-notification>` with `<tool-use-id>` = the id: the raw inner text of `<result>`.
  3. A user line with `origin.handback && origin.senderTaskId == agentId` (`agentId` from the async result).
  4. `subagents/agent-<agentId>.jsonl` (meta `toolUseId` == the id): the last SubagentHandback `input.message`, else the last assistant text block.
- **Extract** the last ```json fence, else the whole text if it is a JSON object.
- **Validate** against the schema. Invalid → `{kind: "invalid", problems}`; never throw. A new engineer call for the same worktree replaces the previous receipt.

**Worktree binding.**
- `root` = the first `cwd` in the file (= the launch cwd).
- The first line whose `cwd` starts with `root + "/.worktrees/"` binds: `slug` = the next path segment. Track `currentSlug` from the latest such line.
- Ignore `gitBranch`. Confirm the slug against `git worktree list --porcelain`.

### Fixtures (synthetic, one JSON object per line)

Common to all: `S` = session uuid `11111111-1111-4111-8111-111111111111`, root `/Users/u/w/repo`. Fields not needed by a rule are omitted.

T1 turn ended, nothing pending → waiting-for-me
```jsonl
{"type":"assistant","uuid":"a1","parentUuid":"u1","isSidechain":false,"sessionId":"S","cwd":"/Users/u/w/repo","timestamp":"2026-10-20T10:00:04.000Z","message":{"id":"msg_1","role":"assistant","content":[{"type":"text","text":"Done."}],"stop_reason":"end_turn"}}
{"type":"system","subtype":"stop_hook_summary","uuid":"s1","parentUuid":"a1","timestamp":"2026-10-20T10:00:04.100Z","hookCount":1,"preventedContinuation":false,"level":"suggestion"}
{"type":"system","subtype":"turn_duration","uuid":"s2","parentUuid":"s1","timestamp":"2026-10-20T10:00:04.200Z","durationMs":4200,"messageCount":5,"isMeta":false}
```
T2 pending AskUserQuestion, metadata after → waiting-for-me; then T2b answer → agent-running
```jsonl
{"type":"assistant","uuid":"a2","parentUuid":"u1","message":{"id":"msg_2","role":"assistant","content":[{"type":"tool_use","id":"toolu_ask1","name":"AskUserQuestion","input":{"questions":[{"question":"Which base?","header":"Base","multiSelect":false,"options":[{"label":"main","description":"default"},{"label":"dev","description":"other"}]}]}}],"stop_reason":"tool_use"}}
{"type":"last-prompt","lastPrompt":"x","leafUuid":"a2","sessionId":"S"}
```
```jsonl
{"type":"user","uuid":"u2","parentUuid":"a2","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_ask1","content":"Your questions have been answered: \"Which base?\"=\"main\"."}]},"toolUseResult":{"questions":[],"answers":{"Which base?":"main"},"annotations":{}}}
```
T3 long Bash in flight → agent-running
```jsonl
{"type":"assistant","uuid":"a3","parentUuid":"u2","message":{"id":"msg_3","role":"assistant","content":[{"type":"tool_use","id":"toolu_b1","name":"Bash","input":{"command":"pnpm test"}}],"stop_reason":"tool_use"}}
```
T4 wakeup scheduled, turn ended → agent-running until 10:20:05Z + G; unknown after
```jsonl
{"type":"assistant","uuid":"a4","parentUuid":"u3","message":{"id":"msg_4","role":"assistant","content":[{"type":"tool_use","id":"toolu_w1","name":"ScheduleWakeup","input":{"delaySeconds":1200,"prompt":"/supera:pr-watch 7 --tick 1","reason":"CI running","noop":false}}],"stop_reason":"tool_use"}}
{"type":"user","uuid":"u4","parentUuid":"a4","timestamp":"2026-10-20T10:00:05.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_w1","content":"Next wakeup scheduled for 07:20:05 (in 1200s)."}]},"toolUseResult":{"scheduledFor":1792491605000,"clampedDelaySeconds":1200,"wasClamped":false}}
{"type":"system","subtype":"stop_hook_summary","uuid":"s3","parentUuid":"u4"}
{"type":"system","subtype":"turn_duration","uuid":"s4","parentUuid":"s3","timestamp":"2026-10-20T10:00:05.300Z","durationMs":900,"messageCount":3}
```
T5 wakeup fires → consumes `wakeup`, sets `loop` → agent-running
```jsonl
{"type":"system","subtype":"scheduled_task_fire","uuid":"s5","parentUuid":"s4","timestamp":"2026-10-20T10:20:05.400Z","taskId":"1a2b3c4d","cron":"20 7 * * *","prompt":"/supera:pr-watch 7 --tick 1","taskKind":"loop","cronKind":"loop","content":"Claude resuming /loop wakeup","isMeta":false}
{"type":"user","uuid":"u5","parentUuid":"s5","turnOrigin":"scheduled","scheduledTaskId":"1a2b3c4d","scheduledFireId":"f-1","message":{"role":"user","content":"<command-name>/supera:pr-watch</command-name>\n<command-args>7 --tick 1</command-args>"}}
```
T6 fired turn ends without rescheduling → agent-running until 10:20:30Z + 1500 s, then waiting-for-me
```jsonl
{"type":"assistant","uuid":"a6","parentUuid":"u5","message":{"id":"msg_6","role":"assistant","content":[{"type":"text","text":"Still pending."}],"stop_reason":"end_turn"}}
{"type":"system","subtype":"turn_duration","uuid":"s6","parentUuid":"a6","timestamp":"2026-10-20T10:20:30.000Z","durationMs":25000,"messageCount":4}
```
T7 loop stopped → waiting-for-me
```jsonl
{"type":"assistant","uuid":"a7","parentUuid":"u6","message":{"id":"msg_7","role":"assistant","content":[{"type":"tool_use","id":"toolu_w2","name":"ScheduleWakeup","input":{"stop":true}}],"stop_reason":"tool_use"}}
{"type":"user","uuid":"u7","parentUuid":"a7","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_w2","content":"Loop stopped — cancelled 1 pending wakeup(s)."}]},"toolUseResult":{"stopped":true,"cancelledWakeups":1,"scheduledFor":0,"clampedDelaySeconds":0,"wasClamped":false}}
{"type":"system","subtype":"turn_duration","uuid":"s7","parentUuid":"u7","durationMs":800,"messageCount":2}
```
T8 turn ended with a background engineer → agent-running
```jsonl
{"type":"system","subtype":"turn_duration","uuid":"s8","parentUuid":"a8","durationMs":3000,"messageCount":6,"pendingBackgroundAgentCount":1}
```
T9 background shell outstanding at turn end → agent-running; T9b its notification → agent-running (new turn)
```jsonl
{"type":"user","uuid":"u9","parentUuid":"a9","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_bg1","content":"Command running in background with ID: bx1."}]},"toolUseResult":{"stdout":"","stderr":"","interrupted":false,"isImage":false,"noOutputExpected":false,"backgroundTaskId":"bx1"}}
{"type":"system","subtype":"turn_duration","uuid":"s9","parentUuid":"u9","durationMs":1500,"messageCount":3}
```
```jsonl
{"type":"user","uuid":"u10","parentUuid":"s9","turnOrigin":"task_notification","origin":{"kind":"task-notification"},"message":{"role":"user","content":"<task-notification>\n<task-id>bx1</task-id>\n<tool-use-id>toolu_bg1</tool-use-id>\n<output-file>/tmp/x.output</output-file>\n<status>completed</status>\n<summary>Background command completed (exit code 0)</summary>\n</task-notification>"}}
```
T10 interrupt → waiting-for-me
```jsonl
{"type":"user","uuid":"u11","parentUuid":"a10","message":{"role":"user","content":[{"type":"text","text":"[Request interrupted by user]"}]}}
```
T11 API error turn → waiting-for-me
```jsonl
{"type":"assistant","uuid":"a11","parentUuid":"u12","isApiErrorMessage":true,"error":"rate_limit","apiErrorStatus":429,"message":{"id":"msg_e","role":"assistant","model":"<synthetic>","content":[{"type":"text","text":"API Error: rate limited"}],"stop_reason":"stop_sequence"}}
{"type":"system","subtype":"stop_hook_summary","uuid":"s12","parentUuid":"a11"}
{"type":"system","subtype":"turn_duration","uuid":"s13","parentUuid":"s12","durationMs":200,"messageCount":2}
```
T12 local command after a turn → waiting-for-me; T12b skill command line alone → agent-running
```jsonl
{"type":"user","uuid":"u13","parentUuid":"s13","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>Caveat</local-command-caveat>"}}
{"type":"user","uuid":"u14","parentUuid":"u13","message":{"role":"user","content":"<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args></command-args>"}}
{"type":"system","subtype":"local_command","uuid":"s14","parentUuid":"u14","content":"<local-command-stdout>Set model</local-command-stdout>","level":"info","isMeta":false}
```
```jsonl
{"type":"user","uuid":"u15","parentUuid":"s14","turnOrigin":"human","promptSource":"typed","message":{"role":"user","content":"<command-name>/supera:ship</command-name>\n<command-args>add retry</command-args>"}}
```
T13 Stop hook continues the turn (no turn_duration) → agent-running
```jsonl
{"type":"system","subtype":"stop_hook_summary","uuid":"s16","parentUuid":"a16","preventedContinuation":false,"hookCount":1}
{"type":"user","uuid":"u17","parentUuid":"s16","message":{"role":"user","content":"Stop hook feedback: continue"}}
```
R1 receipt via task-notification (Agent result was async)
```jsonl
{"type":"assistant","uuid":"a20","message":{"id":"msg_20","role":"assistant","content":[{"type":"tool_use","id":"toolu_eng1","name":"Agent","input":{"description":"Add retry","prompt":"…","subagent_type":"supera:supera-engineer"}}],"stop_reason":"tool_use"}}
{"type":"user","uuid":"u20","parentUuid":"a20","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_eng1","content":[{"type":"text","text":"Async agent launched successfully."}]}]},"toolUseResult":{"status":"async_launched","agentId":"a0b1c2d3e4f5a6b7c","isAsync":true,"description":"Add retry","prompt":"…","outputFile":"/tmp/a.output","canReadOutputFile":true,"resolvedModel":"claude-opus-5-5"}}
{"type":"user","uuid":"u21","turnOrigin":"task_notification","origin":{"kind":"task-notification","producer":"session-task"},"message":{"role":"user","content":"<task-notification>\n<task-id>a0b1c2d3e4f5a6b7c</task-id>\n<tool-use-id>toolu_eng1</tool-use-id>\n<output-file>/tmp/a.output</output-file>\n<status>completed</status>\n<summary>Agent \"Add retry\" completed</summary>\n<result>Implemented.\n\n```json\n{\"summary\":\"Add retry\",\"filesChanged\":[\"src/a.ts\",\"tests/a.test.ts\"],\"verification\":{\"build\":\"pass\",\"lint\":\"pass\",\"unit\":\"pass\"}}\n```\n</result>\n</task-notification>"}}
```
R2 receipt via peer hand-back
```jsonl
{"type":"user","uuid":"u22","turnOrigin":"peer","isMeta":true,"origin":{"kind":"peer","handback":true,"senderTaskId":"a0b1c2d3e4f5a6b7c","from":"agent","body":"…"},"message":{"role":"user","content":"Another Claude session sent a message:\n<agent-message from=\"agent\">\n```json\n{\"summary\":\"Add retry\",\"filesChanged\":[],\"verification\":{\"build\":\"skipped\"},\"notes\":\"already done\"}\n```\n</agent-message>"}}
```
Note: R2 has `isMeta` on this synthetic line to check that the receipt extractor scans meta lines too. Real hand-backs: 177 peer lines, all `isMeta: true`.

R3 fallback in `subagents/agent-a0b1c2d3e4f5a6b7c.jsonl` (+ meta `{"agentType":"supera:supera-engineer","toolUseId":"toolu_eng1"}`)
```jsonl
{"type":"assistant","uuid":"x1","isSidechain":true,"agentId":"a0b1c2d3e4f5a6b7c","sessionId":"S","message":{"id":"msg_x","role":"assistant","content":[{"type":"text","text":"```json\n{\"summary\":\"Add retry\",\"filesChanged\":[\"src/a.ts\"],\"verification\":{\"build\":\"pass - ran pnpm build\"}}\n```"}],"stop_reason":"end_turn"}}
```
(R3 expected: receipt `invalid`, with the problem that verification.build is not in the enum.)

W1 worktree binding (cwd flips on the tool_result line; gitBranch still `main`) → slug `feat-add-retry`
```jsonl
{"type":"assistant","uuid":"a30","cwd":"/Users/u/w/repo","gitBranch":"main","message":{"id":"msg_30","role":"assistant","content":[{"type":"tool_use","id":"toolu_wt","name":"Bash","input":{"command":"WT=$(\"$D/scripts/create-worktree.sh\" .worktrees origin main feat-add-retry) && cd \"$WT\" && pwd"}}],"stop_reason":"tool_use"}}
{"type":"user","uuid":"u30","parentUuid":"a30","cwd":"/Users/u/w/repo/.worktrees/feat-add-retry","gitBranch":"main","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_wt","content":"/Users/u/w/repo/.worktrees/feat-add-retry","is_error":false}]},"toolUseResult":{"stdout":"/Users/u/w/repo/.worktrees/feat-add-retry\n/Users/u/w/repo/.worktrees/feat-add-retry","stderr":"","interrupted":false,"isImage":false,"noOutputExpected":false}}
```
C1 successor after `/clear` (file `22222222-….jsonl` in the same dir) → follow from launch uuid S
```jsonl
{"type":"attachment","uuid":"c1","parentUuid":null,"sessionId":"22222222-2222-4222-8222-222222222222","attachment":{"type":"hook_success","hookEvent":"SessionStart","hookName":"SessionStart:clear"}}
{"type":"attachment","uuid":"c2","parentUuid":"c1","sessionId":"22222222-2222-4222-8222-222222222222","session_id":"11111111-1111-4111-8111-111111111111","attachment":{"type":"date"}}
```

## Open risks

- **Single month, single minor line.** Only 2.1.278–2.1.304 were seen. The rules lean on fields that are recent here and undocumented: `turn_duration`, `pendingBackgroundAgentCount`, the `toolUseResult.scheduledFor/stopped` keys, the `<task-notification>` XML, `origin.handback` and `session_id`. Gate each rule on its field's presence; when a field is missing, degrade to unknown, not waiting.
- **Loop end is silent.** pr-watch exits without `ScheduleWakeup({stop:true})`, and the harness fallback fire (~1,200 s) happens only sometimes (48 yes, 22 no after fired turns). Rule 4b therefore shows "agent-running" for up to 25 min after a pr-watch that actually finished. Question for the lead (supera-side): should pr-watch call `ScheduleWakeup({stop:true})` on exit? That would make rule 4b exact. D8 says supera is not modified for fly, so this is a decision, not a fix.
- **`pendingBackgroundAgentCount` vs reality.** 34 engineer runs never delivered a notification. A killed or crashed subagent may leave the count >0 forever, and only tmux liveness or a later turn clears it. `system/agents_killed` (6 cases) is assumed to reset it, which is unverified.
- **Background shells that never end** (dev servers) would pin "agent-running" under rule 4c. Consider counting only shells launched in the last turn, or capping by age.
- **Usage-limit pauses** (`system/informational` "Usage limit reached · continuing automatically at …") fall under rule 4d and show as "waiting-for-me" even though the agent resumes by itself. Matching the text is fragile.
- **`/clear` rotation.** Successor lookup (F2) depends on `session_id`, which is absent on ≤2.1.289. With several fly sessions in one root dir and no `session_id`, the successor is ambiguous, so the state should be unknown. `--resume` and `--session-id` write behavior is inferred, not observed. Verify both in M3 with one real fly-launched session.
- **Startup race.** The `.jsonl` only exists after the first write. A just-launched session reads "unknown" until it does.
- **Partial lines on MB-sized appends** (1.8 MB api-request-blob) were not exercised. The reader must buffer until `\n` regardless.
- **File size.** Up to 29 MB main and 54 MB subagent. Tail incrementally from a saved offset and never re-read whole files on each change. api-request* lines (≥2.1.300) are bulk the parser can skip by `type` before any deep parse.
- **Receipt location churn.** Receipts arrive over four channels across versions; the async default makes the tool_result path nearly dead. A future change of the hand-back mechanism needs the subagent-file fallback (R3), which depends on the `subagents/` layout and `meta.json.toolUseId`.
- **Retention.** Transcripts older than ~30 days appear to be deleted. fly must not depend on old files for state history.
