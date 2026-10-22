import {create} from 'zustand';

import type {DiffScope, WorktreeDiff} from '../../../core/domain/diff';
import type {
  QueueSnapshot,
  QueueStatus,
  WorktreeQueue,
} from '../../../core/domain/queue';
import type {SessionsSnapshot} from '../../../core/domain/session';
import type {
  AppConfig,
  DiffPanelMode,
  ThemeMode,
} from '../../../core/domain/settings';
import type {Repo, Workspace, Worktree} from '../../../core/domain/workspace';

export const DIFF_POLL_MS = 3000;

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
};

const ipcPrefix = /^Error invoking remote method '[^']*': (?:Error: )?/;

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
    set(state => ({
      workspace,
      selectedWorktreeId: selectionAfter(workspace, state.selectedWorktreeId),
    }));
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
}));

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
