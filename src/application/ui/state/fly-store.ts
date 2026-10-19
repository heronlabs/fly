import {create} from 'zustand';

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
  bootstrap(): Promise<void>;
  pickAndOpen(): Promise<void>;
  openRoot(root: string): Promise<void>;
  refresh(): Promise<void>;
  select(worktreeId: string): void;
  setTheme(theme: ThemeMode): Promise<void>;
  applyWorkspace(workspace: Workspace): void;
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
