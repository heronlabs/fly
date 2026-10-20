import {Injectable} from '@nestjs/common';

import type {PullRequest} from '../../core/domain/queue';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {GH_AUTH_MESSAGE, PrGateway} from '../../core/interfaces/pr-gateway';
import {parsePrList} from './pr-list-parser';

const AUTH_PATTERN = /gh auth login|not logged in|authentication/i;

@Injectable()
export class GhCliService extends PrGateway {
  constructor(private readonly runner: CommandRunner) {
    super();
  }

  async list(repoPath: string): Promise<PullRequest[]> {
    const result = await this.runner.run(
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
    if (result.code !== 0) {
      if (AUTH_PATTERN.test(result.stderr)) {
        throw new Error(GH_AUTH_MESSAGE);
      }
      throw new Error(result.stderr.trim() || 'gh pr list failed');
    }
    return parsePrList(result.stdout);
  }
}
