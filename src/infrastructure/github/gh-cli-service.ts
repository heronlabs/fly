import {Injectable} from '@nestjs/common';

import type {PullRequest, ReviewComment} from '../../core/domain/queue';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {
  GH_AUTH_MESSAGE,
  GH_DEFAULT_BRANCH_MESSAGE,
  GH_MERGE_TIMEOUT_MESSAGE,
  GH_RERUN_TIMEOUT_MESSAGE,
  GH_TIMEOUT_MESSAGE,
  PrGateway,
} from '../../core/interfaces/pr-gateway';
import {parsePrList} from './pr-list-parser';
import {parseReviewComments} from './review-comments-parser';

const NO_REMOTE_PATTERN =
  /no git remotes found|none of the git remotes configured for this repository point to a known GitHub host/i;
const NO_LOG_PATTERN = /log not found/i;
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

  async create(input: {
    cwd: string;
    title: string;
    bodyFile: string;
    base: string;
    head: string;
  }): Promise<{number: number; url: string}> {
    let result: Awaited<ReturnType<CommandRunner['run']>>;
    try {
      result = await this.runner.run(
        'gh',
        [
          'pr',
          'create',
          '--title',
          input.title,
          '--body-file',
          input.bodyFile,
          '--base',
          input.base,
          '--head',
          input.head,
        ],
        {cwd: input.cwd, timeoutMs: 60_000},
      );
    } catch (error) {
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(GH_MERGE_TIMEOUT_MESSAGE);
      }
      throw error;
    }
    const url = result.stdout.trim();
    const number = /\/pull\/(\d+)$/.exec(url)?.[1];
    if (result.code !== 0 || number === undefined) {
      throw new Error(
        `gh pr create falhou: ${result.stderr.trim() || result.stdout.trim()}`,
      );
    }
    return {number: Number(number), url};
  }

  async merge(repoPath: string, number: number): Promise<void> {
    let result: Awaited<ReturnType<CommandRunner['run']>>;
    try {
      result = await this.runner.run(
        'gh',
        ['pr', 'merge', String(number), '--merge'],
        {cwd: repoPath, timeoutMs: 60_000},
      );
    } catch (error) {
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(GH_MERGE_TIMEOUT_MESSAGE);
      }
      throw error;
    }
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'gh pr merge failed');
    }
  }

  async defaultBranch(repoPath: string): Promise<string> {
    let result: Awaited<ReturnType<CommandRunner['run']>>;
    try {
      result = await this.runner.run(
        'gh',
        [
          'repo',
          'view',
          '--json',
          'defaultBranchRef',
          '-q',
          '.defaultBranchRef.name',
        ],
        {cwd: repoPath, timeoutMs: 15_000},
      );
    } catch (error) {
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(GH_TIMEOUT_MESSAGE);
      }
      throw error;
    }
    const name = result.stdout.trim();
    if (result.code !== 0 || name === '') {
      throw new Error(GH_DEFAULT_BRANCH_MESSAGE);
    }
    return name;
  }

  async failedLog(repoPath: string, jobId: string): Promise<string | null> {
    const result = await this.call(
      repoPath,
      ['run', 'view', '--job', jobId, '--log-failed'],
      60_000,
      GH_MERGE_TIMEOUT_MESSAGE,
    );
    if (result.code !== 0) {
      if (NO_LOG_PATTERN.test(result.stderr)) return null;
      throw new Error(result.stderr.trim() || 'gh run view failed');
    }
    return result.stdout === '' ? null : result.stdout;
  }

  async rerun(repoPath: string, runId: string): Promise<void> {
    const result = await this.call(
      repoPath,
      ['run', 'rerun', runId, '--failed'],
      30_000,
      GH_RERUN_TIMEOUT_MESSAGE,
    );
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'gh run rerun failed');
    }
  }

  async reviewComments(
    repoPath: string,
    number: number,
  ): Promise<ReviewComment[]> {
    const view = await this.call(
      repoPath,
      ['pr', 'view', String(number), '--json', 'reviews,comments'],
      15_000,
      GH_TIMEOUT_MESSAGE,
    );
    if (view.code !== 0) {
      throw new Error(view.stderr.trim() || 'gh pr view failed');
    }
    // gh's default page is 30 and --paginate prints concatenated arrays.
    const lines = await this.call(
      repoPath,
      ['api', `repos/{owner}/{repo}/pulls/${number}/comments?per_page=100`],
      15_000,
      GH_TIMEOUT_MESSAGE,
    );
    if (lines.code !== 0) {
      throw new Error(lines.stderr.trim() || 'gh api failed');
    }
    return parseReviewComments(view.stdout, lines.stdout);
  }

  private async call(
    repoPath: string,
    args: string[],
    timeoutMs: number,
    timeoutMessage: string,
  ): ReturnType<CommandRunner['run']> {
    try {
      return await this.runner.run('gh', args, {cwd: repoPath, timeoutMs});
    } catch (error) {
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(timeoutMessage);
      }
      throw error;
    }
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
          'number,url,headRefName,state,isDraft,mergeable,reviewDecision,statusCheckRollup,title,headRefOid,mergeStateStatus',
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
