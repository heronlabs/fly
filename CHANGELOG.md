## v0.0.2 (2026-10-20)

### Features

* feat(ui): session panel and nova tarefa dialog (09504efddaca665d818e6fbeab17ed8e7ebc6825)
* feat(ui): render tmux sessions with xterm.js (a211f67f5c156d74ad28a3428bcd7db9d7511991)
* feat(ui): track tmux sessions in the store and mark worktrees with sessions (19fde3edef18ebb1e9c9e2c373c74cf287074020)
* feat(ipc): stream tmux terminals over ipc with batching (15605c526b3295af35acb3a529b4646376971268)
* feat(ipc): expose tmux sessions and ship tasks to the renderer (5bb8c0c9bb8ddf9100fc0822664ea05895f94fb8)
* feat(pty): attach tmux sessions through node-pty (09e1ac3cf4a6025128bb1474265444a94907e44b)
* feat(core): start ship tasks and bind them to the worktree ship creates (00d646619756237ebdf7870e7fce5e68941b0894)
* feat(core): map tmux sessions to worktrees and start claude sessions (6fe249d702c2bc1eac36fdb8b88918df054a6021)
* feat(tmux): start, list, tag and kill tmux sessions (8916edf40703eed714b7c418ac560445e85b6f85)
* feat(core): derive tmux session names and the claude command (9149a4880f7f0bdcf2c576308d0c4849dbc7ebdc)
* feat(env): load login-shell PATH and add a DI smoke test (d50a34e0e88f92c1e33534cda2e6ccf51ace05fd)

### Bug Fixes

* fix(ui): let a new session replace an exited terminal (da66494436af46a4462a1e24c62efe7184778797)
* fix(ui): keep an exited terminal visible (3d8264ecc7ba972f68dcf7e105cc1a65a6b38d9a)
* fix: guard session start and map missing tmux (5db408dfef10a2f0311757b8eb28cb8f82ea1ddc)
* fix(tmux): pass the task prompt through the pane environment (02deffc186d5c3161a2329ca61844ed46ca17832)
* fix(ui): clear task errors and guard double submit (c188c3ff6871232ed2717088fb36aded30722bf7)
* fix(ui): handle terminal attach and detach failures (04bcbff72649bebf2dd61eb8d17bf6756dbf5831)
* fix(ipc): clear pending terminal output on renderer reset (2c2221efdadb323d5bc35b1b02eac451773af343)
* fix(core): strip control characters from the claude prompt (697d898f2012d40e1a2cd038bca261364ea79e77)
* fix(core): resolve the workspace root to its real path (95608e389f42d3b18117deda4b914023ff874769)

### Performance Improvements

* perf(watch): ignore git index noise and rewatch new repos (b2100ccf22b3d385a5ab7087b46cedbf16b2d7fc)

### Documentation

* docs: document M2 terminal prerequisites and status (f69f417365233edc5c72d92593a4b7db9b13fef3)
* docs: add M2 terminal plan (1c7748933432e20c7f080c61eee115fa753b0a74)

### Miscellaneous Chores

* other: clean up tmux sockets and DI temp dirs (73be9252de241d7ec5c2b930b8c6d604751909a9)
* other: ignore .serena (cc8ef33110ad1861da3b8a94dc19e3ff4b0a9509)

## v0.0.1 (2026-10-19)

### Features

* feat(ui): add app shell with welcome, top bar, footer and theme switching (e776f76ef086f65f778c59ca82df8727ec4d06a7)
* feat(ui): add fly store and worktrees panel (1e60bebceb24cb163feed65f7f1e3f4d7ba27822)
* feat(ipc): expose workspace, settings and shell handlers through the preload bridge (0a5a13a074c4b88a695f0d2cda0fdac5f63e70ff)
* feat(infra): open worktrees in vscode and watch git dirs for worktree changes (6e42deefb38c6fcbfb91f956fc31b45abeee14b5)
* feat(settings): persist recent roots and theme in a json config store (5b94ccbba86ef135e820652b11978ada6a2ce5a5)
* feat(core): discover repos and worktrees under a workspace root (bd11ffa3af8e9c99e0ad26406f7e5dcbf69c92ee)
* feat(git): list worktrees through git porcelain output (f18bd4bb32fb696475e61e07a124bcac041f92e4)
* feat(infra): add command runner and file store adapters (92386c1717eddc6716c3a28824611988f9de3cbf)
* feat(ui): add heronlabs theme tokens and css variable maps (a922840c5dc5a7d02765a0ccb92532d69ec6f26e)

### Bug Fixes

* fix(git): skip prunable worktrees (0e458203a55050075f54a9e6eb648e16c7d65400)
* fix(ipc): remember a root only after it opens (5433f563a90711add4da42d9c41f79442c4d3186)
* fix(main): guard navigation and handle bootstrap failures (8a640414533d89a90b0bc0bf5d87ea5de5c9d82b)
* fix: download electron binary on install (3feaf090c5ca678eedc20adfa7ecd2b25e4b3937)

### Miscellaneous Chores

* other(deps): forbid core to infrastructure and ui to electron imports (e1029250de668a29992dfb52e3dbc2740b34fdbe)
* other: disable decorator metadata in vitest transform (04eae87ec8a123a750fb156fb36ecd5f3cf590be)
* other: add continuous integration and delivery workflows (af803ce1e5c0716a730c380b8bdca516d971bde5)
* other: scaffold fly electron app (af366fe2bc14e061ed967af89379404c361ad752)

