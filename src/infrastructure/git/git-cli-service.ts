import {appendFile, mkdir, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

import {Injectable} from '@nestjs/common';

import type {DiffFile} from '../../core/domain/diff';
import type {FileFlag} from '../../core/domain/files';
import {
  CommandResult,
  CommandRunner,
} from '../../core/interfaces/command-runner';
import {
  DiffRequest,
  GrepHit,
  GrepRequest,
  VcsGateway,
  WorktreeInfo,
} from '../../core/interfaces/vcs-gateway';
import {parseGrep} from './grep-parser';
import {parseStatusPorcelain} from './status-porcelain-parser';
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
const FETCH_TIMEOUT_MS = 60_000;
const WORKTREE_ADD_TIMEOUT_MS = 30_000;
const WORKTREE_REMOVE_TIMEOUT_MS = 30_000;
const PUSH_TIMEOUT_MS = 60_000;

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

  async status(worktreePath: string): Promise<Record<string, FileFlag>> {
    const output = await this.git(worktreePath, [
      '-c',
      'core.quotepath=false',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ]);
    return parseStatusPorcelain(output);
  }

  // The query is one argument after -e, never a shell string; exit 1 is
  // "no match". --no-column, --no-recurse-submodules (submodule.recurse would
  // make git refuse --untracked) and -F/-E override the user's config.
  async grep({
    worktreePath,
    query,
    maxPerFile,
  }: GrepRequest): Promise<GrepHit[]> {
    const output = await this.git(
      worktreePath,
      [
        'grep',
        '--no-color',
        '--no-column',
        '--no-recurse-submodules',
        '-z',
        '-n',
        '-I',
        '--untracked',
        `--max-count=${maxPerFile}`,
        ...(query.caseSensitive ? [] : ['-i']),
        ...(query.wholeWord ? ['-w'] : []),
        query.regex ? '-E' : '-F',
        '-e',
        query.text,
        '--',
      ],
      [0, 1],
    );
    return parseGrep(output);
  }

  async defaultBranch(repoPath: string): Promise<string | null> {
    const result = await this.run(repoPath, [
      'symbolic-ref',
      '--short',
      'refs/remotes/origin/HEAD',
    ]);
    if (result.code !== 0) return null;
    return result.stdout.trim().replace(/^origin\//, '');
  }

  async fetch(repoPath: string, branch: string): Promise<void> {
    const result = await this.run(
      repoPath,
      ['fetch', 'origin', branch],
      FETCH_TIMEOUT_MS,
    );
    if (result.code === 0) return;
    // Not parsed from stderr: git may be localized.
    const origin = await this.run(repoPath, ['remote', 'get-url', 'origin']);
    if (origin.code !== 0) {
      throw new Error('Repositório sem remote origin');
    }
    throw new Error(`git fetch falhou: ${result.stderr.trim()}`);
  }

  async validBranchName(repoPath: string, name: string): Promise<boolean> {
    const result = await this.run(repoPath, [
      'check-ref-format',
      '--branch',
      name,
    ]);
    return result.code === 0;
  }

  async branchExists(repoPath: string, name: string): Promise<boolean> {
    const result = await this.run(repoPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${name}`,
    ]);
    return result.code === 0;
  }

  async addWorktree(input: {
    repoPath: string;
    path: string;
    branch: string;
    base: string;
  }): Promise<void> {
    const result = await this.run(
      input.repoPath,
      [
        'worktree',
        'add',
        '--no-track',
        '-b',
        input.branch,
        input.path,
        input.base,
      ],
      WORKTREE_ADD_TIMEOUT_MS,
    );
    if (result.code !== 0) {
      throw new Error(`git falhou: ${result.stderr.trim()}`);
    }
  }

  async headSha(worktreePath: string): Promise<string> {
    return (await this.git(worktreePath, ['rev-parse', 'HEAD'])).trim();
  }

  async aheadCount(worktreePath: string, ref: string): Promise<number> {
    const output = await this.git(worktreePath, [
      'rev-list',
      '--count',
      `${ref}..HEAD`,
    ]);
    return Number(output);
  }

  async push(worktreePath: string, branch: string): Promise<void> {
    const result = await this.run(
      worktreePath,
      ['push', '-u', 'origin', branch],
      PUSH_TIMEOUT_MS,
    );
    if (result.code !== 0) {
      throw new Error(`git push falhou: ${result.stderr.trim()}`);
    }
  }

  async removeWorktree(repoPath: string, path: string): Promise<void> {
    const result = await this.run(
      repoPath,
      ['worktree', 'remove', path],
      WORKTREE_REMOVE_TIMEOUT_MS,
    );
    if (result.code !== 0) throw new Error(result.stderr.trim());
  }

  async deleteBranch(repoPath: string, branch: string): Promise<void> {
    const result = await this.run(repoPath, ['branch', '-D', branch]);
    if (result.code !== 0) throw new Error(result.stderr.trim());
  }

  async deleteRemoteBranch(repoPath: string, branch: string): Promise<void> {
    const result = await this.run(
      repoPath,
      ['push', 'origin', '--delete', branch],
      PUSH_TIMEOUT_MS,
    );
    if (
      result.code !== 0 &&
      !result.stderr.includes('remote ref does not exist')
    ) {
      throw new Error(result.stderr.trim());
    }
  }

  async ensureIgnored(repoPath: string, entry: string): Promise<void> {
    const ignored = await this.run(repoPath, ['check-ignore', '-q', entry]);
    if (ignored.code === 0) return;
    const commonDir = (
      await this.git(repoPath, ['rev-parse', '--git-common-dir'])
    ).trim();
    const infoDir = join(resolve(repoPath, commonDir), 'info');
    const file = join(infoDir, 'exclude');
    await mkdir(infoDir, {recursive: true});
    const current = await readFile(file, 'utf8').catch(() => '');
    const separator = current === '' || current.endsWith('\n') ? '' : '\n';
    await appendFile(file, `${separator}/${entry}/\n`);
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

  private async run(
    cwd: string,
    args: string[],
    timeoutMs = GIT_TIMEOUT_MS,
  ): Promise<CommandResult> {
    try {
      return await this.runner.run('git', args, {cwd, timeoutMs});
    } catch (error) {
      // execFile kills the child on timeout: `killed` is set, `code` is null.
      if ((error as {killed?: unknown}).killed === true) {
        throw new Error(`git não respondeu em ${timeoutMs / 1000} s`);
      }
      throw new Error(
        `git falhou: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
