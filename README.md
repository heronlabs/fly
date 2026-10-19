# fly

fly is a desktop app for driving agent-based development across many repositories at once. Open it on a workspace folder, see every repo and every worktree, click a worktree to get its Claude session, start a new task and have supera ship it, and watch a queue of what is waiting for you versus what an agent is still working on.

## Prerequisites

| Tool | Why |
|------|-----|
| `git` | Repo and worktree discovery |
| `gh` | Pull request status and creation |
| `tmux` | Persistent sessions hosting Claude Code |
| `claude` | Claude Code CLI |

## Development

```bash
pnpm install
pnpm dev
```
