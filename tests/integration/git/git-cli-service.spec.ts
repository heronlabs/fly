import {execFileSync} from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

  describe('grep', () => {
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
    const query = {
      text: 'needle',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    };
    const grep = (over: Partial<typeof query> = {}, maxPerFile = 101) =>
      new GitCliService(new ExecCommandRunnerService()).grep({
        worktreePath: dir,
        query: {...query, ...over},
        maxPerFile,
      });

    beforeEach(() => {
      git('init', '-b', 'main');
      mkdirSync(join(dir, 'sp ace'));
      writeFileSync(join(dir, 'a.txt'), 'one needle\nNeedle two\r\nneedles\n');
      writeFileSync(join(dir, 'sp ace', 'b c.txt'), 'x needle\n');
      writeFileSync(join(dir, 'bin.dat'), 'needle\0binary\n');
      writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n');
      git('add', '.');
      git('commit', '-m', 'init');
      writeFileSync(join(dir, 'ignored.txt'), 'needle\n');
      writeFileSync(join(dir, 'fresh.txt'), 'new needle\n');
    });

    it('Should find tracked and untracked text files, never ignored or binary ones', async () => {
      expect(await grep()).toEqual([
        {path: 'a.txt', line: 1, text: 'one needle'},
        {path: 'a.txt', line: 2, text: 'Needle two'},
        {path: 'a.txt', line: 3, text: 'needles'},
        {path: 'fresh.txt', line: 1, text: 'new needle'},
        {path: 'sp ace/b c.txt', line: 1, text: 'x needle'},
      ]);
    });

    it('Should honour case, whole word, regex and the per-file cap', async () => {
      expect(
        (await grep({caseSensitive: true})).map(h => h.text),
      ).not.toContain('Needle two');
      expect((await grep({wholeWord: true})).map(h => h.text)).not.toContain(
        'needles',
      );
      expect(await grep({text: '^n.+s$', regex: true})).toEqual([
        {path: 'a.txt', line: 3, text: 'needles'},
      ]);
      expect((await grep({}, 1)).filter(h => h.path === 'a.txt')).toHaveLength(
        1,
      );
    });

    it('Should treat regex characters literally without the regex flag', async () => {
      writeFileSync(join(dir, 'fresh.txt'), 'a.b\naxb\n');

      expect(await grep({text: 'a.b'})).toEqual([
        {path: 'fresh.txt', line: 1, text: 'a.b'},
      ]);
    });

    it('Should return no hits when nothing matches', async () => {
      expect(await grep({text: 'absent'})).toEqual([]);
    });

    it('Should search despite submodule.recurse, which refuses --untracked', async () => {
      git('config', 'submodule.recurse', 'true');

      expect((await grep()).map(h => h.path)).toContain('fresh.txt');
    });

    it('Should keep a newline inside a file name', async () => {
      writeFileSync(join(dir, 'new\nline.txt'), 'needle\n');

      expect(await grep()).toContainEqual({
        path: 'new\nline.txt',
        line: 1,
        text: 'needle',
      });
    });

    it('Should reject an invalid regex with git falhou', async () => {
      await expect(grep({text: '(', regex: true})).rejects.toThrow(
        /^git falhou: /,
      );
    });
  });

  describe('task start', () => {
    const git = (cwd: string, ...args: string[]) =>
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
        {cwd, stdio: 'pipe', encoding: 'utf8'},
      );
    const service = new GitCliService(new ExecCommandRunnerService());
    let origin: string;
    let clone: string;

    beforeEach(() => {
      origin = join(dir, 'origin.git');
      const seed = join(dir, 'seed');
      clone = join(dir, 'clone');
      mkdirSync(seed);
      git(dir, 'init', '--bare', '-b', 'trunk', origin);
      git(seed, 'init', '-b', 'trunk');
      git(seed, 'commit', '--allow-empty', '-m', 'one');
      git(seed, 'remote', 'add', 'origin', origin);
      git(seed, 'push', 'origin', 'trunk');
      git(dir, 'clone', origin, clone);
    });

    it('Should find the default branch, or null once origin/HEAD is gone', async () => {
      expect(await service.defaultBranch(clone)).toBe('trunk');

      git(clone, 'remote', 'set-head', 'origin', '-d');

      expect(await service.defaultBranch(clone)).toBeNull();
    });

    it('Should fetch new commits from origin', async () => {
      const other = join(dir, 'other');
      git(dir, 'clone', origin, other);
      git(other, 'commit', '--allow-empty', '-m', 'two');
      git(other, 'push', 'origin', 'trunk');
      const before = git(clone, 'rev-parse', 'origin/trunk');

      await service.fetch(clone, 'trunk');

      const after = git(clone, 'rev-parse', 'origin/trunk');
      expect(after).not.toBe(before);
      expect(after).toBe(git(origin, 'rev-parse', 'trunk'));
    });

    it('Should reject fetch without a remote origin', async () => {
      git(clone, 'remote', 'remove', 'origin');

      await expect(service.fetch(clone, 'trunk')).rejects.toThrow(
        'Repositório sem remote origin',
      );
    });

    it('Should reject fetch when origin is unreachable', async () => {
      git(clone, 'remote', 'set-url', 'origin', join(dir, 'missing.git'));

      await expect(service.fetch(clone, 'trunk')).rejects.toThrow(
        /^git fetch falhou: /,
      );
    });

    it('Should validate branch names', async () => {
      expect(await service.validBranchName(clone, 'feat-x')).toBe(true);
      expect(await service.validBranchName(clone, 'a..b')).toBe(false);
      expect(await service.validBranchName(clone, '-x')).toBe(false);
      expect(await service.validBranchName(clone, 'x y')).toBe(false);
    });

    it('Should tell whether a local branch exists', async () => {
      expect(await service.branchExists(clone, 'trunk')).toBe(true);
      expect(await service.branchExists(clone, 'nope')).toBe(false);
    });

    it('Should read HEAD and count commits ahead of a ref', async () => {
      expect(await service.headSha(clone)).toBe(
        git(clone, 'rev-parse', 'HEAD').trim(),
      );
      expect(await service.aheadCount(clone, 'origin/trunk')).toBe(0);

      git(clone, 'commit', '--allow-empty', '-m', 'a');
      git(clone, 'commit', '--allow-empty', '-m', 'b');

      expect(await service.aheadCount(clone, 'origin/trunk')).toBe(2);
      expect(await service.headSha(clone)).toBe(
        git(clone, 'rev-parse', 'HEAD').trim(),
      );
    });

    it('Should reject aheadCount for an unknown ref', async () => {
      await expect(service.aheadCount(clone, 'origin/nope')).rejects.toThrow(
        /^git falhou: /,
      );
    });

    it('Should push a new branch and set its upstream', async () => {
      git(clone, 'checkout', '--no-track', '-b', 'feat-x');
      git(clone, 'commit', '--allow-empty', '-m', 'a');

      await service.push(clone, 'feat-x');

      expect(git(origin, 'rev-parse', 'refs/heads/feat-x')).toBe(
        git(clone, 'rev-parse', 'HEAD'),
      );
      expect(git(clone, 'rev-parse', '--abbrev-ref', '@{u}').trim()).toBe(
        'origin/feat-x',
      );
    });

    it('Should reject a push origin refuses as non-fast-forward', async () => {
      git(clone, 'checkout', '--no-track', '-b', 'feat-x');
      git(clone, 'commit', '--allow-empty', '-m', 'a');
      await service.push(clone, 'feat-x');
      const other = join(dir, 'other');
      git(dir, 'clone', origin, other);
      git(other, 'checkout', 'feat-x');
      git(other, 'commit', '--allow-empty', '-m', 'moved');
      git(other, 'push', 'origin', 'feat-x');
      git(clone, 'commit', '--allow-empty', '-m', 'b');

      await expect(service.push(clone, 'feat-x')).rejects.toThrow(
        /^git push falhou: \S.*\S$/s,
      );
    });

    it('Should add an untracked worktree at the base and ignore the folder', async () => {
      const head = git(clone, 'rev-parse', 'HEAD');
      const path = join(clone, '.worktrees', 'feat-x');

      await service.addWorktree({
        repoPath: clone,
        path,
        branch: 'feat-x',
        base: 'origin/trunk',
      });

      expect(git(path, 'rev-parse', 'HEAD')).toBe(
        git(clone, 'rev-parse', 'origin/trunk'),
      );
      expect(() => git(path, 'rev-parse', '--abbrev-ref', '@{u}')).toThrow();
      expect(git(clone, 'rev-parse', 'HEAD')).toBe(head);

      // The folder exists now, so a dir-only pattern can match it.
      const exclude = join(clone, '.git', 'info', 'exclude');
      await service.ensureIgnored(clone, '.worktrees');
      await service.ensureIgnored(clone, '.worktrees');
      expect(readFileSync(exclude, 'utf8')).toMatch(/\n\/\.worktrees\/\n$/);
      expect(readFileSync(exclude, 'utf8').split('/.worktrees/')).toHaveLength(
        2,
      );
      expect(git(clone, 'status', '--porcelain')).toBe('');
    });

    it('Should leave exclude untouched when .gitignore covers the folder', async () => {
      // The .worktrees folder exists, as it does once addWorktree has run.
      mkdirSync(join(clone, '.worktrees'));
      writeFileSync(join(clone, '.gitignore'), '.worktrees/\n');
      const exclude = join(clone, '.git', 'info', 'exclude');
      const before = readFileSync(exclude, 'utf8');

      await service.ensureIgnored(clone, '.worktrees');

      expect(readFileSync(exclude, 'utf8')).toBe(before);
    });

    it('Should start a new line after an exclude file without a trailing newline', async () => {
      const exclude = join(clone, '.git', 'info', 'exclude');
      writeFileSync(exclude, 'foo');
      mkdirSync(join(clone, '.worktrees'));

      await service.ensureIgnored(clone, '.worktrees');

      expect(readFileSync(exclude, 'utf8')).toBe('foo\n/.worktrees/\n');
    });

    it('Should create info/exclude when the repo has no info directory', async () => {
      const bare = join(dir, 'notemplate');
      const empty = join(dir, 'empty-template');
      mkdirSync(empty);
      mkdirSync(bare);
      git(bare, 'init', '-b', 'main', `--template=${empty}`);
      mkdirSync(join(bare, '.worktrees'));

      await service.ensureIgnored(bare, '.worktrees');

      expect(readFileSync(join(bare, '.git', 'info', 'exclude'), 'utf8')).toBe(
        '/.worktrees/\n',
      );
    });

    it('Should write to the shared exclude from a linked worktree', async () => {
      const path = join(clone, '.worktrees', 'feat-y');
      await service.addWorktree({
        repoPath: clone,
        path,
        branch: 'feat-y',
        base: 'origin/trunk',
      });

      await service.ensureIgnored(path, 'scratch');

      expect(
        readFileSync(join(clone, '.git', 'info', 'exclude'), 'utf8'),
      ).toContain('/scratch/\n');
    });
  });
});
