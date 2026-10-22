import {Injectable} from '@nestjs/common';

import {DiffScope, WorktreeDiff} from '../domain/diff';
import {Workspace, Worktree} from '../domain/workspace';
import {DiffRequest, VcsGateway} from '../interfaces/vcs-gateway';
import {capDiff} from './diff-rules';
import {errorMessage, SessionService} from './session-service';

// What a branch diff is measured against: the repo's main worktree.
export const baseOf = (
  workspace: Workspace,
  worktree: Worktree,
): string | null => {
  if (worktree.isMain) return null;
  const main = workspace.worktrees.find(
    w => w.repoId === worktree.repoId && w.isMain,
  );
  return main ? (main.branch ?? main.head) : null;
};

@Injectable()
export class DiffService {
  constructor(
    private readonly sessions: SessionService,
    private readonly vcs: VcsGateway,
  ) {}

  async read(worktreeId: string, scope: DiffScope): Promise<WorktreeDiff> {
    const workspace = this.sessions.currentWorkspace();
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    if (!workspace || !worktree) throw new Error('Worktree não encontrado');
    let base = baseOf(workspace, worktree);
    let request: DiffRequest = {worktreePath: worktree.path, scope: 'live'};
    try {
      if (scope === 'branch') {
        if (base === null) {
          return {worktreeId, scope, base, diff: null, error: null};
        }
        const main = workspace.worktrees.find(
          w => w.repoId === worktree.repoId && w.isMain,
        );
        // A detached main worktree yields a SHA, which has no remote twin.
        if (main?.branch === base) {
          base = await this.vcs.resolveBase(worktree.path, base);
        }
        request = {worktreePath: worktree.path, scope, base};
      }
      const files = await this.vcs.diff(request);
      return {worktreeId, scope, base, diff: capDiff(files), error: null};
    } catch (error) {
      return {worktreeId, scope, base, diff: null, error: errorMessage(error)};
    }
  }
}
