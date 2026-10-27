import {appendFile, mkdir, readFile} from 'node:fs/promises';

import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {GIT_TIMEOUT_MESSAGE} from '../../../../src/core/interfaces/vcs-gateway';
import {GitCliService} from '../../../../src/infrastructure/git/git-cli-service';

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
}));

describe('GitCliService', () => {
  const run = vi.fn();
  const service = new GitCliService({run} as unknown as CommandRunner);

  it('Should run git worktree list --porcelain in the repo and parse it', async () => {
    run.mockResolvedValue({
      code: 0,
      stdout: 'worktree /r\nHEAD abc\nbranch refs/heads/main\n\n',
      stderr: '',
    });

    const result = await service.listWorktrees('/r');

    expect(run).toHaveBeenCalledWith(
      'git',
      ['worktree', 'list', '--porcelain'],
      {cwd: '/r'},
    );
    expect(result).toEqual([
      {path: '/r', head: 'abc', branch: 'main', isMain: true, locked: false},
    ]);
  });

  it('Should throw with the stderr text on non-zero exit', async () => {
    run.mockResolvedValue({
      code: 128,
      stdout: '',
      stderr: 'fatal: not a git repository\n',
    });

    await expect(service.listWorktrees('/r')).rejects.toThrow(
      'fatal: not a git repository',
    );
  });

  it('Should throw a default message when stderr is empty', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: ' '});

    await expect(service.listWorktrees('/r')).rejects.toThrow(
      'git worktree list failed',
    );
  });

  describe('diff', () => {
    const base = [
      '-c',
      'core.quotepath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
    ];
    const options = {cwd: '/w', timeoutMs: 15_000};
    const ok = (stdout: string) => ({code: 0, stdout, stderr: ''});
    const patch = (name: string) =>
      `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`;
    const newFilePatch = (name: string) =>
      `diff --git a/${name} b/${name}\nnew file mode 100644\n--- /dev/null\n+++ b/${name}\n@@ -0,0 +1 @@\n+x\n`;

    beforeEach(() => {
      run.mockReset();
    });

    it('Should diff <base>...HEAD as one argument for the branch scope', async () => {
      run.mockResolvedValue(ok(patch('a.ts')));

      const files = await service.diff({
        worktreePath: '/w',
        scope: 'branch',
        base: 'main',
      });

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        'git',
        [...base, 'main...HEAD'],
        options,
      );
      expect(files.map(f => f.path)).toEqual(['a.ts']);
    });

    it('Should throw git falhou with the trimmed stderr when the branch diff fails', async () => {
      run.mockResolvedValue({code: 128, stdout: '', stderr: 'fatal: bad\n'});

      await expect(
        service.diff({worktreePath: '/w', scope: 'branch', base: 'x'}),
      ).rejects.toThrow('git falhou: fatal: bad');
    });

    it('Should diff HEAD, list untracked files and diff each against /dev/null', async () => {
      run
        .mockResolvedValueOnce(ok(patch('a.ts')))
        .mockResolvedValueOnce(ok('n1.ts\0dir/n2.ts\0'))
        .mockResolvedValueOnce({
          code: 1,
          stdout: newFilePatch('n1.ts'),
          stderr: '',
        })
        .mockResolvedValueOnce({
          code: 1,
          stdout: newFilePatch('dir/n2.ts'),
          stderr: '',
        });

      const files = await service.diff({worktreePath: '/w', scope: 'live'});

      expect(run.mock.calls).toEqual([
        ['git', [...base, 'HEAD'], options],
        ['git', ['ls-files', '--others', '--exclude-standard', '-z'], options],
        ['git', [...base, '--no-index', '--', '/dev/null', 'n1.ts'], options],
        [
          'git',
          [...base, '--no-index', '--', '/dev/null', 'dir/n2.ts'],
          options,
        ],
      ]);
      expect(files.map(f => [f.path, f.status])).toEqual([
        ['a.ts', 'modified'],
        ['n1.ts', 'added'],
        ['dir/n2.ts', 'added'],
      ]);
    });

    it('Should accept exit 0 from --no-index and run none when nothing is untracked', async () => {
      run.mockResolvedValueOnce(ok('')).mockResolvedValueOnce(ok('\0'));
      expect(await service.diff({worktreePath: '/w', scope: 'live'})).toEqual(
        [],
      );
      expect(run).toHaveBeenCalledTimes(2);

      run.mockReset();
      run
        .mockResolvedValueOnce(ok(''))
        .mockResolvedValueOnce(ok('n.ts\0'))
        .mockResolvedValueOnce(ok(newFilePatch('n.ts')));
      const files = await service.diff({worktreePath: '/w', scope: 'live'});
      expect(files.map(f => f.path)).toEqual(['n.ts']);
    });

    it('Should reject exit 1 from diff HEAD', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: ' boom '});

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow('git falhou: boom');
    });

    it('Should throw git falhou when ls-files fails', async () => {
      run
        .mockResolvedValueOnce(ok(''))
        .mockResolvedValueOnce({code: 128, stdout: '', stderr: 'ls bad'});

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow('git falhou: ls bad');
    });

    it('Should reject an exit code above 1 from --no-index', async () => {
      run
        .mockResolvedValueOnce(ok(''))
        .mockResolvedValueOnce(ok('n.ts\0'))
        .mockResolvedValueOnce({code: 2, stdout: '', stderr: 'idx bad'});

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow('git falhou: idx bad');
    });

    it('Should map a killed child to the timeout message', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow(GIT_TIMEOUT_MESSAGE);
      expect(GIT_TIMEOUT_MESSAGE).toBe('git não respondeu em 15 s');
    });

    it('Should prefix other rejections in Portuguese', async () => {
      run.mockRejectedValue(
        Object.assign(new Error('maxBuffer'), {killed: false}),
      );

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow(new Error('git falhou: maxBuffer'));
    });

    it('Should prefix a non-Error rejection by stringifying it', async () => {
      run.mockRejectedValue('spawn git ENOENT');

      await expect(
        service.diff({worktreePath: '/w', scope: 'live'}),
      ).rejects.toThrow(new Error('git falhou: spawn git ENOENT'));
    });
  });

  describe('status', () => {
    const args = [
      '-c',
      'core.quotepath=false',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
    ];

    beforeEach(() => {
      run.mockReset();
    });

    it('Should run git status --porcelain=v1 -z in the worktree and parse it', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: ' M mod.txt\0R  moved.txt\0ren.txt\0?? newdir/a.txt\0',
        stderr: '',
      });

      expect(await service.status('/w')).toEqual({
        'mod.txt': 'M',
        'moved.txt': 'A',
        'ren.txt': 'D',
        'newdir/a.txt': 'A',
      });
      expect(run).toHaveBeenCalledExactlyOnceWith('git', args, {
        cwd: '/w',
        timeoutMs: 15_000,
      });
    });

    it('Should throw git falhou with the trimmed stderr on exit 128', async () => {
      run.mockResolvedValue({
        code: 128,
        stdout: '',
        stderr: 'fatal: not a git repository\n',
      });

      await expect(service.status('/w')).rejects.toThrow(
        new Error('git falhou: fatal: not a git repository'),
      );
    });

    it('Should map a killed child to the timeout message', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.status('/w')).rejects.toThrow(GIT_TIMEOUT_MESSAGE);
    });
  });

  describe('grep', () => {
    const query = {
      text: 'needle',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    };
    const head = [
      'grep',
      '--no-color',
      '--no-column',
      '--no-recurse-submodules',
      '-z',
      '-n',
      '-I',
      '--untracked',
      '--max-count=101',
    ];
    const options = {cwd: '/w', timeoutMs: 15_000};

    beforeEach(() => {
      run.mockReset();
    });

    it('Should grep a literal case-insensitively in the worktree and parse it', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: 'a.ts\x003\x00x needle\n',
        stderr: '',
      });

      const hits = await service.grep({
        worktreePath: '/w',
        query,
        maxPerFile: 101,
      });

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        [...head, '-i', '-F', '-e', 'needle', '--'],
        options,
      );
      expect(hits).toEqual([{path: 'a.ts', line: 3, text: 'x needle'}]);
    });

    it('Should map case, whole word and regex to -i, -w and -E', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      await service.grep({
        worktreePath: '/w',
        query: {...query, caseSensitive: true, wholeWord: true, regex: true},
        maxPerFile: 7,
      });

      expect(run).toHaveBeenCalledWith(
        'git',
        [
          ...head.slice(0, -1),
          '--max-count=7',
          '-w',
          '-E',
          '-e',
          'needle',
          '--',
        ],
        options,
      );
    });

    it('Should pass an option-like query as the pattern', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      await service.grep({
        worktreePath: '/w',
        query: {...query, text: '--untracked; rm -rf /'},
        maxPerFile: 101,
      });

      expect(run.mock.calls[0]?.[1]).toEqual([
        ...head,
        '-i',
        '-F',
        '-e',
        '--untracked; rm -rf /',
        '--',
      ]);
    });

    it('Should return no hits on exit 1', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      expect(
        await service.grep({worktreePath: '/w', query, maxPerFile: 101}),
      ).toEqual([]);
    });

    it('Should throw git falhou with the stderr on exit 128', async () => {
      run.mockResolvedValue({
        code: 128,
        stdout: '',
        stderr: "fatal: command line, '(': Unmatched ( or \\(\n",
      });

      await expect(
        service.grep({worktreePath: '/w', query, maxPerFile: 101}),
      ).rejects.toThrow(
        new Error("git falhou: fatal: command line, '(': Unmatched ( or \\("),
      );
    });

    it('Should map a killed child to the timeout message', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(
        service.grep({worktreePath: '/w', query, maxPerFile: 101}),
      ).rejects.toThrow(GIT_TIMEOUT_MESSAGE);
    });
  });

  describe('resolveBase', () => {
    beforeEach(() => {
      run.mockReset();
    });

    it('Should return origin/<branch> when the remote-tracking ref exists', async () => {
      run.mockResolvedValue({code: 0, stdout: 'abc\n', stderr: ''});

      expect(await service.resolveBase('/w', 'main')).toBe('origin/main');
      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'],
        {cwd: '/w', timeoutMs: 15_000},
      );
    });

    it('Should fall back to the branch when the remote ref is missing', async () => {
      run.mockResolvedValue({code: 128, stdout: '', stderr: ''});

      expect(await service.resolveBase('/w', 'x')).toBe('x');
    });

    it('Should map a killed child to the timeout message', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.resolveBase('/w', 'main')).rejects.toThrow(
        GIT_TIMEOUT_MESSAGE,
      );
    });
  });

  describe('task start commands', () => {
    const ok = (stdout = '') => ({code: 0, stdout, stderr: ''});
    const fail = (stderr = '', code = 128) => ({code, stdout: '', stderr});

    beforeEach(() => {
      run.mockReset();
      vi.mocked(appendFile).mockReset();
      vi.mocked(mkdir).mockReset();
      vi.mocked(readFile).mockReset().mockRejectedValue(new Error('ENOENT'));
    });

    it('Should read the default branch from origin/HEAD', async () => {
      run.mockResolvedValue(ok('origin/main\n'));

      expect(await service.defaultBranch('/r')).toBe('main');
      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should keep slashes of the branch after origin/', async () => {
      run.mockResolvedValue(ok('origin/release/1\n'));

      expect(await service.defaultBranch('/r')).toBe('release/1');

      run.mockResolvedValue(ok('fork/origin/x\n'));

      expect(await service.defaultBranch('/r')).toBe('fork/origin/x');
    });

    it('Should return null when origin/HEAD is unset', async () => {
      run.mockResolvedValue(fail('fatal: not a symbolic ref'));

      expect(await service.defaultBranch('/r')).toBeNull();
    });

    it('Should fetch the branch from origin with a 60 s timeout', async () => {
      run.mockResolvedValue(ok());

      await service.fetch('/r', 'trunk');

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['fetch', 'origin', 'trunk'],
        {cwd: '/r', timeoutMs: 60_000},
      );
    });

    it('Should report a missing origin when remote get-url fails', async () => {
      run
        .mockResolvedValueOnce(fail('localized failure\n'))
        .mockResolvedValueOnce(fail('no such remote', 2));

      await expect(service.fetch('/r', 'trunk')).rejects.toThrow(
        'Repositório sem remote origin',
      );
      expect(run).toHaveBeenNthCalledWith(
        2,
        'git',
        ['remote', 'get-url', 'origin'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should report the fetch stderr when origin exists', async () => {
      run
        .mockResolvedValueOnce(fail('  fatal: unreachable \n'))
        .mockResolvedValueOnce(ok('git@example.com:x/y.git\n'));

      await expect(service.fetch('/r', 'trunk')).rejects.toThrow(
        /^git fetch falhou: fatal: unreachable$/,
      );
    });

    it('Should report a killed fetch as a 60 s timeout', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.fetch('/r', 'trunk')).rejects.toThrow(
        'git não respondeu em 60 s',
      );
    });

    it('Should validate a branch name with check-ref-format', async () => {
      run.mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail('', 1));

      expect(await service.validBranchName('/r', 'feat-x')).toBe(true);
      expect(await service.validBranchName('/r', 'a..b')).toBe(false);
      expect(run).toHaveBeenNthCalledWith(
        1,
        'git',
        ['check-ref-format', '--branch', 'feat-x'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should check a local branch with show-ref', async () => {
      run.mockResolvedValueOnce(ok()).mockResolvedValueOnce(fail('', 1));

      expect(await service.branchExists('/r', 'feat-x')).toBe(true);
      expect(await service.branchExists('/r', 'nope')).toBe(false);
      expect(run).toHaveBeenNthCalledWith(
        1,
        'git',
        ['show-ref', '--verify', '--quiet', 'refs/heads/feat-x'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should add a worktree without tracking, with a 30 s timeout', async () => {
      run.mockResolvedValue(ok());

      await service.addWorktree({
        repoPath: '/r',
        path: '/r/.worktrees/feat-x',
        branch: 'feat-x',
        base: 'origin/trunk',
      });

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        [
          'worktree',
          'add',
          '--no-track',
          '-b',
          'feat-x',
          '/r/.worktrees/feat-x',
          'origin/trunk',
        ],
        {cwd: '/r', timeoutMs: 30_000},
      );
    });

    it('Should reject addWorktree with git falhou and the stderr', async () => {
      run.mockResolvedValue(fail('  fatal: exists\n'));

      await expect(
        service.addWorktree({
          repoPath: '/r',
          path: '/p',
          branch: 'b',
          base: 'origin/t',
        }),
      ).rejects.toThrow(/^git falhou: fatal: exists$/);
    });

    it('Should not write when the entry is already ignored', async () => {
      run.mockResolvedValue(ok());

      await service.ensureIgnored('/r', '.worktrees');

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['check-ignore', '-q', '.worktrees'],
        {cwd: '/r', timeoutMs: 15_000},
      );
      expect(appendFile).not.toHaveBeenCalled();
    });

    it('Should append the entry to the common-dir exclude when not ignored', async () => {
      run
        .mockResolvedValueOnce(fail('', 1))
        .mockResolvedValueOnce(ok('.git\n'));

      await service.ensureIgnored('/r', '.worktrees');

      expect(mkdir).toHaveBeenCalledExactlyOnceWith('/r/.git/info', {
        recursive: true,
      });
      expect(readFile).toHaveBeenCalledExactlyOnceWith(
        '/r/.git/info/exclude',
        'utf8',
      );

      expect(run).toHaveBeenNthCalledWith(
        2,
        'git',
        ['rev-parse', '--git-common-dir'],
        {cwd: '/r', timeoutMs: 15_000},
      );
      expect(appendFile).toHaveBeenCalledExactlyOnceWith(
        '/r/.git/info/exclude',
        '/.worktrees/\n',
      );
    });

    it('Should start a new line when the exclude file lacks a trailing newline', async () => {
      run
        .mockResolvedValueOnce(fail('', 1))
        .mockResolvedValueOnce(ok('.git\n'));
      vi.mocked(readFile).mockResolvedValue('foo');

      await service.ensureIgnored('/r', '.worktrees');

      expect(appendFile).toHaveBeenCalledExactlyOnceWith(
        '/r/.git/info/exclude',
        '\n/.worktrees/\n',
      );
    });

    it('Should not add a blank line when the exclude file ends with a newline', async () => {
      run
        .mockResolvedValueOnce(fail('', 1))
        .mockResolvedValueOnce(ok('.git\n'));
      vi.mocked(readFile).mockResolvedValue('foo\n');

      await service.ensureIgnored('/r', '.worktrees');

      expect(appendFile).toHaveBeenCalledExactlyOnceWith(
        '/r/.git/info/exclude',
        '/.worktrees/\n',
      );
    });

    it('Should keep an absolute common dir as it is', async () => {
      run
        .mockResolvedValueOnce(fail('', 1))
        .mockResolvedValueOnce(ok('/main/.git\n'));

      await service.ensureIgnored('/r', '.worktrees');

      expect(appendFile).toHaveBeenCalledExactlyOnceWith(
        '/main/.git/info/exclude',
        '/.worktrees/\n',
      );
    });

    it('Should remove a worktree without --force within 30 s', async () => {
      run.mockResolvedValue(ok());

      await service.removeWorktree('/r', '/r/.worktrees/x');

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['worktree', 'remove', '/r/.worktrees/x'],
        {cwd: '/r', timeoutMs: 30_000},
      );
    });

    it("Should reject removeWorktree with git's own message", async () => {
      run.mockResolvedValue(fail(" fatal: 'x' contains modified files\n"));

      await expect(service.removeWorktree('/r', '/x')).rejects.toThrow(
        new Error("fatal: 'x' contains modified files"),
      );
    });

    it('Should force-delete a local branch within 15 s', async () => {
      run.mockResolvedValue(ok());

      await service.deleteBranch('/r', 'feat-x');

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['branch', '-D', 'feat-x'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it("Should reject deleteBranch with git's message", async () => {
      run.mockResolvedValue(fail('error: not found\n'));

      await expect(service.deleteBranch('/r', 'x')).rejects.toThrow(
        new Error('error: not found'),
      );
    });

    it('Should delete the remote branch within 60 s', async () => {
      run.mockResolvedValue(ok());

      await service.deleteRemoteBranch('/r', 'feat-x');

      expect(run).toHaveBeenCalledExactlyOnceWith(
        'git',
        ['push', 'origin', '--delete', 'feat-x'],
        {cwd: '/r', timeoutMs: 60_000},
      );
    });

    it('Should count a remote branch that is already gone as deleted', async () => {
      run.mockResolvedValue(
        fail("error: unable to delete 'x': remote ref does not exist\n"),
      );

      await expect(
        service.deleteRemoteBranch('/r', 'x'),
      ).resolves.toBeUndefined();
    });

    it("Should reject deleteRemoteBranch with git's other messages", async () => {
      run.mockResolvedValue(fail('fatal: Authentication failed\n'));

      await expect(service.deleteRemoteBranch('/r', 'x')).rejects.toThrow(
        new Error('fatal: Authentication failed'),
      );
    });

    it('Should fail ensureIgnored when the common dir cannot be read', async () => {
      run
        .mockResolvedValueOnce(fail('', 1))
        .mockResolvedValueOnce(fail('boom'));

      await expect(service.ensureIgnored('/r', '.worktrees')).rejects.toThrow(
        'git falhou: boom',
      );
      expect(appendFile).not.toHaveBeenCalled();
    });
  });
});
