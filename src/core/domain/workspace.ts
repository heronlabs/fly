export type Repo = {
  id: string;
  name: string;
  group: string;
  path: string;
  error?: string;
};

export type Worktree = {
  id: string;
  repoId: string;
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
};

export type Workspace = {root: string; repos: Repo[]; worktrees: Worktree[]};
