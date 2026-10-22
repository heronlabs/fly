import {Injectable} from '@nestjs/common';

import type {DiffFile} from '../../core/domain/diff';
import {
  CommandResult,
  CommandRunner,
} from '../../core/interfaces/command-runner';
import {
  DiffRequest,
  GIT_TIMEOUT_MESSAGE,
  VcsGateway,
  WorktreeInfo,
} from '../../core/interfaces/vcs-gateway';
import {parseUnifiedDiff} from './unified-diff-parser';
import {parseWorktreePorcelain} from './worktree-porcelain-parser';

const DIFF_ARGS = [
  '-c',
  'core.quotepath=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
];
const GIT_TIMEOUT_MS = 15_000;

@Injectable()
export class GitCliService extends VcsGateway {
  constructor(private readonly runner: CommandRunner) {
    super();
  }

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

  async resolveBase(worktreePath: string, branch: string): Promise<string> {
    const result = await this.run(worktreePath, [
      'rev-parse',
      '--verify',
      '--quiet',
      `refs/remotes/origin/${branch}`,
    ]);
    return result.code === 0 ? `origin/${branch}` : branch;
  }

  async diff(request: DiffRequest): Promise<DiffFile[]> {
    const {worktreePath} = request;
    if (request.scope === 'branch') {
      const output = await this.git(worktreePath, [
        ...DIFF_ARGS,
        `${request.base}...HEAD`,
      ]);
      return parseUnifiedDiff(output);
    }
    const tracked = await this.git(worktreePath, [...DIFF_ARGS, 'HEAD']);
    const listing = await this.git(worktreePath, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
    ]);
    const outputs = [tracked];
    for (const file of listing.split('\0').filter(Boolean)) {
      // --no-index exits 1 when the files differ, which an untracked file always does.
      outputs.push(
        await this.git(
          worktreePath,
          [...DIFF_ARGS, '--no-index', '--', '/dev/null', file],
          [0, 1],
        ),
      );
    }
    return parseUnifiedDiff(outputs.join(''));
  }

  private async git(
    cwd: string,
    args: string[],
    okCodes: number[] = [0],
  ): Promise<string> {
    const result = await this.run(cwd, args);
    if (!okCodes.includes(result.code)) {
      throw new Error(`git falhou: ${result.stderr.trim()}`);
    }
    return result.stdout;
  }

  private async run(cwd: string, args: string[]): Promise<CommandResult> {
    try {
      return await this.runner.run('git', args, {
        cwd,
        timeoutMs: GIT_TIMEOUT_MS,
      });
    } catch (error) {
      // execFile kills the child on timeout: `killed` is set, `code` is null.
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(GIT_TIMEOUT_MESSAGE);
      }
      throw error;
    }
  }
}
