# fly

fly is a desktop app for driving agent-based development across many repositories at once. Open it on a workspace folder, see every repo and every worktree, click a worktree to get its Claude session, start a new task and have supera ship it, and watch a queue of what is waiting for you versus what an agent is still working on.

## Prerequisites

| Tool | Why |
|------|-----|
| `git` | Repo and worktree discovery |
| `gh` | Pull request status and creation |
| `tmux` | Persistent sessions hosting Claude Code (>= 3.2, `brew install tmux`); fly uses the default tmux server, so `tmux ls` and `tmux attach -t <name>` from any terminal reach the same sessions |
| `claude` | Claude Code CLI, run inside each session |
| `code` | VSCode on `PATH`, used by "Abrir no VSCode" |

## M2 status

Works now: each worktree can host a tmux session running Claude Code ("Iniciar sessão"), attached and detached in an xterm.js terminal; sessions are reconciled on launch; "Nova tarefa" starts `/supera:ship <descrição>` and binds the session to the worktree ship creates.

Next: queue state (M3), diff and PR (M4), editor (M5), first run and packaging (M6).

## Development

```bash
pnpm install
pnpm dev
```

Run `pnpm test:unit` and `pnpm test:di` for the test suites, and `pnpm test:mutation` for mutation testing.
