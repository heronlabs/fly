import {create, type StoreApi} from 'zustand';

import type {DiffScope, WorktreeDiff} from '../../../core/domain/diff';
import type {
  FileContent,
  FileEntry,
  FileFlag,
  FilesPoll,
} from '../../../core/domain/files';
import type {
  QueueSnapshot,
  QueueStatus,
  WorktreeQueue,
} from '../../../core/domain/queue';
import type {SessionsSnapshot} from '../../../core/domain/session';
import type {
  AppConfig,
  DiffPanelMode,
  ExplorerMode,
  ThemeMode,
} from '../../../core/domain/settings';
import type {Repo, Workspace, Worktree} from '../../../core/domain/workspace';

export const DIFF_POLL_MS = 3000;
export const FILES_POLL_MS = 3000;

export type DiskState = 'same' | 'changed' | 'missing';
export type OpenFile = {
  worktreeId: string;
  path: string;
  content: FileContent;
  dirty: boolean;
  diskState: DiskState;
  revision: number;
};
export type ExplorerTree = {
  expanded: Record<string, boolean>;
  entries: Record<string, FileEntry[]>;
};

export type FlyState = {
  workspace: Workspace | null;
  config: AppConfig;
  selectedWorktreeId: string | null;
  loading: boolean;
  error: string | null;
  sessions: SessionsSnapshot;
  activeSessionName: string | null;
  startingSession: boolean;
  queue: QueueSnapshot;
  diff: WorktreeDiff | null;
  merging: boolean;
  openFiles: OpenFile[];
  activeFile: Record<string, string | null>;
  trees: Record<string, ExplorerTree>;
  flags: Record<string, Record<string, FileFlag>>;
  filesError: Record<string, string | null>;
  diskMtimes: Record<string, Record<string, number | null>>;
  saving: boolean;
  bootstrap(): Promise<void>;
  pickAndOpen(): Promise<void>;
  openRoot(root: string): Promise<void>;
  refresh(): Promise<void>;
  select(worktreeId: string): void;
  setTheme(theme: ThemeMode): Promise<void>;
  applyWorkspace(workspace: Workspace): void;
  loadSessions(): Promise<void>;
  applySessions(snapshot: SessionsSnapshot): void;
  loadQueue(): Promise<void>;
  applyQueue(snapshot: QueueSnapshot): void;
  startSession(worktreeId: string): Promise<void>;
  killSession(name: string): Promise<void>;
  createTask(input: {repoId: string; description: string}): Promise<boolean>;
  setActiveSession(name: string | null): void;
  loadDiff(worktreeId: string, scope: DiffScope): Promise<void>;
  applyDiff(result: WorktreeDiff): void;
  clearDiff(): void;
  mergePullRequest(worktreeId: string): Promise<void>;
  setDiffPanel(mode: DiffPanelMode): Promise<void>;
  openFile(worktreeId: string, path: string): Promise<void>;
  closeFile(worktreeId: string, path: string): void;
  activateFile(worktreeId: string, path: string | null): void;
  setDirty(worktreeId: string, path: string, dirty: boolean): void;
  saveFile(worktreeId: string, path: string, text: string): Promise<boolean>;
  reloadFile(worktreeId: string, path: string): Promise<void>;
  keepFile(worktreeId: string, path: string, mtimeMs: number | null): void;
  listDir(worktreeId: string, dir: string): Promise<void>;
  toggleDir(worktreeId: string, dir: string): Promise<void>;
  pollFiles(worktreeId: string): Promise<void>;
  applyPoll(
    worktreeId: string,
    result: FilesPoll,
  ): {reload: string[]; list: string[]};
  setExplorer(mode: ExplorerMode): Promise<void>;
};

const ipcPrefix = /^Error invoking remote method '[^']*': (?:Error: )?/;

// FileService's CHANGED_ON_DISK: the write found a newer file on disk.
const CHANGED_ON_DISK = 'Arquivo mudou no disco; recarregue antes de salvar';

export const errorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(ipcPrefix, '');
};

const selectionAfter = (
  workspace: Workspace,
  selectedId: string | null,
): string | null =>
  workspace.worktrees.some(worktree => worktree.id === selectedId)
    ? selectedId
    : null;

const isTab = (file: OpenFile, worktreeId: string, path: string): boolean =>
  file.worktreeId === worktreeId && file.path === path;

const findTab = (
  state: FlyState,
  worktreeId: string,
  path: string,
): OpenFile | undefined =>
  state.openFiles.find(file => isTab(file, worktreeId, path));

const updateTab = (
  state: FlyState,
  worktreeId: string,
  path: string,
  update: (file: OpenFile) => OpenFile,
): OpenFile[] =>
  state.openFiles.map(file =>
    isTab(file, worktreeId, path) ? update(file) : file,
  );

const emptyTree: ExplorerTree = {expanded: {}, entries: {}};

const treeOf = (state: FlyState, worktreeId: string): ExplorerTree =>
  state.trees[worktreeId] ?? emptyTree;

const pathSet = (flags: Record<string, FileFlag> = {}): string =>
  Object.keys(flags).sort().join('\0');

// Keeps the same object when no worktree was dropped, so subscribers of an
// untouched map do not re-render on every workspace push.
const pruned = <T>(record: Record<string, T>, ids: Set<string>) =>
  Object.keys(record).every(id => ids.has(id))
    ? record
    : Object.fromEntries(Object.entries(record).filter(([id]) => ids.has(id)));

// Every tab content gets a revision no tab had before: the editor reuses a
// cached state of the same revision, and a closed or pruned tab's state may
// still be cached when its file is opened again.
let revisionSeq = 0;

// The poll decides "clean" before the read resolves; a keystroke in between
// makes the tab dirty, and then the disk content must not replace the edit.
const reread = async (
  set: StoreApi<FlyState>['setState'],
  worktreeId: string,
  path: string,
  keepEdits: boolean,
): Promise<void> => {
  try {
    const content = await window.fly.files.read(worktreeId, path);
    set(state => ({
      openFiles: updateTab(state, worktreeId, path, file =>
        keepEdits && file.dirty
          ? {...file, diskState: 'changed'}
          : {
              ...file,
              content,
              dirty: false,
              diskState: 'same',
              revision: ++revisionSeq,
            },
      ),
    }));
  } catch (error) {
    set({error: errorMessage(error)});
  }
};

export const useFlyStore = create<FlyState>((set, get) => ({
  workspace: null,
  config: {
    recentRoots: [],
    theme: 'system',
    diffPanel: 'open',
    explorer: 'open',
  },
  selectedWorktreeId: null,
  loading: false,
  error: null,
  sessions: {tmux: 'ok', message: null, sessions: []},
  activeSessionName: null,
  startingSession: false,
  queue: {github: 'ok', message: null, worktrees: []},
  diff: null,
  merging: false,
  openFiles: [],
  activeFile: {},
  trees: {},
  flags: {},
  filesError: {},
  diskMtimes: {},
  saving: false,

  async bootstrap() {
    try {
      const config = await window.fly.settings.get();
      set({config});
      if (config.recentRoots[0]) {
        await get().openRoot(config.recentRoots[0]);
      }
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  async pickAndOpen() {
    try {
      const root = await window.fly.workspace.pickFolder();
      if (root) {
        await get().openRoot(root);
      }
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  async openRoot(root) {
    set({loading: true, error: null});
    try {
      get().applyWorkspace(await window.fly.workspace.open(root));
      set({loading: false});
      await get().loadSessions();
      await get().loadQueue();
    } catch (error) {
      set({loading: false, error: errorMessage(error)});
    }
  },

  async refresh() {
    try {
      get().applyWorkspace(await window.fly.workspace.refresh());
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  select(worktreeId) {
    const changed = get().selectedWorktreeId !== worktreeId;
    set({selectedWorktreeId: worktreeId});
    if (changed) get().clearDiff();
  },

  async setTheme(theme) {
    try {
      set({config: await window.fly.settings.set({theme})});
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  applyWorkspace(workspace) {
    set(state => {
      const ids = new Set(workspace.worktrees.map(worktree => worktree.id));
      const openFiles = state.openFiles.filter(file =>
        ids.has(file.worktreeId),
      );
      return {
        workspace,
        selectedWorktreeId: selectionAfter(workspace, state.selectedWorktreeId),
        openFiles:
          openFiles.length === state.openFiles.length
            ? state.openFiles
            : openFiles,
        activeFile: pruned(state.activeFile, ids),
        trees: pruned(state.trees, ids),
        flags: pruned(state.flags, ids),
        filesError: pruned(state.filesError, ids),
        diskMtimes: pruned(state.diskMtimes, ids),
      };
    });
  },

  async loadSessions() {
    try {
      get().applySessions(await window.fly.sessions.list());
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  applySessions(snapshot) {
    set(state => {
      const active = snapshot.sessions.find(
        session => session.name === state.activeSessionName,
      );
      const previous = state.sessions.sessions.find(
        session => session.name === state.activeSessionName,
      );
      const follows =
        active !== undefined &&
        previous !== undefined &&
        active.worktreeId !== previous.worktreeId &&
        state.selectedWorktreeId === previous.worktreeId;
      return {
        sessions: snapshot,
        activeSessionName: active?.name ?? null,
        selectedWorktreeId: follows
          ? active.worktreeId
          : state.selectedWorktreeId,
      };
    });
  },

  async loadQueue() {
    try {
      get().applyQueue(await window.fly.queue.list());
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  applyQueue(snapshot) {
    set({queue: snapshot});
  },

  async startSession(worktreeId) {
    // A double click must not start two sessions.
    if (get().startingSession) return;
    set({startingSession: true});
    try {
      set({activeSessionName: await window.fly.sessions.start(worktreeId)});
      await get().loadSessions();
    } catch (error) {
      set({error: errorMessage(error)});
    } finally {
      set({startingSession: false});
    }
  },

  async killSession(name) {
    try {
      await window.fly.sessions.kill(name);
      await get().loadSessions();
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  async createTask(input) {
    set({error: null});
    try {
      const name = await window.fly.tasks.create(input);
      const main = get().workspace?.worktrees.find(
        worktree => worktree.repoId === input.repoId && worktree.isMain,
      );
      set(state => ({
        activeSessionName: name,
        selectedWorktreeId: main?.id ?? state.selectedWorktreeId,
      }));
      await get().loadSessions();
      return true;
    } catch (error) {
      set({error: errorMessage(error)});
      return false;
    }
  },

  setActiveSession(name) {
    set({activeSessionName: name});
  },

  async loadDiff(worktreeId, scope) {
    try {
      get().applyDiff(await window.fly.diff.get(worktreeId, scope));
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  applyDiff(result) {
    set(state => {
      if (result.worktreeId !== state.selectedWorktreeId) return state;
      if (JSON.stringify(result) === JSON.stringify(state.diff)) return state;
      return {diff: result};
    });
  },

  clearDiff() {
    set({diff: null});
  },

  async mergePullRequest(worktreeId) {
    // A double click must not merge twice.
    if (get().merging) return;
    set({merging: true, error: null});
    try {
      await window.fly.pullRequests.merge(worktreeId);
      await get().loadQueue();
    } catch (error) {
      set({error: errorMessage(error)});
    } finally {
      set({merging: false});
    }
  },

  async setDiffPanel(mode) {
    try {
      set({config: await window.fly.settings.set({diffPanel: mode})});
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },

  // Files

  async openFile(worktreeId, path) {
    if (!findTab(get(), worktreeId, path)) {
      try {
        const content = await window.fly.files.read(worktreeId, path);
        set(state =>
          findTab(state, worktreeId, path)
            ? state
            : {
                openFiles: [
                  ...state.openFiles,
                  {
                    worktreeId,
                    path,
                    content,
                    dirty: false,
                    diskState: 'same',
                    revision: ++revisionSeq,
                  },
                ],
              },
        );
      } catch (error) {
        set({error: errorMessage(error)});
        return;
      }
    }
    get().activateFile(worktreeId, path);
  },

  closeFile(worktreeId, path) {
    set(state => {
      const tabs = openFilesOf(state, worktreeId);
      const index = tabs.findIndex(file => file.path === path);
      if (index === -1) return state;
      const active = state.activeFile[worktreeId] ?? null;
      const neighbour = (tabs[index + 1] ?? tabs[index - 1])?.path ?? null;
      const mtimes = state.diskMtimes[worktreeId];
      return {
        openFiles: state.openFiles.filter(
          file => !isTab(file, worktreeId, path),
        ),
        activeFile: {
          ...state.activeFile,
          [worktreeId]: active === path ? neighbour : active,
        },
        diskMtimes: mtimes
          ? {
              ...state.diskMtimes,
              [worktreeId]: Object.fromEntries(
                Object.entries(mtimes).filter(([key]) => key !== path),
              ),
            }
          : state.diskMtimes,
      };
    });
  },

  activateFile(worktreeId, path) {
    set(state => ({activeFile: {...state.activeFile, [worktreeId]: path}}));
  },

  setDirty(worktreeId, path, dirty) {
    set(state => ({
      openFiles: updateTab(state, worktreeId, path, file => ({...file, dirty})),
    }));
  },

  async saveFile(worktreeId, path, text) {
    // A double ⌘S must not write twice.
    const file = findTab(get(), worktreeId, path);
    const content = file?.content;
    if (get().saving || content?.kind !== 'text') return false;
    set({saving: true});
    try {
      const {mtimeMs} = await window.fly.files.write(
        worktreeId,
        path,
        text,
        content.eol,
        content.mtimeMs,
      );
      set(state => ({
        error: null,
        openFiles: updateTab(state, worktreeId, path, tab => ({
          ...tab,
          content: {...content, text, mtimeMs},
          dirty: false,
          diskState: 'same',
        })),
      }));
      return true;
    } catch (error) {
      const message = errorMessage(error);
      // A conflict shows the reload bar, so the edit can be kept or dropped.
      set(state =>
        message === CHANGED_ON_DISK
          ? {
              error: message,
              openFiles: updateTab(state, worktreeId, path, tab => ({
                ...tab,
                diskState: 'changed',
              })),
            }
          : {error: message},
      );
      return false;
    } finally {
      set({saving: false});
    }
  },

  reloadFile(worktreeId, path) {
    return reread(set, worktreeId, path, false);
  },

  // A null mtime (the file is gone) keeps the old one: the write creates a
  // missing file whatever mtime it gets, checks it only against a file that
  // exists again, and the next poll flags it missing.
  keepFile(worktreeId, path, mtimeMs) {
    set(state => ({
      openFiles: updateTab(state, worktreeId, path, file => ({
        ...file,
        content:
          file.content.kind === 'text' && mtimeMs !== null
            ? {...file.content, mtimeMs}
            : file.content,
        diskState: 'same',
      })),
    }));
  },

  async listDir(worktreeId, dir) {
    try {
      const entries = await window.fly.files.list(worktreeId, dir);
      set(state => {
        const tree = treeOf(state, worktreeId);
        if (JSON.stringify(entries) === JSON.stringify(tree.entries[dir])) {
          return state;
        }
        return {
          trees: {
            ...state.trees,
            [worktreeId]: {...tree, entries: {...tree.entries, [dir]: entries}},
          },
        };
      });
    } catch (error) {
      set(state => ({
        filesError: {
          ...state.filesError,
          [worktreeId]: `Erro ao listar: ${errorMessage(error)}`,
        },
      }));
    }
  },

  async toggleDir(worktreeId, dir) {
    const before = treeOf(get(), worktreeId);
    const expand = before.expanded[dir] !== true;
    set(state => {
      const tree = treeOf(state, worktreeId);
      return {
        trees: {
          ...state.trees,
          [worktreeId]: {...tree, expanded: {...tree.expanded, [dir]: expand}},
        },
      };
    });
    if (expand && !before.entries[dir]) await get().listDir(worktreeId, dir);
  },

  async pollFiles(worktreeId) {
    let result: FilesPoll;
    try {
      result = await window.fly.files.poll(
        worktreeId,
        openFilesOf(get(), worktreeId).map(file => file.path),
      );
    } catch (error) {
      set(state => ({
        filesError: {...state.filesError, [worktreeId]: errorMessage(error)},
      }));
      return;
    }
    const {reload, list} = get().applyPoll(worktreeId, result);
    await Promise.all([
      ...reload.map(path => reread(set, worktreeId, path, true)),
      ...list.map(dir => get().listDir(worktreeId, dir)),
    ]);
  },

  applyPoll(worktreeId, result) {
    const state = get();
    if (!state.workspace?.worktrees.some(w => w.id === worktreeId)) {
      return {reload: [], list: []};
    }
    const patch: Partial<FlyState> = {};
    if (state.filesError[worktreeId] !== result.error) {
      patch.filesError = {...state.filesError, [worktreeId]: result.error};
    }
    const before = state.flags[worktreeId];
    if (JSON.stringify(result.flags) !== JSON.stringify(before)) {
      patch.flags = {...state.flags, [worktreeId]: result.flags};
    }
    const mtimes = state.diskMtimes[worktreeId];
    if (JSON.stringify(result.mtimes) !== JSON.stringify(mtimes)) {
      patch.diskMtimes = {...state.diskMtimes, [worktreeId]: result.mtimes};
    }
    let list: string[] = [];
    if (pathSet(result.flags) !== pathSet(before)) {
      // A deleted path is not on disk: listing its vanished ancestors fails.
      const tree = treeOf(state, worktreeId);
      const expanded = {...tree.expanded};
      for (const [path, flag] of Object.entries(result.flags)) {
        if (flag === 'D') continue;
        for (const dir of pathAncestors(path)) expanded[dir] ??= true;
      }
      patch.trees = {...state.trees, [worktreeId]: {...tree, expanded}};
      list = ['', ...Object.keys(expanded).filter(dir => expanded[dir])];
    }
    const reload: string[] = [];
    const openFiles = state.openFiles.map(file => {
      const mtime =
        file.worktreeId === worktreeId ? result.mtimes[file.path] : undefined;
      let diskState = file.diskState;
      // undefined: not polled, the tab opened after the poll started.
      if (mtime === null) {
        diskState = 'missing';
      } else if (mtime !== undefined) {
        // An equal or older mtime is unchanged, or a poll that stat'ed before
        // the last save (R15); only a newer one is a change on disk.
        if (file.content.kind === 'text' && mtime > file.content.mtimeMs) {
          if (!file.dirty) reload.push(file.path);
          else diskState = 'changed';
        } else if (diskState === 'missing') {
          // A number proves the file exists again (R16).
          diskState = 'same';
        }
      }
      return diskState === file.diskState ? file : {...file, diskState};
    });
    if (openFiles.some((file, index) => file !== state.openFiles[index])) {
      patch.openFiles = openFiles;
    }
    set(patch);
    return {reload, list};
  },

  async setExplorer(mode) {
    try {
      set({config: await window.fly.settings.set({explorer: mode})});
    } catch (error) {
      set({error: errorMessage(error)});
    }
  },
}));

export const pathAncestors = (path: string): string[] => {
  const dirs = path.split('/').slice(0, -1);
  return dirs.map((_, index) => dirs.slice(0, index + 1).join('/'));
};

export const changedDirs = (flags: Record<string, FileFlag>): Set<string> =>
  new Set(Object.keys(flags).flatMap(pathAncestors));

export const openFilesOf = (state: FlyState, worktreeId: string): OpenFile[] =>
  state.openFiles.filter(file => file.worktreeId === worktreeId);

export const groupsOf = (
  workspace: Workspace,
): {group: string; repos: {repo: Repo; worktrees: Worktree[]}[]}[] => {
  const groups = new Map<string, {repo: Repo; worktrees: Worktree[]}[]>();
  for (const repo of workspace.repos) {
    const worktrees = workspace.worktrees
      .filter(worktree => worktree.repoId === repo.id)
      .sort((a, b) => Number(b.isMain) - Number(a.isMain));
    groups.set(repo.group, [
      ...(groups.get(repo.group) ?? []),
      {repo, worktrees},
    ]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([group, repos]) => ({group, repos}));
};

export const queueCounts = (
  snapshot: QueueSnapshot,
): {ready: number; working: number; ci: number; failed: number} => {
  const counts = {ready: 0, working: 0, ci: 0, failed: 0};
  for (const {status} of snapshot.worktrees) {
    if (status === 'waiting' || status === 'ready') counts.ready += 1;
    else if (status === 'engineer') counts.working += 1;
    else if (status === 'ci') counts.ci += 1;
    else if (status === 'failed') counts.failed += 1;
  }
  return counts;
};

export const statusesOf = (
  snapshot: QueueSnapshot,
): Record<string, QueueStatus> =>
  Object.fromEntries(
    snapshot.worktrees.map(item => [item.worktreeId, item.status]),
  );

export const queueOf = (
  snapshot: QueueSnapshot,
  worktreeId: string,
): WorktreeQueue | null =>
  snapshot.worktrees.find(item => item.worktreeId === worktreeId) ?? null;
