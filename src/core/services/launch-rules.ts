import {posix} from 'node:path';

import {WorktreeInfo} from '../interfaces/vcs-gateway';

export type RecentRoot = {root: string; realPath: string};

export type LaunchPlan = {
  // What the app opens and remembers: a recent root as stored, else a real path.
  root: string;
  // The real path of root; worktree ids are relative to it, as in discovery.
  base: string;
  folder: string;
  worktree: string | null;
  worktreeId: string | null;
};

const contains = (parent: string, path: string): boolean =>
  path === parent || path.startsWith(`${parent}/`);

// The folder climbs to the deepest recent root holding it. Outside every
// recent root, a repo folder opens the parent of its main worktree, since
// discovery only scans the children of a root; any other folder is the root.
export const planLaunch = (input: {
  folder: string;
  recentRoots: RecentRoot[];
  worktrees: WorktreeInfo[];
}): LaunchPlan => {
  const {folder, worktrees} = input;
  const main = worktrees.find(worktree => worktree.isMain);
  const worktree =
    worktrees
      .filter(candidate => contains(candidate.path, folder))
      .sort((a, b) => b.path.length - a.path.length)[0] ?? main;
  const recent = input.recentRoots
    .filter(candidate => contains(candidate.realPath, folder))
    .sort((a, b) => b.realPath.length - a.realPath.length)[0];
  const base = recent?.realPath ?? (main ? posix.dirname(main.path) : folder);
  return {
    root: recent?.root ?? base,
    base,
    folder,
    worktree: worktree?.path ?? null,
    worktreeId: worktree ? posix.relative(base, worktree.path) : null,
  };
};
