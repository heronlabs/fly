import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {GitCliService} from '../../../src/infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from '../../../src/infrastructure/process/exec-command-runner-service';

describe('GitCliService (real git)', () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-git-')));
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should list the main worktree and an added worktree', async () => {
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=fly-test',
          '-c',
          'user.email=fly-test@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {cwd: dir, stdio: 'pipe'},
      );
    git('init', '-b', 'main');
    git('commit', '--allow-empty', '-m', 'init');
    git('worktree', 'add', '.worktrees/feat-a', '-b', 'feat-a');

    const service = new GitCliService(new ExecCommandRunnerService());
    const result = await service.listWorktrees(dir);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({path: dir, branch: 'main', isMain: true});
    expect(result[1]).toMatchObject({
      path: join(dir, '.worktrees', 'feat-a'),
      branch: 'feat-a',
      isMain: false,
    });
  });

  describe('diff', () => {
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=fly-test',
          '-c',
          'user.email=fly-test@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {cwd: dir, stdio: 'pipe'},
      );
    const service = () => new GitCliService(new ExecCommandRunnerService());

    beforeEach(() => {
      git('init', '-b', 'main');
      writeFileSync(join(dir, 'tracked.txt'), 'one\n');
      git('add', 'tracked.txt');
      git('commit', '-m', 'init');
    });

    it('Should return modified tracked and untracked files for the live scope', async () => {
      writeFileSync(join(dir, 'tracked.txt'), 'one\ntwo\n');
      writeFileSync(join(dir, 'fresh.txt'), 'new\n');

      const files = await service().diff({worktreePath: dir, scope: 'live'});

      expect(files.map(f => [f.path, f.status])).toEqual([
        ['tracked.txt', 'modified'],
        ['fresh.txt', 'added'],
      ]);
      expect(git('status', '--porcelain').toString()).toContain('?? fresh.txt');
    });

    it('Should return the files a branch committed off its base', async () => {
      git('checkout', '-b', 'feature');
      writeFileSync(join(dir, 'feature.txt'), 'f\n');
      git('add', 'feature.txt');
      git('commit', '-m', 'feature');

      const files = await service().diff({
        worktreePath: dir,
        scope: 'branch',
        base: 'main',
      });

      expect(files.map(f => [f.path, f.status])).toEqual([
        ['feature.txt', 'added'],
      ]);
    });

    it('Should diff the branch against origin/<base> when the remote ref exists', async () => {
      // origin/main is ahead of the local main (a CD bump commit); the feature
      // forks from it, so the local main would make the bump look like branch work.
      git('checkout', '-b', 'feature');
      writeFileSync(join(dir, 'bump.txt'), 'b\n');
      git('add', 'bump.txt');
      git('commit', '-m', 'bump');
      git('update-ref', 'refs/remotes/origin/main', 'feature');
      writeFileSync(join(dir, 'feature.txt'), 'f\n');
      git('add', 'feature.txt');
      git('commit', '-m', 'feature');

      const base = await service().resolveBase(dir, 'main');
      const files = await service().diff({
        worktreePath: dir,
        scope: 'branch',
        base,
      });
      const localFiles = await service().diff({
        worktreePath: dir,
        scope: 'branch',
        base: 'main',
      });

      expect(base).toBe('origin/main');
      expect(files.map(f => f.path)).toEqual(['feature.txt']);
      expect(localFiles.map(f => f.path)).toEqual(['bump.txt', 'feature.txt']);
    });

    it('Should keep the branch as base without a remote ref', async () => {
      expect(await service().resolveBase(dir, 'main')).toBe('main');
    });
  });

  describe('status', () => {
    const git = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=fly-test',
          '-c',
          'user.email=fly-test@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {cwd: dir, stdio: 'pipe'},
      );
    const service = () => new GitCliService(new ExecCommandRunnerService());

    beforeEach(() => {
      git('init', '-b', 'main');
      writeFileSync(join(dir, 'mod.txt'), 'one\n');
      writeFileSync(join(dir, 'old.txt'), 'old\n');
      git('add', 'mod.txt', 'old.txt');
      git('commit', '-m', 'init');
    });

    it('Should flag a modified, an untracked and a renamed file', async () => {
      writeFileSync(join(dir, 'mod.txt'), 'one\ntwo\n');
      writeFileSync(join(dir, 'fresh.txt'), 'new\n');
      git('mv', 'old.txt', 'renamed.txt');

      expect(await service().status(dir)).toEqual({
        'mod.txt': 'M',
        'fresh.txt': 'A',
        'renamed.txt': 'A',
        'old.txt': 'D',
      });
    });

    it('Should return no flags for a clean repo', async () => {
      expect(await service().status(dir)).toEqual({});
    });
  });
});
