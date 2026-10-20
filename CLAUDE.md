# fly — heronlabs agent cockpit

Electron desktop app (main process runs NestJS, renderer is React) for driving agent-based development across many repositories. Spec and plan live in `docs/superpowers/`.

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Run the app with hot reload (electron-vite) |
| `pnpm build` | Build main, preload and renderer into `out/` |
| `pnpm lint:check` | gts lint + json/yml lint |
| `pnpm test:unit` | vitest with 100% coverage thresholds |
| `pnpm test:di` | Nest DI smoke test: `IpcModule` resolves with real decorator metadata |
| `pnpm dep:cruise` | Enforce layer rules |
| `pnpm typecheck` | Typecheck node and web projects |

Targeted run without coverage: `pnpm vitest run --project <node|ui> <paths>`.

## Layout and layer rules

`src/{application,core,infrastructure}` plus `src/main.ts` and `src/preload.ts`; the renderer lives under `src/application/ui`. Kebab-case files with `-service.ts` / `-handler.ts` / `-module.ts` suffixes.

- `core` never imports `application`.
- `application` never imports `infrastructure`, except `src/application/ipc/ipc-module.ts` (composition root).
- `infrastructure` never imports `application` or `core`, except `core/interfaces` and `core/domain`.
- `application/ui` imports only `application/ui` and type-only `core/domain`.
- `preload.ts` imports only `core/domain`.

## Electron two-process note

The renderer never touches Node or Electron APIs. It talks to the main process only through `window.fly`, exposed by `preload.ts` via `contextBridge`. Channel names live in `src/core/domain/fly-api.ts`.

## Toolchain

Node >=22 (`.node-version`), pnpm >=10, TypeScript ~5.8 strict with `noUncheckedIndexedAccess`.

## HARD RULES

- **NEVER edit `version.txt` manually.** Version is managed by `action-tag-release-build` via the CD workflow.
- **ALWAYS use `/supera:ship`** for every change. No exceptions.
- **NEVER commit directly to `main`.** All changes go through worktree, PR, pr-watch.
