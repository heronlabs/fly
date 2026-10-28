import type {DiffFile} from '../domain/diff';
import type {FileFlag} from '../domain/files';
import type {SearchQuery} from '../domain/search';

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

export type GrepRequest = {
  worktreePath: string;
  query: SearchQuery;
  maxPerFile: number;
};

export type GrepHit = {path: string; line: number; text: string};

export abstract class VcsGateway {
  abstract listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
  // origin/<branch> when that remote-tracking ref exists, else <branch>.
  abstract resolveBase(worktreePath: string, branch: string): Promise<string>;
  abstract diff(request: DiffRequest): Promise<DiffFile[]>;
  abstract status(worktreePath: string): Promise<Record<string, FileFlag>>;
  // Tracked and untracked, not ignored, text files; worktree-relative paths.
  abstract grep(request: GrepRequest): Promise<GrepHit[]>;
  // Branch origin/HEAD points to, or null when origin/HEAD is unset.
  abstract defaultBranch(repoPath: string): Promise<string | null>;
  abstract fetch(repoPath: string, branch: string): Promise<void>;
  abstract validBranchName(repoPath: string, name: string): Promise<boolean>;
  abstract branchExists(repoPath: string, name: string): Promise<boolean>;
  // New branch from `base` without tracking, so a plain `git push` is not aimed at base.
  abstract addWorktree(input: {
    repoPath: string;
    path: string;
    branch: string;
    base: string;
  }): Promise<void>;
  abstract headSha(worktreePath: string): Promise<string>;
  // Commits in `ref..HEAD`.
  abstract aheadCount(worktreePath: string, ref: string): Promise<number>;
  // `git push -u origin <branch>`.
  abstract push(worktreePath: string, branch: string): Promise<void>;
  // `git worktree remove`, no --force: a worktree with changes is refused.
  abstract removeWorktree(repoPath: string, path: string): Promise<void>;
  // `git merge-base --is-ancestor`: false for "not an ancestor" and for an
  // unknown commit alike.
  abstract isAncestor(
    repoPath: string,
    ancestor: string,
    descendant: string,
  ): Promise<boolean>;
  // `git branch -D`.
  abstract deleteBranch(repoPath: string, branch: string): Promise<void>;
  // `git push origin --delete`; resolves when origin no longer has the branch.
  abstract deleteRemoteBranch(repoPath: string, branch: string): Promise<void>;
  // Adds /<entry>/ to the shared .git/info/exclude unless already ignored.
  abstract ensureIgnored(repoPath: string, entry: string): Promise<void>;
}
