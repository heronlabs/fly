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
    const base = baseOf(workspace, worktree);
    let request: DiffRequest = {worktreePath: worktree.path, scope: 'live'};
    if (scope === 'branch') {
      if (base === null) {
        return {worktreeId, scope, base, diff: null, error: null};
      }
      request = {worktreePath: worktree.path, scope, base};
    }
    try {
      const files = await this.vcs.diff(request);
      return {worktreeId, scope, base, diff: capDiff(files), error: null};
    } catch (error) {
      return {worktreeId, scope, base, diff: null, error: errorMessage(error)};
    }
  }
}
