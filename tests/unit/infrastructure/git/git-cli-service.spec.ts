import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {GIT_TIMEOUT_MESSAGE} from '../../../../src/core/interfaces/vcs-gateway';
import {GitCliService} from '../../../../src/infrastructure/git/git-cli-service';

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
});
