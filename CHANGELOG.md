## v0.0.4 (2026-10-20)

### Documentation

* docs: document mutation testing and how to kill survivors (8c3db8a82fdec155b757ed56048e2277952c1c0f)

### Miscellaneous Chores

* other: tighten comments and the ambiguous-guard disable (aefa3468ecf47af14f6f3081d5f2aa6a7a684c99)
* other(infrastructure): kill surviving mutants in the adapters (8ba10eb86b42ea0c817521b9c641f9e0d4a52e70)
* other(infrastructure): drop equivalent-mutant shapes in the adapters (99ff600c178647281b90ae2d2adcf5c351bcdfc4)
* other(core): read a worktree's pull requests without a fallback list (da389d1b47b4348750dd9010488203288ff0f2e5)
* other(core): kill surviving mutants in the core services (b744513fb8104cbbff76f90c291628ee8de3a626)
* other(core): drop equivalent-mutant shapes in the services (f3ba0ba1a367019f3ddfa815893cb27732bf53d4)
* other(claude): observe read serialization through the public API (eda5136c90436d3ba85dac5c81aa6b8f00e838e8)
* other(infra): kill surviving mutants in transcript reader and IPC handlers (d7f277538296727566178dd33e79bb64be4d760c)
* other(ipc): drop redundant state that mutation testing found unobservable (8c3bfc0bb6c444f88feb6034409d1cd0b1f7618b)
* other(parsers): kill surviving mutants in transcript and receipt parsers (221d266ede844288f74f0e6dcb390d6b912bb4df)
* other(supera): drop unobservable initial fence state in receipt parser (2e798f5b630981abdee386f9c87f67bc15c257e8)
* other: add Stryker mutation testing like roost (8b9a50dbfda1089f561d74b9297451476c61c403)

## v0.0.3 (2026-10-20)

### Features

* feat(ui): style scrollbars with the theme palette (3d41b232e969c25b19da98a5869b0c86acebd0a4)
* feat(ui): show queue status badges and footer counts (937038d054c2127ca878f5ed3d3dddc867707335)
* feat(ipc): poll and broadcast the queue snapshot (f7ac9bb2884089616306d62e1e8b1472c3dd5a31)
* feat(core): assemble the queue snapshot (aa11a093af720a3dd824d2630d8af5a7673bfe7b)
* feat(github): list pull requests per repo with gh (ad104397281222ab1874d4c455e71f9355bc3b30)
* feat(claude): tail transcripts incrementally and follow /clear (71271852e8dcecb98bbfb1c2c0b26d36520d0520)
* feat(supera): read the engineer receipt from the transcript (6c96aa80e363b37971ae581d02c6bb823183d024)
* feat(claude): parse transcript lines into a summary (bddea7e256a7c43aeca27894e1a00e0c85da52bf)
* feat(core): add queue state rules (a50fe0549134b4c42794e87fd640904e32f4503c)

### Bug Fixes

* fix(ui): give the status badge an img role (7f4d71f4bde0ca41bbbd8741a46b9973f102e45e)
* fix(claude): skip transcripts that vanish mid-listing (9c44fb651533318696aa7a3586c6b18eb1392184)
* fix(github): report gh timeouts and treat repos without a GitHub remote as no PRs (ecf02b96a1ffb0af9505cd0b3289d1f31b6cf072)
* fix(core): read a started session without a transcript as waiting (b2b485e52c2ea223482d89aa00947f291a287c73)
* fix(ipc): refresh pull requests on every queue list (b29901d6a8f9db98911ddfc48490dd5251e980bc)
* fix(task): bind a new task to the worktree its transcript entered (c7d8e898f1a842b50071c5fdff18793cc541a6f5)

### Documentation

* docs: mention PrGateway in the gh mocking rule (648c6abfedbc2e78990dc90623f282a6f602da2d)
* docs: note transcript and gh test rules (5afcde33ad9d2cd847ceab7d0b6b35b422ef0300)
* docs: add M3 queue plan and transcript spike (65f97c3600349ad2c97a37246db3691934d167ce)

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

