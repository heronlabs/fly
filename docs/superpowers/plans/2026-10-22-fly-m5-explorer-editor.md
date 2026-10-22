# fly M5 — Explorer + Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible explorer column (lazy file tree of the selected worktree, changed files flagged) and a CodeMirror 6 editor in the center column (file tabs next to the session tab, VSCode-like syntax colours, ⌘S save, external-change detection, "Abrir no VSCode"), so small reads and edits never leave fly.

**Architecture:**
- **Files (core + infrastructure):** a `FileService` (core) resolves a worktree id and a worktree-relative POSIX path into an absolute path that must stay inside the worktree, then lists, reads, writes and polls through the existing `FileStore` port (which gains `stat`). Changed-file flags come from `VcsGateway.status` (new), a `git status --porcelain=v1 -z` parsed by a pure `status-porcelain-parser.ts`. Pure rules (hidden names, path safety, binary sniff, size cap, EOL) live in `core/services/file-rules.ts`.
- **IPC:** a `FileHandler` answers `file:list`, `file:read`, `file:write`, `file:poll`. No push channel and no `fs.watch`: the renderer polls `file:poll` for the selected worktree every 3 s while it is selected, the same way the Diff panel polls (M4 P4). One poll returns the git flags and the mtimes of the open files, so the explorer and the "reload?" prompt share it.
- **Renderer:** `ExplorerPanel` (new column between the worktrees tree and the center), `WorkbenchPanel` (center: `FileTabs` strip with the `Sessão` tab and one tab per open file, the existing `SessionPanel` kept mounted and hidden while a file is active, `EditorPanel` with a `CodeEditor` host). The editor theme has two layers: chrome from fly's CSS variables, and a `HighlightStyle` whose colours are CSS variables (`--ed*`) filled from a VSCode Dark+/Light+ palette, so a theme switch never remounts the editor.

**Tech Stack:** M4 stack plus CodeMirror 6: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/search`, `@codemirror/lang-javascript`, `@codemirror/lang-go`, `@codemirror/lang-json`, `@codemirror/lang-yaml`, `@codemirror/lang-markdown`, `@codemirror/legacy-modes` (shell, dockerfile), `@lezer/highlight`. Versions on npm at planning time (2026-10-22): state 6.7.6, view 6.43.15, language 6.13.1, commands 6.11.1, search 6.7.2, lang-javascript 6.2.5, lang-go 6.0.1, lang-json 6.0.2, lang-yaml 6.1.3, lang-markdown 6.5.2, legacy-modes 6.5.5, @lezer/highlight 1.2.5. External tools: `git` 2.x; `code` or Visual Studio Code for "Abrir no VSCode" (M1 launcher, unchanged).

**Spec:** `docs/superpowers/specs/2026-10-19-fly-design.md` (milestone 5 of 6: §2 goal 7, §2 non-goal "no LSP, no debugger", D2 (collapsible explorer column between tree and session), D9 (CodeMirror 6), §5.2 `file-handler.ts` / `ui/editor/`, §5.7 "Editor and explorer", §9 ⌘S). Visual reference: the prototype linked at the top of the spec (artboard `Main`: explorer header with the `N alterados` pill and the `Fechar explorer` chevron, tree rows with an extension chip and an `A`/`M` flag, file tabs with `●` when dirty and `×` otherwise, editor crumb + `Salvar ⌘S` + VSCode button, footer `<lang> · UTF-8 · LF · N linhas`).

**Decisions from the user (2026-10-22):**
- The editor's syntax colours follow **VSCode's default themes** (Dark+ / Light+), not the six-colour `tokens.syntax` palette: in `this.foo.bar()` the `this`, the `foo` and the `bar` must each have their own colour, as VSCode does. This supersedes D9's "theme generated from `tokens.syntax`" for the editor; the diff view and badges keep the `--sy*` variables they use today.
- Explorer and editor get fly's own design (the prototype), not a VSCode clone: fly chrome (fonts, borders, `--page`/`--drawer` surfaces), VSCode token colours inside the editor.

**Verified before planning (2026-10-22):**
- `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all` on git 2.54 (NUL shown as `|`): ` D del.txt| M maçã.txt| M mod.txt|R  moved.txt|ren.txt|A  staged.txt|MM sub/inner.txt|?? newdir/a.txt|?? newdir/b.txt|?? untracked.txt|`. Each entry is `XY<space>path\0`; a rename (`R`) or copy (`C`) is followed by the **old path as an extra NUL-terminated field**; `-z` never quotes (the non-ASCII name arrived verbatim; a path with a space was not exercised in the capture, so Task 1 keeps a fixture for it); `--untracked-files=all` lists files inside untracked directories one by one; staged + unstaged on the same file is `MM`.
- `@lezer/javascript` `src/highlight.js` (the tag map `@codemirror/lang-javascript` uses, read on 2026-10-22): `this: t.self`; `PropertyName: t.propertyName`; `"CallExpression/MemberExpression/PropertyName": t.function(t.propertyName)`; `"CallExpression/VariableName …": t.function(t.variableName)`; `"FunctionDeclaration/VariableDefinition": t.function(t.definition(t.variableName))`; `VariableName: t.variableName`; `VariableDefinition: t.definition(t.variableName)`; `TypeName: t.typeName`; `"ClassDeclaration/VariableDefinition": t.definition(t.className)`; `"NewExpression/VariableName": t.className`; `"for while do if else switch try catch finally return throw break continue default case defer": t.controlKeyword`; `"import export from": t.moduleKeyword`; `"let var const using function class extends": t.definitionKeyword`; `"type enum interface implements namespace module declare": t.definitionKeyword`; `"in of await yield void typeof delete instanceof as satisfies": t.operatorKeyword`; `"with debugger new": t.keyword`; `"get set async static": t.modifier`; `BooleanLiteral: t.bool`; `null: t.null`; `super: t.atom`; `TemplateString: t.special(t.string)`; `PrivatePropertyName: t.special(t.propertyName)`; `Label: t.labelName`; `Escape: t.escape`; `RegExp: t.regexp`; `Arrow: t.function(t.punctuation)`; JSX: `JSXIdentifier: t.tagName`, `JSXAttribute/JSXIdentifier: t.attributeName`, `JSXAttributeValue: t.attributeValue`, `JSXBuiltin/JSXIdentifier: t.standard(t.tagName)`. `@lezer/go`: `FieldName: t.propertyName`, `"CallExpr/VariableName": t.function(t.variableName)`, `"FunctionDecl/DefName": t.function(t.definition(t.variableName))`, `"TypeSpec/DefName": t.definition(t.typeName)`, `"import package": t.moduleKeyword`, `"func interface struct chan map const type var": t.definitionKeyword`, `Nil: t.null`, `Rune: t.character`.
- VSCode `theme-defaults` (`dark_vs` + `dark_plus`, `light_vs` + `light_plus`, read from the vscode repo on 2026-10-22). Dark: `variable.language` (`this`) `#569cd6`; `variable`/`meta.object-literal.key`/`entity.other.attribute-name` `#9CDCFE`; `entity.name.function`/`support.function` `#DCDCAA`; `support.type`/`entity.name.type`/`entity.name.namespace` `#4EC9B0`; `keyword`/`storage`/`storage.type`/`keyword.operator.new`/`constant.language` `#569cd6`; `keyword.control`/`keyword.control.import` `#C586C0`; `variable.other.constant` `#4FC1FF`; `string` `#ce9178`; `constant.numeric` `#b5cea8`; `comment` `#6A9955`; `string.regexp` `#d16969`; `constant.character.escape` `#d7ba7d`; `entity.name.tag` `#569cd6`; `punctuation.definition.tag` `#808080`; `invalid` `#f44747`; `markup.heading` `#569cd6` bold; `entity.name.label` `#C8C8C8`; `punctuation.definition.list.begin.markdown` `#6796e6`; `keyword.operator` `#d4d4d4` (the editor foreground). Light: `#0000ff`, `#001080`, `#795E26`, `#267f99`, `#0000ff`, `#AF00DB`, `#0070C1`, `#a31515`, `#098658`, `#008000`, `#811f3f`, `#EE0000`, `#800000`, `#800000`, `#cd3131`, `#800000` bold, `#000000`, `#0451a5`, `#000000`. `support.type.property-name.json` is `#9cdcfe` dark / `#0451a5` light. Editor chrome (`dark_modern` / `light_modern`): find match `#9E6A03` / none set; the rest of the chrome comes from the registered defaults (`editor.selectionBackground` `#264F78` / `#ADD6FF`, `editorBracketMatch.background` `#0064001a`, `editorBracketMatch.border` `#888888` / `#B9B9B9`) — those four are from memory of VSCode's `editorColorRegistry`, so the executor may adjust them.
- `@codemirror/legacy-modes@6.5.5` ships `shell`, `dockerfile`, `yaml`, `go`, `properties`, `toml`, `cmake` … and **no `makefile` mode**. `@codemirror/lang-go` and `@codemirror/lang-yaml` are Lezer grammars with the rich tags above; the legacy `shell` and `dockerfile` stream modes emit only `keyword`, `builtin`, `variable`, `string`, `comment`, `atom`, `def`, `operator` (mapped by `StreamLanguage` to `t.keyword`, `t.standard(t.name)`, `t.variableName`, `t.string`, `t.comment`, `t.atom`, `t.definition(t.variableName)`, `t.operator`).
- The renderer's `index.html` has no Content-Security-Policy, so CodeMirror's injected `<style>` elements work. `core/services` already imports `node:path` (`queue-service.ts`, `workspace-service.ts`), so `FileService` may too; the renderer may not (`ui-no-node-builtins`).

## Global Constraints

- Every M1–M4 constraint still holds: layer and dependency rules (`pnpm dep:cruise`), 100% coverage on `src/core`, `src/infrastructure` and `src/application/ipc`, 100% Stryker score on the `node` project (`pnpm test:mutation`), kebab-case files with `-service`/`-handler`/`-module` suffixes, pt-BR copy, no hardcoded paths. `git` is mocked through `CommandRunner` in unit tests and runs against an `mkdtemp` repo in integration tests; `FileStore` is faked in unit tests and `NodeFileStoreService` is tested against `mkdtemp` directories. Never the user's repos, never `~/.claude`.
- CodeMirror packages go in **`dependencies`** (the `not-to-dev-dep` rule fails otherwise) and each package that is imported is declared (`no-non-package-json`): no transitive imports through the `codemirror` meta package, which is not added.
- Paths over IPC are **worktree-relative POSIX** strings (`src/main.ts`, `''` for the root). The renderer joins with `/` and never imports `node:path`; the main process joins with `node:path`. Absolute paths reach the renderer only inside `Worktree.path`, used for "Abrir no VSCode" (`<worktree.path>/<path>`, as the diff view does).
- `FileService` never writes outside the worktree: every path goes through `safeRelativePath` (rejects absolute paths, `.`/`..` segments, empty segments, `\0`) and the resolved target's real parent directory must be the worktree's real path or inside it (symlinks pointing outside are refused). Error copy: `Caminho inválido`, `Caminho fora do worktree`, `Worktree não encontrado`, `Não é um arquivo`, `Arquivo mudou no disco; recarregue antes de salvar`.
- Git: `git -c core.quotepath=false status --porcelain=v1 -z --untracked-files=all` through the existing `GitCliService.git` helper (cwd = worktree path, 15 s timeout, `git falhou: <stderr>` / `git não respondeu em 15 s`). Never `git add`, never write to the worktree through git.
- Size caps (`core/services/file-rules.ts`): `MAX_FILE_BYTES = 1_000_000` checked with `stat` **before** reading; a file whose first 8000 characters contain `\0` is binary. Neither is opened in the editor; the tab shows the reason and "Abrir no VSCode".
- EOL: the renderer always sees `\n`. `FileService.read` detects `crlf` (the first line break is `\r\n`) and normalises; `write` restores the file's EOL. UTF-8 only.
- Theme: editor chrome uses the existing variables (`--page`, `--drawer`, `--deep`, `--border`, `--text`, `--text2`, `--muted`, `--faint`, `--accent`, `--active`, `--ok`, `--warn`, `--err`, `--fontMono`). New `--ed*` variables (Task 5) hold the VSCode palette; `tokens.ts` (the vendored design-system copy) is **not** edited.
- pt-BR copy (new):
  - Explorer: `Explorer`, `N alterados`, `Fechar explorer`, `Abrir explorer`, `Vazio` (empty directory), `Erro ao listar: <msg>`.
  - Tabs: `Sessão`, `Fechar <nome>` (aria-label), `●` (dirty glyph) / `×`, `Descartar`, `Cancelar`.
  - Editor header: `Salvo`, `Modificado`, `Salvando…`, `Arquivo alterado no disco`, `Recarregar`, `Manter`, `Arquivo removido do disco`, `Salvar` (+ `⌘S` hint), `Abrir no VSCode`, `Arquivo binário`, `Arquivo grande (N KB)`.
  - Footer: `TypeScript`, `JavaScript`, `Go`, `JSON`, `YAML`, `Markdown`, `Shell`, `Dockerfile`, `Makefile`, `Texto`; `UTF-8`; `LF` / `CRLF`; `N linhas`.
  - Errors: `Caminho inválido`, `Caminho fora do worktree`, `Worktree não encontrado`, `Não é um arquivo`, `Arquivo mudou no disco; recarregue antes de salvar`, `git falhou: <msg>`.
- Git flow: worktree `.worktrees/feat-m5-explorer-editor` on branch `feat-m5-explorer-editor` from `origin/main`, per-task commits, one PR at the end watched with `/supera:pr-watch`; never push to `main`; `version.txt` untouched. One-branch milestone flow as M1–M4. Commits end with the session's `Co-Authored-By` trailer.
- Test commands:
  - Targeted runs: `pnpm vitest run --project <node|ui> <paths>`.
  - Gate: `pnpm typecheck && pnpm lint:check && pnpm dep:cruise && pnpm test:unit && pnpm test:di && pnpm build`, then `pnpm stryker run stryker.conf.json --mutate '<files of the task>'` on the task's node-side files.
  - Tasks 1–3 add modules `main.ts` does not reach yet. Until Task 4 wires the handler, the gate tolerates only `no-unreachable-from-entry`/`no-orphans` on this plan's new modules. Task 5's editor modules are orphans until Task 7 mounts them: same tolerance.
- Wiring every node-side change pays for, once, in Task 4: `fly-api.ts` channels and types, `preload.ts`, `ipc-module.ts` providers, `main.ts` registration, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts` stub.

## Planning rulings

Each ruling: decision, then what it costs if wrong.

- **P1. Polling, not `fs.watch`.** `WorkbenchPanel` calls `window.fly.files.poll(worktreeId, openPaths)` on selection and every `FILES_POLL_MS = 3000` while a worktree is selected (pending guard as `DiffPrPanel`). The result carries the git flags for the explorer and `mtimeMs | null` per open file for the reload prompt. Nothing is watched or computed for unselected worktrees, nothing has to be reset when the renderer reloads, and an atomic replace (editor save, `git checkout`) cannot orphan a watcher. Cost: up to 3 s before a change shows; one `git status` + one `stat` per open file every 3 s for the selected worktree.
- **P2. Explorer column** renders only when a worktree is selected and `AppConfig.explorer === 'open'` (new setting, default `open`, persisted like `diffPanel`). The header chevron collapses it; the hamburger at the left of the tab strip (`Abrir explorer`) reopens it. Grid: `320px 260px 1fr 380px` with both side panels, dropping `260px` when the explorer is collapsed or no worktree is selected, and `380px` when the diff panel is collapsed. Cost: the explorer never shows for "no selection", which is what D2 asks.
- **P3. Hidden entries**: `.git`, `node_modules` (spec) and `.worktrees` (nested worktrees are listed in the worktrees column already). Entries that are neither a directory nor a regular file (symlinks, sockets) are not listed. Cost: a symlinked file is reachable only through VSCode.
- **P4. Tree state lives in the store**, keyed by worktree: `trees[worktreeId] = {expanded: Record<dir, boolean>, entries: Record<dir, FileEntry[]>}`. The root `''` is listed on first selection; a directory is listed when first expanded. When a poll changes the **set of flagged paths**, every ancestor directory of a flagged path that the user has not toggled yet becomes expanded (listed), and every expanded directory is re-listed. A directory the user collapsed stays collapsed. Cost: a new file ignored by git (build output) shows only after the directory is collapsed and expanded again; a manual refresh is not provided in v1.
- **P5. Flags** = `git status --porcelain=v1 -z --untracked-files=all` mapped by `flagOf(xy)`: `??` → `A`; `D` in either column → `D`; `A` in the index column → `A`; `R`/`C` → the new path is `A` (the old path gets `D`); everything else (`M`, `T`, `U` combinations) → `M`; `!!` never appears (no `--ignored`). Deleted paths are **not shown** in the tree (they are not on disk; the Diff panel shows them) but count in `N alterados`. A directory containing a flagged file shows a dot after its name. Cost: a deletion is invisible in the explorer.
- **P6. Files over IPC**: `file:list(worktreeId, dir)` → `FileEntry[]` (directories first, then files, both by `compareText`); `file:read(worktreeId, path)` → `FileContent` (`text` with `eol` and `mtimeMs`, or `binary`, or `large` with `bytes`); `file:write(worktreeId, path, text, eol, expectedMtimeMs)` → `{mtimeMs}`; `file:poll(worktreeId, openPaths)` → `{flags, mtimes, error}`. A git failure inside `poll` yields `flags: {}` and `error: 'git falhou: …'` (shown muted in the explorer header) so the mtimes still arrive. Cost: none.
- **P7. Save guard.** `write` stats the file first: when the file exists and `stat.mtimeMs !== expectedMtimeMs`, it rejects with `Arquivo mudou no disco; recarregue antes de salvar` and writes nothing. When the file is missing (deleted on disk) it writes regardless (the user re-creates it). After a successful write the result's `mtimeMs` becomes the tab's expected mtime. Cost: an engineer write that lands between a poll and ⌘S is reported as an error instead of being silently overwritten (desired); the guard compares exact `mtimeMs`, which is what `stat` returns on APFS.
- **P8. Reload prompt.** On a poll, an open file whose `mtimeMs` differs from the tab's: clean tab → re-read silently (fresh editor state, scroll and undo history lost); dirty tab → `diskState: 'changed'`, the editor header shows `Arquivo alterado no disco` with `Recarregar` (re-read, edits dropped) and `Manter` (adopt the disk mtime as expected; the next ⌘S overwrites). `mtimeMs === null` → `diskState: 'missing'`, header `Arquivo removido do disco`, the tab stays open and ⌘S re-creates the file. Cost: a clean tab the user is reading jumps when the engineer writes it; acceptable for a tool whose point is watching the engineer.
- **P9. One `EditorView`, one `EditorState` per open file.** `CodeEditor` owns a module-level `Map<"<worktreeId>\0<path>", EditorState>` and exports `forgetEditorState(stateKey)`; switching tabs calls `view.setState(cached)` so undo history, selection and scroll survive a switch; `WorkbenchPanel` calls `forgetEditorState` when a tab closes; a reload creates a fresh state (P8). The live document lives in CodeMirror, not in the store: the store keeps `content.text` as the last saved text, `dirty` (flipped by the editor's `updateListener` when `doc.toString() !== content.text` changes value), `diskState` and `content.mtimeMs`. ⌘S reads the text from the view through a ref. Cost: a 1 MB file compares two strings per keystroke (bounded by `MAX_FILE_BYTES`); the undo history of every open tab stays in memory.
- **P10. Terminal stays mounted.** `WorkbenchPanel` renders `SessionPanel` always and wraps it in a `<div hidden>` while a file tab is active. The `TerminalView` key is unchanged, so tmux is never re-attached (M2's lesson). Under `display: none` the host's computed height is `auto`, so `FitAddon.fit()` computes `NaN` dimensions and relies on its own guard to do nothing; on reveal the `ResizeObserver` fires and refits. Manual check 7 covers it; if the fit misbehaves (wrong `cols`/`rows` after reveal, a spurious `terminal:resize`), the fallback is to keep the session container always sized and overlay `EditorPanel` absolutely on top (`position: absolute; inset: 0` inside a `position: relative` center), so the terminal never sees a resize — record it as an execution ruling. Cost: a hidden terminal keeps receiving data (it would anyway).
- **P11. Tabs are per worktree**, kept while switching worktrees (`openFiles` filtered by `worktreeId`; `activeFile[worktreeId]` is the active path or `null` for `Sessão`). Closing a dirty tab shows `Descartar`/`Cancelar` inline on the tab (the two-step pattern of `session-panel.tsx`). When a worktree disappears from the workspace its tabs, tree and flags are dropped, dirty or not. Closing the window with dirty tabs is not guarded in v1. Cost: edits in a removed worktree are lost (its directory is gone anyway); an accidental ⌘Q loses dirty edits.
- **P12. Keyboard**: ⌘S saves the active file from a `window` keydown handler in `WorkbenchPanel` (like ⌘N in `AppShell`), so it works whether focus is in the editor or on the tab strip; CodeMirror gets no `Mod-s` binding (it would double-fire). ⌘W is **not** bound: Electron's default macOS menu maps it to closing the window. ⌘F/⌘G come from `@codemirror/search`'s keymap, ⌘Z/⇧⌘Z from `@codemirror/commands` history, Tab indents (`indentWithTab`). ⌘1/2/3 from spec §9 are deferred to M6 or later. Cost: none.
- **P13. Editor extensions** (no `basicSetup`, which drags in autocompletion and lint): `lineNumbers`, `highlightActiveLineGutter`, `highlightSpecialChars`, `history`, `foldGutter`, `drawSelection`, `dropCursor`, `indentOnInput`, `bracketMatching`, `closeBrackets`, `rectangularSelection`, `crosshairCursor`, `highlightActiveLine`, `highlightSelectionMatches`, `keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab])`, `EditorState.tabSize.of(4)`, `indentUnit.of(language === 'go' || language === 'makefile' ? '\t' : '  ')`, the language (Compartment), the chrome theme (Compartment, `dark` flag follows the fly theme), the highlight style, the `updateListener`. No autocompletion (the editor is for small edits, spec non-goal). No rainbow brackets (VSCode's bracket pair colours) in v1: `bracketMatching` highlights the matching pair with `--edBracketMatch`/`--edBracketBorder`. Cost: one VSCode cue fewer; word completion absent.
- **P14. Languages** by basename (`editor/file-kinds.ts`): `.ts .mts .cts` TypeScript, `.tsx` TypeScript + JSX, `.js .mjs .cjs .jsx` JavaScript (+ JSX for `.jsx`), `.go` Go, `.json .jsonc` JSON, `.yml .yaml` YAML, `.md .mdx` Markdown, `.sh .bash .zsh .bats` and `.zshrc .zprofile .bashrc .bash_profile` Shell, `Dockerfile` / `Dockerfile.*` / `*.dockerfile` Dockerfile, `Makefile` / `GNUmakefile` / `makefile` / `*.mk` Makefile, everything else `Texto` (no language). Lezer grammars for TS/JS/Go/JSON/YAML/Markdown (rich tags); legacy stream modes for Shell and Dockerfile (coarser colouring: keywords, builtins, variables, strings, comments). Markdown fenced blocks use `codeLanguages` built from this same list (`LanguageDescription.of`). **Makefile** gets a 40-line `StreamLanguage` of our own (`editor/makefile-mode.ts`): `#` comments → `t.lineComment`; a line starting with a target name up to `:` → `t.function(t.definition(t.variableName))` (VSCode colours targets like functions); `NAME =`/`:=`/`?=`/`+=` → `t.definition(t.variableName)`; `$(…)`/`${…}` → `t.special(t.variableName)`; recipe lines (leading tab) plain. Cost: Makefile colouring is coarse; `go.mod`, `.env`, `.toml` are plain in v1 (the `properties`/`toml` legacy modes are one import away).
- **P15. Palette and highlight style.** `editor/syntax-palette.ts` exports `syntaxPalette: {dark, light}` keyed by role (`keyword`, `control`, `variable`, `function`, `type`, `constant`, `string`, `number`, `comment`, `regexp`, `escape`, `tag`, `attribute`, `invalid`, `heading`, `meta`, `listMarker`, plus chrome roles `selection`, `lineHighlight`, `bracketMatch`, `bracketBorder`, `findMatch`, `findMatchOther`) and `syntaxVars(theme)` → `{'--edKeyword': …}`; `theme.ts` spreads `syntaxVars` into `dark`/`light` so `applyTheme` sets them (it imports the palette; the palette imports nothing from `theme.ts`, keeping `no-circular` happy). `editor/highlight-style.ts` defines one global `HighlightStyle` whose `color` values are `var(--ed*)` — switching the theme changes the variables and the editor recolours without a transaction. The tag → role table (verified tag names, see above):

  | Role | Lezer tags | Dark | Light |
  |---|---|---|---|
  | keyword | `t.keyword`, `t.definitionKeyword`, `t.operatorKeyword`, `t.modifier`, `t.self`, `t.atom`, `t.bool`, `t.null` | `#569cd6` | `#0000ff` |
  | control | `t.controlKeyword`, `t.moduleKeyword` | `#c586c0` | `#af00db` |
  | variable | `t.variableName`, `t.definition(t.variableName)`, `t.propertyName`, `t.definition(t.propertyName)`, `t.special(t.propertyName)`, `t.definition(t.special(t.propertyName))`, `t.special(t.variableName)` | `#9cdcfe` | `#001080` |
  | function | `t.function(t.variableName)`, `t.function(t.propertyName)`, `t.function(t.definition(t.variableName))`, `t.macroName`, `t.standard(t.name)` | `#dcdcaa` | `#795e26` |
  | type | `t.typeName`, `t.definition(t.typeName)`, `t.className`, `t.definition(t.className)`, `t.namespace` | `#4ec9b0` | `#267f99` |
  | constant | `t.constant(t.variableName)`, `t.constant(t.name)` | `#4fc1ff` | `#0070c1` |
  | string | `t.string`, `t.special(t.string)`, `t.character`, `t.attributeValue`, `t.monospace`, `t.url`, `t.link` | `#ce9178` | `#a31515` |
  | number | `t.number`, `t.integer`, `t.float`, `t.unit` | `#b5cea8` | `#098658` |
  | comment | `t.comment`, `t.quote` | `#6a9955` | `#008000` |
  | regexp | `t.regexp` | `#d16969` | `#811f3f` |
  | escape | `t.escape` | `#d7ba7d` | `#ee0000` |
  | tag | `t.tagName`, `t.standard(t.tagName)`, `t.angleBracket` | `#569cd6` | `#800000` |
  | attribute | `t.attributeName` | `#9cdcfe` | `#e50000` |
  | invalid | `t.invalid` | `#f44747` | `#cd3131` |
  | heading | `t.heading` (also `fontWeight: bold`) | `#569cd6` | `#800000` |
  | meta | `t.meta`, `t.processingInstruction`, `t.labelName`, `t.contentSeparator` | `#c8c8c8` | `#000000` |
  | listMarker | `t.list` | `#6796e6` | `#0451a5` |
  | (no rule, inherits `--text`) | operators, `t.punctuation`, `t.paren`, `t.brace`, `t.squareBracket`, `t.separator`, `t.derefOperator` | | |

  Plus `t.strong` bold, `t.emphasis` italic, `t.strikethrough` line-through (no colour). Chrome roles, dark / light: selection `#264f78` / `#add6ff`; lineHighlight `rgb(255 255 255 / 4%)` / `rgb(0 0 0 / 3%)`; bracketMatch `#0064001a` both; bracketBorder `#888888` / `#b9b9b9`; findMatch `#9e6a03` / `#a8ac94`; findMatchOther `#ea5c0055` both. So `this.foo.bar()` renders `this` keyword-blue, `foo` variable-blue, `bar` function-yellow in both themes; `import`/`return` purple; types teal. JSON and YAML keys both take the variable colour (VSCode colours YAML keys as tags; one global style is simpler). Cost: YAML keys are light blue instead of VSCode's `#569cd6`; the design-system publish (D4) will not carry these colours, so fly keeps `syntax-palette.ts` as its own file.
- **P16. Editor chrome** (`editor/editor-theme.ts`, `EditorView.theme({...}, {dark})`): background `var(--page)`, text `var(--text)`, font `var(--fontMono)` 12.5 px, line height 1.65 (prototype), gutters on `var(--page)` with `var(--faint)` numbers and a `var(--border)` right border, active line number `var(--text)`, caret `var(--accent)`, selection `var(--edSelection)`, active line `var(--edLineHighlight)`, matching bracket `var(--edBracketMatch)` + 1 px `var(--edBracketBorder)` outline, search matches `var(--edFindMatch)` / `var(--edFindMatchOther)`, panels (`.cm-panels`, the search bar) on `var(--drawer)` with `var(--border)`, inputs and buttons restyled with the `buttonStyle` look of the other panels, fold placeholder `var(--muted)`. The `dark` flag is the only reason for a Compartment: it is reconfigured on theme change. Cost: none.

## Review Focus

1. **A path that escapes the worktree**: `../x`, `/etc/passwd`, `a/../../x`, `a\0b`, a symlink inside the worktree pointing outside, a worktree id the workspace no longer has. Every `FileService` method rejects with the pt-BR message and touches nothing. Tests: Task 1 (`safeRelativePath`), Task 2 (`FileService` containment with a fake `FileStore` whose `realPath` returns an outside directory).
2. **Losing an edit** — the user's or the engineer's: ⌘S after the engineer wrote the file (mtime guard, P7); the engineer writes while a dirty tab is open (prompt, P8); `Manter` then ⌘S (overwrite is intentional); a clean tab reloads silently; a stale poll for a worktree that is no longer selected or whose tab closed is ignored. Tests: Task 2 (guard), Task 6 (store flows), Task 7 (header bar and buttons).
3. **Files the editor must not load**: > 1 MB (`stat` before `readFile`), NUL in the first 8000 chars, a directory path given to `read`, a file deleted between `stat` and `read` (ENOENT becomes the error row, never a crash). Tests: Task 2, Task 7 (rows).
4. **The terminal must not re-attach** when switching between `Sessão` and file tabs or opening a second file. Tests: Task 7 (`TerminalView` mock constructed once across switches, `hidden` attribute toggles).
5. **Theme switch with an open editor**: colours change, document, selection and scroll stay. Tests: Task 5 (highlight rules reference `var(--ed*)`; reconfiguring the chrome compartment keeps the doc), manual check 2.
6. **git status shapes**: rename with its extra field, `MM`, `??` inside a new directory, non-ASCII and spaces, an empty output, a trailing NUL. Tests: Task 1 (one fixture per shape, from the capture above).

---

### Task 1: File domain, rules and the git status parser

**Files:**
- Create: `src/core/domain/files.ts`, `src/core/services/file-rules.ts`, `src/infrastructure/git/status-porcelain-parser.ts`
- Test: `tests/unit/core/services/file-rules.spec.ts`, `tests/unit/infrastructure/git/status-porcelain-parser.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  // core/domain/files.ts
  export type FileFlag = 'A' | 'M' | 'D';
  export type FileEntryKind = 'dir' | 'file';
  export type FileEntry = {name: string; kind: FileEntryKind};
  export type Eol = 'lf' | 'crlf';
  export type FileContent =
    | {kind: 'text'; path: string; text: string; eol: Eol; mtimeMs: number}
    | {kind: 'binary'; path: string}
    | {kind: 'large'; path: string; bytes: number};
  export type FilesPoll = {
    flags: Record<string, FileFlag>;          // worktree-relative path → flag
    mtimes: Record<string, number | null>;    // one key per requested open path; null = missing
    error: string | null;                     // git failure, flags empty then
  };
  export type WriteResult = {mtimeMs: number};

  // core/services/file-rules.ts
  export const HIDDEN_ENTRIES: ReadonlySet<string>;   // '.git', 'node_modules', '.worktrees'
  export const MAX_FILE_BYTES = 1_000_000;
  export const BINARY_SNIFF_CHARS = 8000;
  export const INVALID_PATH = 'Caminho inválido';
  export const safeRelativePath: (path: string) => string | null; // normalised POSIX relative path, '' for the root, null when unsafe
  export const visibleEntries: (entries: DirEntry[]) => FileEntry[]; // drops HIDDEN_ENTRIES and non dir/file, sorts dirs first then compareText
  export const isBinary: (text: string) => boolean;
  export const detectEol: (text: string) => Eol;
  export const toLf: (text: string) => string;
  export const withEol: (text: string, eol: Eol) => string;
  export const flagOf: (xy: string) => FileFlag | null;   // P5; null for '!!' and unknown

  // infrastructure/git/status-porcelain-parser.ts
  export const parseStatusPorcelain: (output: string) => Record<string, FileFlag>;
  ```
- `safeRelativePath` rules: input split on `/`; reject when it starts with `/`, contains `\0`, or any segment is `.`, `..` or empty (except the whole string being `''`, the root). Returns the segments joined by `/`. A trailing `/` is rejected (empty segment). Backslashes are ordinary characters (legal on macOS).
- `parseStatusPorcelain`: split on `\0`, drop the trailing empty field; each field is `XY path` (two status chars, one space); when `X` is `R` or `C` the **next field** is the old path → new path `A`, old path `D`; otherwise `flagOf(xy)`; `null` flags are skipped. Empty output → `{}`.

- [ ] **Step 1: Write the failing tests.**
  - `safeRelativePath`: `''` → `''`; `src/main.ts` → same; `/etc/passwd`, `../x`, `a/../b`, `a//b`, `a/`, `./a`, `a\0b` → `null`.
  - `visibleEntries`: hides `.git`, `node_modules`, `.worktrees`; drops `{isDirectory: false, isFile: false}`; orders `[dir b, dir a, file z, file A]` → `a, b, A, z` (dirs first, then `compareText`).
  - `isBinary`: `'\0'` at char 0 → true; `\0` at char 9000 → false; plain text → false. `detectEol`: `a\r\nb` → `crlf`, `a\nb` → `lf`, `a` → `lf`, `a\rb\r\n` → `crlf`. `toLf`/`withEol` round-trip; `withEol(text, 'lf')` is identity.
  - `flagOf`: `'??'` → `A`; `'A '` → `A`; `' M'`, `'M '`, `'MM'`, `' T'`, `'UU'` → `M`; `' D'`, `'D '`, `'AD'` → `D`; `'!!'`, `''`, `'X'` → `null`.
  - Parser: the captured shape (rename → `moved.txt: 'A'`, `ren.txt: 'D'`; `sub/inner.txt: 'M'`; `newdir/a.txt: 'A'`; `maçã.txt: 'M'`; `del.txt: 'D'`); a path with a space; empty string → `{}`; output without the trailing NUL still parses.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/core/services/file-rules.spec.ts tests/unit/infrastructure/git/status-porcelain-parser.spec.ts`.
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Run to verify pass**, then the gate and `pnpm stryker run stryker.conf.json --mutate 'src/core/services/file-rules.ts,src/infrastructure/git/status-porcelain-parser.ts'` at 100%.
- [ ] **Step 5: Commit** — `feat(files): add file domain, rules and the git status parser`.

---

### Task 2: Git status, FileStore.stat and FileService

**Files:**
- Create: `src/core/services/file-service.ts`
- Modify: `src/core/interfaces/vcs-gateway.ts`, `src/infrastructure/git/git-cli-service.ts`, `src/core/interfaces/file-store.ts`, `src/infrastructure/filesystem/node-file-store-service.ts`
- Test: `tests/unit/core/services/file-service.spec.ts`, `tests/unit/infrastructure/git/git-cli-service.spec.ts`, `tests/integration/git/git-cli-service.spec.ts`, `tests/unit/infrastructure/filesystem/node-file-store-service.spec.ts`

**Interfaces:**
- Consumes: Task 1 types and rules; `SessionService.currentWorkspace()` (as `DiffService` does); `GitCliService.git` helper.
- Produces:
  ```ts
  // core/interfaces/vcs-gateway.ts (added)
  abstract status(worktreePath: string): Promise<Record<string, FileFlag>>;

  // core/interfaces/file-store.ts (added)
  export type FileStat = {size: number; mtimeMs: number; isFile: boolean; isDirectory: boolean};
  abstract stat(path: string): Promise<FileStat>;   // rejects on ENOENT

  // core/services/file-service.ts
  export const OUTSIDE_WORKTREE = 'Caminho fora do worktree';
  export const NOT_A_FILE = 'Não é um arquivo';
  export const CHANGED_ON_DISK = 'Arquivo mudou no disco; recarregue antes de salvar';
  @Injectable() export class FileService {
    constructor(sessions: SessionService, files: FileStore, vcs: VcsGateway) {}
    list(worktreeId: string, dir: string): Promise<FileEntry[]>;
    read(worktreeId: string, path: string): Promise<FileContent>;
    write(worktreeId: string, path: string, text: string, eol: Eol, expectedMtimeMs: number | null): Promise<WriteResult>;
    poll(worktreeId: string, openPaths: string[]): Promise<FilesPoll>;
  }
  ```
- `GitCliService.status`: `this.git(worktreePath, ['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'])` → `parseStatusPorcelain`. Errors as the other git calls.
- `NodeFileStoreService.stat`: `fs.promises.stat` → `{size, mtimeMs, isFile: s.isFile(), isDirectory: s.isDirectory()}`.
- `FileService.resolve(worktreeId, rel)`: workspace/worktree lookup → `Worktree não encontrado`; `safeRelativePath` → `Caminho inválido`; `absolute = join(worktree.path, rel)`; containment: `root = await files.realPath(worktree.path)`, `real = await files.realPath(absolute)` when the target exists (list, read, write over an existing file — a symlinked file or directory resolves to where it really points), else `files.realPath(dirname(absolute))` (write of a new file: its parent must exist); unless `real === root || real.startsWith(root + sep)` → `Caminho fora do worktree`. Returns `absolute`.
  - `list`: `resolve` then `visibleEntries(await files.readDir(absolute))`.
  - `read`: `resolve`; `stat`; `!isFile` → `Não é um arquivo`; `size > MAX_FILE_BYTES` → `{kind: 'large', path, bytes: size}`; `readText`; `isBinary` → `{kind: 'binary', path}`; else `{kind: 'text', path, text: toLf(raw), eol: detectEol(raw), mtimeMs}`.
  - `write`: `resolve`; when the file exists (`exists`) and `expectedMtimeMs !== null` and `(await stat).mtimeMs !== expectedMtimeMs` → `CHANGED_ON_DISK`; `writeText(absolute, withEol(text, eol))`; `{mtimeMs: (await stat).mtimeMs}`.
  - `poll`: worktree lookup; `flags` via `vcs.status` in a try/catch → `{}` + `error: errorMessage(e)` (the `errorMessage` of `session-service.ts`); `mtimes`: for each open path, `resolve` + `stat` → `mtimeMs`, any rejection → `null`.

- [ ] **Step 1: Write the failing tests.**
  - `git-cli-service.spec.ts` (unit, `CommandRunner` mock): `status` runs the exact argv with `cwd` and the 15 s timeout, parses the fixture, `git falhou: …` on exit 128, timeout mapping.
  - `git-cli-service.spec.ts` (integration, `mkdtemp` repo): a modified, an untracked and a renamed file → the expected flags; a clean repo → `{}`.
  - `node-file-store-service.spec.ts`: `stat` of a file (size, `isFile`), of a directory, rejection for a missing path.
  - `file-service.spec.ts` (fake `FileStore` and `VcsGateway`, `SessionService` stub with `currentWorkspace`): unknown worktree; `list` root and a sub directory with hidden names filtered and sorted; `read` text (LF), CRLF normalised with `eol: 'crlf'`, large, binary, a directory → `Não é um arquivo`; `write` happy path (text written with the file's EOL, returned mtime), guard rejection when mtime differs and nothing written, guard skipped when `expectedMtimeMs` is null or the file is missing; `poll` returns flags and per-path mtimes with `null` for a missing file, and `error` + empty flags when git fails; containment: `../x` → `Caminho inválido`; a fake `realPath` that answers `/elsewhere/x` for the target of `read` (symlinked file) and for the target of `list` (symlinked directory) → `Caminho fora do worktree` and no `readText`/`readDir` call; `write` of a new file checks the parent's real path.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/core/services/file-service.spec.ts tests/unit/infrastructure tests/integration/git`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the gate and Stryker on `src/core/services/file-service.ts,src/infrastructure/git/git-cli-service.ts,src/infrastructure/filesystem/node-file-store-service.ts`.
- [ ] **Step 5: Commit** — `feat(files): read, write, list and poll worktree files`.

---

### Task 3: Explorer setting

**Files:**
- Modify: `src/core/domain/settings.ts`, `src/infrastructure/environment/json-config-store-service.ts`
- Test: `tests/unit/infrastructure/environment/json-config-store-service.spec.ts`, `tests/unit/core/domain/settings.spec.ts` (if it exists)

**Interfaces:**
- Produces:
  ```ts
  export type ExplorerMode = 'open' | 'collapsed';
  export type AppConfig = {recentRoots: string[]; theme: ThemeMode; diffPanel: DiffPanelMode; explorer: ExplorerMode};
  export const defaultConfig: AppConfig = {..., explorer: 'open'};
  ```
- `coerce` accepts only `open`/`collapsed`, else the default — an old `config.json` without the key loads as `open`.

- [ ] **Step 1: Write the failing tests.** A config without `explorer` → `open`; `'collapsed'` kept; garbage → `open`; `save` round-trips it.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/infrastructure/environment`.
- [ ] **Step 3: Implement.** Also add `explorer: 'open'` to the store's initial config literal and to every `config(...)` helper in `tests/ui` that builds an `AppConfig` (typecheck will list them).
- [ ] **Step 4: Run to verify pass**, then the gate and Stryker on `src/infrastructure/environment/json-config-store-service.ts`.
- [ ] **Step 5: Commit** — `feat(settings): persist the explorer column state`.

---

### Task 4: IPC, preload and wiring

**Files:**
- Create: `src/application/ipc/handlers/file-handler.ts`
- Modify: `src/core/domain/fly-api.ts`, `src/preload.ts`, `src/application/ipc/ipc-module.ts`, `src/main.ts`, `tests/di/ipc-module.spec.ts`, `tests/ui/setup.ts`
- Test: `tests/unit/application/ipc/handlers/file-handler.spec.ts`, `tests/unit/core/domain/fly-api.spec.ts` (already enumerates channel names)

**Interfaces:**
- Consumes: `FileService` (Task 2).
- Produces:
  ```ts
  // core/domain/fly-api.ts (added)
  fileList: 'file:list', fileRead: 'file:read', fileWrite: 'file:write', filePoll: 'file:poll'
  files: {
    list(worktreeId: string, dir: string): Promise<FileEntry[]>;
    read(worktreeId: string, path: string): Promise<FileContent>;
    write(worktreeId: string, path: string, text: string, eol: Eol, expectedMtimeMs: number | null): Promise<WriteResult>;
    poll(worktreeId: string, openPaths: string[]): Promise<FilesPoll>;
  };

  // application/ipc/handlers/file-handler.ts
  @Injectable() export class FileHandler {
    constructor(@Inject(IPC_HOST) host: IpcHost, files: FileService) {}
    register(): void; // the four channels delegate 1:1
  }
  ```
- `ipc-module.ts` provides `FileService` and `FileHandler`; `main.ts` registers `FileHandler` after `DiffHandler`; the DI spec registers it; `tests/ui/setup.ts` stubs `files: {list: vi.fn(), read: vi.fn(), write: vi.fn(), poll: vi.fn()}`.

- [ ] **Step 1: Write the failing tests.** `FileHandler`: registers exactly the four channels; each passes its arguments through and returns the service result; a rejection propagates. `fly-api.spec.ts` passes unchanged (names follow `<area>:<kebab>`).
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project node tests/unit/application tests/unit/core/domain`.
- [ ] **Step 3: Implement** the handler, channels, preload bridge (`invoke` pattern as `diff`), providers, `main.ts`, the DI test and the UI stub.
- [ ] **Step 4: Run** the full gate; `dep:cruise` must report 0 violations; `pnpm test:di`; Stryker on `src/application/ipc/handlers/file-handler.ts`.
- [ ] **Step 5: Commit** — `feat(ipc): expose worktree files to the renderer`.

---

### Task 5: Editor foundation — CodeMirror, palette, languages, host component

**Files:**
- Create: `src/application/ui/editor/file-kinds.ts`, `src/application/ui/editor/languages.ts`, `src/application/ui/editor/makefile-mode.ts`, `src/application/ui/editor/syntax-palette.ts`, `src/application/ui/editor/highlight-style.ts`, `src/application/ui/editor/editor-theme.ts`, `src/application/ui/editor/code-editor.tsx`
- Modify: `package.json` + `pnpm-lock.yaml` (the 12 CodeMirror packages in `dependencies`), `src/application/ui/theme/theme.ts` (spread `syntaxVars`)
- Test: `tests/ui/editor/file-kinds.spec.tsx`, `tests/ui/editor/languages.spec.tsx`, `tests/ui/editor/makefile-mode.spec.tsx`, `tests/ui/editor/syntax-palette.spec.tsx`, `tests/ui/editor/highlight-style.spec.tsx`, `tests/ui/editor/editor-theme.spec.tsx`, `tests/ui/editor/code-editor.spec.tsx`, `tests/ui/theme/theme.spec.tsx`

These modules are orphans until Task 7 mounts `CodeEditor`: the gate tolerates only `no-orphans`/`no-unreachable-from-entry` on them.

**Interfaces:**
- Produces:
  ```ts
  // editor/file-kinds.ts
  export type FileLanguage = 'typescript' | 'javascript' | 'go' | 'json' | 'yaml' | 'markdown' | 'shell' | 'dockerfile' | 'makefile' | 'plain';
  export type FileKind = {language: FileLanguage; jsx: boolean; name: string; label: string; color: string};
  //   name = footer copy (`TypeScript` … `Texto`); label = chip text (≤ 3 chars: `ts`, `js`, `go`, `{}`, `yml`, `md`, `sh`, `dk`, `mk`, else the first two chars of the extension or `tx`);
  //   color = chip colour: ts `#2396ed`, js `var(--warn)`, go `var(--info)`, json `#CCDA3D`, yaml `var(--warn)`, md `var(--muted)`, sh `var(--ok)`, dk `var(--info)`, mk `var(--syTitle)`, plain `var(--faint)`
  export const fileKind: (basename: string) => FileKind;   // P14 table

  // editor/languages.ts
  export const languageExtension: (kind: FileKind) => Extension;   // [] for plain; markdown with codeLanguages
  export const indentUnitOf: (language: FileLanguage) => string;     // '\t' for go and makefile, '  ' otherwise
  // editor/makefile-mode.ts
  export const makefile: StreamParser<{recipe: boolean}>;            // P14

  // editor/syntax-palette.ts
  export type SyntaxRole = 'keyword' | 'control' | 'variable' | 'function' | 'type' | 'constant' | 'string' | 'number' | 'comment' | 'regexp' | 'escape' | 'tag' | 'attribute' | 'invalid' | 'heading' | 'meta' | 'listMarker' | 'selection' | 'lineHighlight' | 'bracketMatch' | 'bracketBorder' | 'findMatch' | 'findMatchOther';
  export const syntaxPalette: Record<'dark' | 'light', Record<SyntaxRole, string>>;   // P15 values
  export const syntaxVar: (role: SyntaxRole) => `--ed${string}`;                       // 'keyword' → '--edKeyword'
  export const syntaxVars: (theme: 'dark' | 'light') => Record<`--${string}`, string>;

  // editor/highlight-style.ts
  export const highlightStyle: HighlightStyle;          // P15 table, colours as var(--ed*)
  export const syntaxHighlighting: Extension;           // syntaxHighlighting(highlightStyle)

  // editor/editor-theme.ts
  export const editorTheme: (theme: ResolvedTheme) => Extension;   // P16, EditorView.theme({...}, {dark: theme === 'dark'})

  // editor/code-editor.tsx
  export type CodeEditorHandle = {getText(): string};
  export const CodeEditor: (props: {
    stateKey: string;        // "<worktreeId>\0<path>"; the cache key (P9)
    text: string;            // last saved text; a new stateKey or a new revision builds a fresh state from it
    revision: number;        // bumped by the parent on reload (P8)
    kind: FileKind;
    theme: ResolvedTheme;
    onDirty(dirty: boolean): void;
    editorRef?: Ref<CodeEditorHandle>;
  }) => JSX.Element;
  ```
- `CodeEditor` owns one `EditorView` (created on mount into a `div` that fills its parent, destroyed on unmount) and a module-level `Map<string, EditorState>`; `exportedForTesting`-style helpers are not needed: tests drive it through props and the handle. On `stateKey`/`revision` change: reuse the cached state or build `EditorState.create({doc: text, extensions})` and `view.setState`. On `theme` change: `view.dispatch({effects: chrome.reconfigure(editorTheme(theme))})`. The `updateListener` calls `onDirty` only when `doc.toString() !== text` flips. Parent-managed cache pruning: `CodeEditor` exports `forgetEditorState(stateKey)` for the panel to call on close (Task 7).
- `theme.ts`: `const dark: ThemeVars = {..., ...syntaxVars('dark')}` and the same for light; `theme.spec.tsx` asserts `--edKeyword` equals the palette value per theme.

- [ ] **Step 1: Add the dependencies.** `pnpm add @codemirror/state @codemirror/view @codemirror/language @codemirror/commands @codemirror/search @codemirror/lang-javascript @codemirror/lang-go @codemirror/lang-json @codemirror/lang-yaml @codemirror/lang-markdown @codemirror/legacy-modes @lezer/highlight`, then `pnpm audit --prod --audit-level=high` (CI runs it). Read `node_modules/@lezer/javascript/dist/index.js` (or its `src/highlight.js`) and confirm the tag names of the P15 table; adjust the table in this plan if a name differs (record it as an execution ruling).
- [ ] **Step 2: Write the failing tests.**
  - `file-kinds`: one case per extension/basename of P14, `Dockerfile.dev`, `GNUmakefile`, `.zshrc`, `README` → plain, `a.TS` (case-insensitive extension) → TypeScript, labels and colours.
  - `languages`: a non-plain kind returns a non-empty extension; plain returns `[]`; `indentUnitOf`.
  - `makefile-mode`: tokenise `# c`, `all: build`, `CC := gcc`, `\t$(CC) -o app` through `StreamLanguage.define(makefile)` + `highlightTree` and assert the tag classes (comment, function-definition, variable-definition, special-variable; the recipe body unstyled).
  - `syntax-palette`: every role has a `#rrggbb`/`#rrggbbaa`/`rgb(...)` value in both themes; `syntaxVar('keyword') === '--edKeyword'`; `syntaxVars('dark')['--edFunction'] === '#dcdcaa'`.
  - `highlight-style` — **the user's requirement as a test**: parse `this.foo.bar()` with `javascript({typescript: true}).language.parser`, run `highlightTree(tree, highlightStyle, (from, to, classes) => …)` and assert `this` gets the class of `t.self`, `foo` the class of `t.propertyName`, `bar` the class of `t.function(t.propertyName)`, and that the three classes differ; also `import x from 'y'` → control class on `import`/`from`, string class on `'y'`; `const n: Foo = 1` → keyword on `const`, type on `Foo`, number on `1`; the generated CSS (`highlightStyle.module?.getRules()`) references `var(--edKeyword)`, `var(--edVariable)`, `var(--edFunction)` and contains no literal `#` colour.
  - `editor-theme`: returns an extension for both themes; the `dark` flag follows the theme (inspect `EditorView.darkTheme` facet of a state built with it).
  - `code-editor` (real CodeMirror in jsdom): renders the text (the `.cm-content` text equals the doc); typing through `view.dispatch` from a handle-less path is not possible, so drive edits by `userEvent.type` on `.cm-content` or by dispatching through the handle's view if the executor exposes `getView()` in tests only — pick one and keep it; `onDirty(true)` after an edit, `onDirty(false)` after reverting; `getText()` returns the doc; a new `revision` resets the doc to `text`; switching `stateKey` back restores the edited doc (cache); `forgetEditorState` drops it; a theme change keeps the doc. If `EditorView` cannot be constructed under jsdom 30, add the minimal polyfills to `tests/ui/setup.ts` (`Range.prototype.getClientRects`/`getBoundingClientRect` returning empty rects, `Element.prototype.scrollIntoView`), and only if that still fails mock `@codemirror/view` in this spec alone — record whichever applied as an execution ruling.
- [ ] **Step 3: Run to verify failure.** `pnpm vitest run --project ui tests/ui/editor tests/ui/theme`.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run to verify pass**, then the gate (`pnpm build` must bundle CodeMirror into the renderer; note the chunk size in the PR evidence).
- [ ] **Step 6: Commit** — `feat(editor): add CodeMirror with the VSCode-like syntax palette`.

---

### Task 6: Renderer — file state in the store and the explorer panel

**Files:**
- Create: `src/application/ui/panels/explorer-panel.tsx`
- Modify: `src/application/ui/state/fly-store.ts`
- Test: `tests/ui/state/fly-store.spec.tsx`, `tests/ui/panels/explorer-panel.spec.tsx`

`explorer-panel.tsx` is an orphan until Task 7: same tolerance.

**Interfaces:**
- Consumes: `FileEntry`, `FileContent`, `FileFlag`, `FilesPoll`, `ExplorerMode` (type-only); `window.fly.files` (Task 4); `fileKind` (Task 5). The renderer cannot import `core/services` (`no-ui-to-main`), so path helpers it needs (`pathAncestors`, `changedDirs`) live in the store with their own tests.
- Produces:
  - **Store** (`fly-store.ts`):
    ```ts
    export const FILES_POLL_MS = 3000;
    export type DiskState = 'same' | 'changed' | 'missing';
    export type OpenFile = {worktreeId: string; path: string; content: FileContent; dirty: boolean; diskState: DiskState; revision: number};
    export type ExplorerTree = {expanded: Record<string, boolean>; entries: Record<string, FileEntry[]>};
    // state
    openFiles: OpenFile[]; activeFile: Record<string, string | null>; trees: Record<string, ExplorerTree>;
    flags: Record<string, Record<string, FileFlag>>; filesError: Record<string, string | null>; saving: boolean;
    // actions
    openFile(worktreeId: string, path: string): Promise<void>;  // existing tab → activate; else files.read → push (dirty false, same, revision 0) → activate; rejection → error
    closeFile(worktreeId: string, path: string): void;           // drops the tab; activeFile falls back to the neighbour tab, else null
    activateFile(worktreeId: string, path: string | null): void;
    setDirty(worktreeId: string, path: string, dirty: boolean): void;
    saveFile(worktreeId: string, path: string, text: string): Promise<boolean>;  // saving guard; files.write(text, content.eol, content.mtimeMs or null when missing) → content.text/mtimeMs, dirty false, diskState same; rejection → error, false
    reloadFile(worktreeId: string, path: string): Promise<void>; // files.read → content replaced, dirty false, diskState same, revision + 1
    keepFile(worktreeId: string, path: string, mtimeMs: number | null): void;   // diskState same; mtimeMs adopted (null → the next save skips the guard)
    listDir(worktreeId: string, dir: string): Promise<void>;      // files.list → trees[w].entries[dir]; rejection → filesError
    toggleDir(worktreeId: string, dir: string): Promise<void>;    // expanded flip; expanding lists when entries are missing
    pollFiles(worktreeId: string): Promise<void>;                 // files.poll(w, open paths of w) → applyPoll, then the follow-ups it returns (reload clean changed tabs, list newly expanded and re-list expanded dirs when the flag set changed)
    applyPoll(worktreeId: string, result: FilesPoll): {reload: string[]; list: string[]};  // pure on state: flags (skip set when JSON-equal), filesError, auto-expand (P4), tab diskState per mtime (P8); ignored when the worktree is unknown to the workspace
    setExplorer(mode: ExplorerMode): Promise<void>;               // settings.set({explorer}) → config
    export const pathAncestors: (path: string) => string[];
    export const changedDirs: (flags: Record<string, FileFlag>) => Set<string>;   // every ancestor of a flagged path, '' excluded
    export const openFilesOf: (state: FlyState, worktreeId: string) => OpenFile[];
    ```
    `applyWorkspace` also drops `openFiles`, `activeFile`, `trees`, `flags`, `filesError` entries whose worktree is gone. `select` does not touch tabs (P11).
  - **`ExplorerPanel`** props: `{worktree: Worktree; repoName: string; tree: ExplorerTree | undefined; flags: Record<string, FileFlag>; error: string | null; activePath: string | null; onToggleDir(dir: string): void; onOpenFile(path: string): void; onClose(): void}`. Renders a `<nav aria-label="Explorer">` on `var(--drawer)` with a right border: header row (`Explorer` uppercase `--faint`, the pill `N alterados` where N = number of flags, the `Fechar explorer` icon button `LeftOutlined`), the subheader `repoName · branch ?? head.slice(0, 7)` in mono `--muted`, `error` in `--muted` when set, then the tree: `role="tree"`, rows `role="treeitem"` with `aria-level`, directories with `aria-expanded`, the active file with `aria-selected`; indent 14 px per level; directory row = chevron (`RightOutlined` rotated 90° when expanded, `transition: transform 120ms`), `FolderOpenOutlined`/`FolderOutlined` in `--info`, name, and a 6 px `--warn` dot when `changedDirs(flags)` has it; file row = the `fileKind` chip (18 × 14, radius 3, `color` on a 13% tint — `color-mix(in srgb, <color> 13%, transparent)`), name, flag letter right-aligned (`A` → `--ok`, `M` → `--warn`; `D` rows are not rendered, P5); active row on `var(--active)`; hover on `var(--surface)`; Enter/Space activate like `worktrees-panel.tsx`. A listed directory with no visible entries shows `Vazio` in `--faint`. Rows are mono 12 px, min height 26 px.

- [ ] **Step 1: Write the failing tests.**
  - Store: `openFile` reads once and activates, a second `openFile` of the same path only activates; `closeFile` picks the neighbour then `null`; `saveFile` writes `(worktreeId, path, text, eol, mtimeMs)`, stores the new mtime, clears dirty, ignores a second call while saving, sets `error` on rejection; `reloadFile` bumps `revision`; `keepFile` adopts the mtime; `toggleDir` lists on first expand only; `applyPoll`: equal flags do not create a new object, a changed flag set auto-expands untouched ancestors and returns them in `list` plus every expanded dir, a collapsed-by-user dir stays collapsed, a clean tab with a new mtime is returned in `reload`, a dirty one becomes `changed`, `null` becomes `missing`, an unknown worktree is ignored, `error` lands in `filesError`; `applyWorkspace` drops a removed worktree's tabs and tree; `setExplorer` stores the config; `pathAncestors`, `changedDirs`, `openFilesOf`.
  - `ExplorerPanel`: header pill count; close button calls `onClose`; a directory row toggles; an expanded directory renders its children indented; a changed directory shows the dot; a file row shows its chip and flag, clicking calls `onOpenFile(path)`; the active file has `aria-selected`; `Vazio`; `error` text; a `D` path is absent.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project ui tests/ui/state tests/ui/panels/explorer-panel.spec.tsx`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the full gate.
- [ ] **Step 5: Commit** — `feat(ui): add the explorer tree and file state`.

---

### Task 7: Renderer — file tabs, editor panel, workbench and shell

**Files:**
- Create: `src/application/ui/panels/file-tabs.tsx`, `src/application/ui/panels/editor-panel.tsx`, `src/application/ui/panels/workbench-panel.tsx`
- Modify: `src/application/ui/app-shell.tsx`
- Test: `tests/ui/panels/file-tabs.spec.tsx`, `tests/ui/panels/editor-panel.spec.tsx`, `tests/ui/panels/workbench-panel.spec.tsx`, `tests/ui/app-shell.spec.tsx`

**Interfaces:**
- Consumes: `CodeEditor`, `forgetEditorState`, `fileKind` (Task 5); `ExplorerPanel`, store state and actions (Task 6); `SessionPanel` (unchanged).
- Produces:
  - **`FileTabs`** props: `{explorerCollapsed: boolean; onOpenExplorer(): void; tabs: OpenFile[]; activePath: string | null; onActivate(path: string | null): void; onClose(path: string): void}`. A `role="tablist"` strip on `var(--drawer)` with a bottom border, `overflow-x: auto`: the `Abrir explorer` icon button (`MenuOutlined`, 36 px, right border) when `explorerCollapsed`; the `Sessão` tab; one tab per file: the `fileKind` chip, the basename, and the close button (`aria-label="Fechar <basename>"`, glyph `●` when dirty, `×` otherwise). Tabs are `role="tab"` with `aria-selected`; the active tab has a 2 px `var(--accent)` bottom border and `var(--page)` background, others `--muted` text. Closing a dirty tab replaces the tab's content with `Descartar` (`--err`, calls `onClose`) / `Cancelar`.
  - **`EditorPanel`** props: `{file: OpenFile; worktreePath: string; theme: ResolvedTheme; diskMtime: number | null | undefined; onDirty(dirty: boolean): void; onSave(text: string): void; onReload(): void; onKeep(): void; onOpenInEditor(path: string): void; editorRef: Ref<CodeEditorHandle>}`. Header on `var(--deep)`: the path crumb (mono 11.5 px `--muted`), the status word (`Salvo` / `Modificado` / `Salvando…`), `Salvar` with the `⌘S` hint (disabled unless dirty), `Abrir no VSCode` (`<worktreePath>/<path>`). Below it, when `diskState === 'changed'`: a `role="alert"` bar `Arquivo alterado no disco` with `Recarregar` and `Manter`; when `missing`: `Arquivo removido do disco`. Body: `CodeEditor` for `kind === 'text'` (stateKey `${worktreeId}\0${path}`, `text = content.text`, `revision`), else a centred `Arquivo binário` / `Arquivo grande (N KB)` with an `Abrir no VSCode` button. Footer on `var(--deep)` mono 11 px `--faint`: `<kind.name> · UTF-8 · LF|CRLF · N linhas` (N from the last saved text; `text.split('\n').length`).
  - **`WorkbenchPanel`** props: `{worktree: Worktree | null; theme: ResolvedTheme; explorerCollapsed: boolean; onOpenExplorer(): void; tabs: OpenFile[]; activePath: string | null; mtimes: Record<string, number | null>; onActivate; onClose; onDirty; onSave(path, text); onReload(path); onKeep(path, mtime); onPoll(worktreeId): Promise<void> | void; onOpenInEditor; session: {snapshot, activeSessionName, onStart, onKill, onSelectSession}}`. Layout: `FileTabs` on top, then `<div hidden={activePath !== null} style={{height: '100%', minHeight: 0}}>` holding `SessionPanel` (always mounted, P10) and, when a tab is active, `EditorPanel`. Effects: the poll loop (`onPoll(worktree.id)` at once and every `FILES_POLL_MS` with the pending guard, cleared on worktree change/unmount, P1); the `window` keydown for ⌘S (`metaKey && key === 's'`, `preventDefault`, `onSave(activePath, editorRef.current.getText())` when a text tab is active and dirty, P12); on tab close `forgetEditorState(key)`. No worktree → `FileTabs` is not rendered and `SessionPanel` shows its `Selecione um worktree`.
  - **`AppShell`**: `gridTemplateColumns` = `['320px', explorerOpen && '260px', '1fr', panelOpen && '380px'].filter(Boolean).join(' ')` where `explorerOpen = selected !== null && config.explorer === 'open'`; renders `ExplorerPanel` after `WorktreesPanel` when `explorerOpen`, lists the root once per selected worktree (`listDir(id, '')` when `trees[id]` is missing); `WorkbenchPanel` replaces the bare `SessionPanel`. Existing spec lines that assert `'320px 1fr 380px'` with a selection (`tests/ui/app-shell.spec.tsx:158`) and `'320px 1fr'` (`:171`) become `'320px 260px 1fr 380px'` and `'320px 260px 1fr'`; the no-selection assertion (`:143`) stays.

- [ ] **Step 1: Write the failing tests.**
  - `FileTabs`: `Sessão` + one tab per file with chips; the active tab has `aria-selected`; clicking a tab calls `onActivate(path)`, `Sessão` calls `onActivate(null)`; close on a clean tab calls `onClose` at once; on a dirty tab shows `Descartar`/`Cancelar`, `Descartar` calls `onClose`, `Cancelar` keeps it; the hamburger shows only when collapsed and calls `onOpenExplorer`.
  - `EditorPanel` (mock `../editor/code-editor` like `session-panel.spec.tsx` mocks `TerminalView`, exposing `onDirty` and a fake handle): crumb and footer copy (`TypeScript · UTF-8 · LF · 3 linhas`, `CRLF` variant); `Salvar` disabled when clean, calls `onSave(text)` when dirty; `Modificado`/`Salvo`; the changed-on-disk bar with both buttons; the missing copy; binary and large rows with the VSCode button called with `<worktreePath>/<path>`.
  - `WorkbenchPanel` (fake timers; mock `TerminalView` and `CodeEditor`): polls at once and after 3 s, stops on unmount and on worktree change; the terminal mock is constructed once across `Sessão` → file → `Sessão`; the session container has `hidden` while a file is active; ⌘S calls `onSave` with the handle's text only when a dirty text tab is active; closing a tab calls `forgetEditorState`.
  - `AppShell`: grid strings per combination (explorer open/collapsed × panel open/collapsed, with and without a selection); the explorer renders only with a selection; `Fechar explorer` calls `settings.set({explorer: 'collapsed'})`; selecting a worktree lists its root once.
- [ ] **Step 2: Run to verify failure.** `pnpm vitest run --project ui`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass**, then the full gate (`no-orphans` must be clean now). Run `pnpm dev` for ~30 s with a clean log, open a `.ts` file and switch themes, stopping only your own process (by PID or group, never `pkill -f Electron`).
- [ ] **Step 5: Commit** — `feat(ui): add file tabs and the editor to the center column`.

---

### Task 8: Docs, gate and PR

**Files:**
- Modify: `README.md` (status table: M5 → Done, M6 → Next; a short "Explorer and editor" paragraph after the Diff / PR one: lazy tree, flags, CodeMirror with VSCode-like colours, ⌘S, reload prompt; the architecture tree gains `editor/` under `ui/` and `files` under `core/domain`), `CLAUDE.md` (Layout: `src/application/ui/editor` holds CodeMirror; Testing: panel specs mock `CodeEditor` like `TerminalView`, `tests/ui/editor` runs real CodeMirror in jsdom; the file-path containment rule in one line)

- [ ] **Step 1:** Edit `README.md` and `CLAUDE.md`.
- [ ] **Step 2:** Run the full gate, `pnpm test:mutation` (100%), then `pnpm dev` for ~30 s with a clean log.
- [ ] **Step 3: Commit** — `docs: describe the explorer and editor`.
- [ ] **Step 4: Push and open the PR** from the repo template: `git push -u origin feat-m5-explorer-editor`, then `gh pr create`. Body:
  - evidence (gate output, coverage, mutation score, renderer chunk size);
  - every planning ruling (P1–P16) and any execution ruling;
  - the manual checks below as unchecked boxes;
  - a risk table: a path escaping the worktree, overwriting the engineer's write, big/binary files, terminal re-attach, CodeMirror bundle size, old config files without `explorer`.

  Never merge.
- [ ] **Step 5: Watch CI** with `/supera:pr-watch <N>` until green; fix failures on the branch.

**Manual checks (for the user; agents can't see the window):**
1. Click a worktree → the explorer column opens between the tree and the session; `.git`, `node_modules` and `.worktrees` are absent; directories containing changes are already expanded and show the dot; changed files carry `A`/`M`; the pill count equals `git status --short | grep -vc '^ D'` for that worktree.
2. Open `src/main.ts` → a tab appears and the editor shows TypeScript with `this` keyword-blue, properties light blue, method calls yellow, types teal, `import`/`return` purple, strings orange, comments green (dark theme); toggle the theme → the colours switch at once and the scroll position stays.
3. Type a character → `●` on the tab and `Modificado`; ⌘S → `Salvo`; within 3 s the file gets `M` in the tree and the Diff panel's `Alterações locais` shows the hunk.
4. With a clean tab open, run `echo '// x' >> <file>` in a terminal → the editor reloads within 3 s. With a dirty tab, do the same → `Arquivo alterado no disco`; `Recarregar` drops the edit; repeat with `Manter` then ⌘S → the file holds the editor's text.
5. Delete the open file from a terminal → `Arquivo removido do disco`; ⌘S re-creates it and the tree shows it `A`.
6. Open `build/icon.png` → `Arquivo binário` with the VSCode button; a file over 1 MB (`dd if=/dev/zero of=big.bin bs=1m count=2` inside a scratch worktree) → `Arquivo grande (2000 KB)`.
7. Switch to `Sessão` and back to a file twice → the terminal keeps its scrollback and `tmux list-clients` shows the same client count.
8. `Fechar explorer` → the center widens; the hamburger reopens it; the choice survives a restart.
9. Select another worktree → its own tabs (or none) show; come back → the previous tabs are still open, dirty state intact; closing a dirty tab asks `Descartar`.
10. Open a `Makefile`, `Dockerfile`, `.sh`, `.yml`, `.json`, `.md` and `.go` → each is coloured; a `.txt` is plain; the footer names the language.
11. ⌘F opens the search bar themed like the panels; Esc closes it; ⌘Z undoes; Tab indents; `{` auto-closes.
