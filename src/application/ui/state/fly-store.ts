import {create} from 'zustand';

import type {SessionsSnapshot} from '../../../core/domain/session';
import type {AppConfig, ThemeMode} from '../../../core/domain/settings';
import type {Repo, Workspace, Worktree} from '../../../core/domain/workspace';

export type WorktreeStatus =
  | 'idle'
  | 'engineer'
  | 'ci'
  | 'failed'
  | 'ready'
  | 'review'
  | 'merged'
  | 'unknown';

export type FlyState = {
  workspace: Workspace | null;
  config: AppConfig;
  selectedWorktreeId: string | null;
  loading: boolean;
  error: string | null;
  sessions: SessionsSnapshot;
  activeSessionName: string | null;
  bootstrap(): Promise<void>;
  pickAndOpen(): Promise<void>;
  openRoot(root: string): Promise<void>;
  refresh(): Promise<void>;
  select(worktreeId: string): void;
  setTheme(theme: ThemeMode): Promise<void>;
  applyWorkspace(workspace: Workspace): void;
  loadSessions(): Promise<void>;
  applySessions(snapshot: SessionsSnapshot): void;
  startSession(worktreeId: string): Promise<void>;
  killSession(name: string): Promise<void>;
  createTask(input: {repoId: string; description: string}): Promise<boolean>;
  setActiveSession(name: string | null): void;
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
  config: {recentRoots: [], theme: 'system'},
  selectedWorktreeId: null,
  loading: false,
  error: null,
  sessions: {tmux: 'ok', message: null, sessions: []},
  activeSessionName: null,

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
    set({selectedWorktreeId: worktreeId});
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

  async startSession(worktreeId) {
    try {
      set({activeSessionName: await window.fly.sessions.start(worktreeId)});
      await get().loadSessions();
    } catch (error) {
      set({error: errorMessage(error)});
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
