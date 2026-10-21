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
  abstract diff(request: DiffRequest): Promise<DiffFile[]>;
}
