import {Injectable} from '@nestjs/common';

import type {PullRequest} from '../../core/domain/queue';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {
  GH_AUTH_MESSAGE,
  GH_TIMEOUT_MESSAGE,
  PrGateway,
} from '../../core/interfaces/pr-gateway';
import {parsePrList} from './pr-list-parser';

const NO_REMOTE_PATTERN =
  /no git remotes found|none of the git remotes configured for this repository point to a known GitHub host/i;
const AUTH_PATTERN = /gh auth login|not logged in|authentication/i;

@Injectable()
export class GhCliService extends PrGateway {
  constructor(private readonly runner: CommandRunner) {
    super();
  }

  async list(repoPath: string): Promise<PullRequest[]> {
    const result = await this.run(repoPath);
    if (result.code !== 0) {
      // Checked before auth: its second message also says `gh auth login`.
      if (NO_REMOTE_PATTERN.test(result.stderr)) return [];
      if (AUTH_PATTERN.test(result.stderr)) {
        throw new Error(GH_AUTH_MESSAGE);
      }
      throw new Error(result.stderr.trim() || 'gh pr list failed');
    }
    return parsePrList(result.stdout);
  }

  private async run(repoPath: string): ReturnType<CommandRunner['run']> {
    try {
      return await this.runner.run(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'all',
          '--limit',
          '50',
          '--json',
          'number,url,headRefName,state,isDraft,mergeable,reviewDecision,statusCheckRollup',
        ],
        {cwd: repoPath, timeoutMs: 15_000},
      );
    } catch (error) {
      // execFile kills the child on timeout: `killed` is set, `code` is null.
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(GH_TIMEOUT_MESSAGE);
      }
      throw error;
    }
  }
}
