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

