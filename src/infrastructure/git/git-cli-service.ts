import {Injectable} from '@nestjs/common';

import {CommandRunner} from '../../core/interfaces/command-runner';
import {VcsGateway, WorktreeInfo} from '../../core/interfaces/vcs-gateway';
import {parseWorktreePorcelain} from './worktree-porcelain-parser';

// Decorator-metadata emit adds an unreachable `typeof X === 'undefined'` branch.
/* v8 ignore start */
@Injectable()
export class GitCliService extends VcsGateway {
  constructor(private readonly runner: CommandRunner) {
    super();
  }
  /* v8 ignore stop */

  async listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
    const result = await this.runner.run(
      'git',
      ['worktree', 'list', '--porcelain'],
      {cwd: repoPath},
    );
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'git worktree list failed');
    }
    return parseWorktreePorcelain(result.stdout);
  }
}
