import type {DiffFile} from '../domain/diff';

export const GIT_TIMEOUT_MESSAGE = 'git não respondeu em 15 s';

export type WorktreeInfo = {
  path: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  locked: boolean;
};

export type DiffRequest =
  | {worktreePath: string; scope: 'live'}
  | {worktreePath: string; scope: 'branch'; base: string};

export abstract class VcsGateway {
  abstract listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
  // origin/<branch> when that remote-tracking ref exists, else <branch>.
  abstract resolveBase(worktreePath: string, branch: string): Promise<string>;
  abstract diff(request: DiffRequest): Promise<DiffFile[]>;
}
