import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {
  GH_AUTH_MESSAGE,
  GH_RERUN_TIMEOUT_MESSAGE,
  GH_SLOW_TIMEOUT_MESSAGE,
  GH_TIMEOUT_MESSAGE,
} from '../../../../src/core/interfaces/pr-gateway';
import {GhCliService} from '../../../../src/infrastructure/github/gh-cli-service';

describe('GhCliService', () => {
  const run = vi.fn();
  const service = new GhCliService({run} as unknown as CommandRunner);

  it('Should run gh pr list in the repo with a 15 s timeout and parse it', async () => {
    run.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify([
        {
          number: 1,
          url: 'u',
          headRefName: 'b',
          state: 'OPEN',
          isDraft: true,
          mergeable: 'CONFLICTING',
          reviewDecision: '',
          statusCheckRollup: [],
        },
      ]),
      stderr: '',
    });

    const result = await service.list('/r');

    expect(run).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'all',
        '--limit',
        '50',
        '--json',
        'number,url,headRefName,isCrossRepository,state,isDraft,mergeable,reviewDecision,statusCheckRollup,title,headRefOid,mergeStateStatus',
      ],
      {cwd: '/r', timeoutMs: 15_000},
    );
    expect(result).toEqual([
      {
        number: 1,
        url: 'u',
        branch: 'b',
        state: 'open',
        draft: true,
        mergeable: 'conflicting',
        review: 'none',
        checks: 'none',
        title: '',
        checkRuns: [],
        headSha: null,
        behind: false,
      },
    ]);
  });

  it('Should throw the auth message when gh is not authenticated', async () => {
    run.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'To get started with GitHub CLI, please run:  gh auth login',
    });

    await expect(service.list('/r')).rejects.toThrow(GH_AUTH_MESSAGE);
  });

  it('Should throw the stderr text on other failures', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: 'boom\n'});

    await expect(service.list('/r')).rejects.toThrow(/^boom$/);
  });

  it('Should throw a default message when stderr is empty', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

    await expect(service.list('/r')).rejects.toThrow('gh pr list failed');
  });

  it('Should propagate a spawn error unchanged', async () => {
    const error = Object.assign(new Error('spawn gh ENOENT'), {
      code: 'ENOENT',
    });
    run.mockImplementation(() => Promise.reject(error));

    await expect(service.list('/r')).rejects.toBe(error);
  });

  it('Should throw the timeout message when gh was killed by the timeout', async () => {
    const error = Object.assign(new Error('Command failed'), {
      killed: true,
      code: null,
    });
    run.mockImplementation(() => Promise.reject(error));

    await expect(service.list('/r')).rejects.toThrow(GH_TIMEOUT_MESSAGE);
    expect(GH_TIMEOUT_MESSAGE).toBe('gh não respondeu em 15 s');
  });

  it.each([
    'no git remotes found',
    'none of the git remotes configured for this repository point to a known GitHub host. To tell gh about a new GitHub host, please use `gh auth login`',
  ])(
    'Should return no PRs for a repo without a GitHub remote: %s',
    async stderr => {
      run.mockResolvedValue({code: 1, stdout: '', stderr});

      expect(await service.list('/r')).toEqual([]);
    },
  );

  describe('merge', () => {
    it('Should run gh pr merge in the repo with a 60 s timeout', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      await expect(service.merge('/r', 12)).resolves.toBeUndefined();

      expect(run).toHaveBeenCalledWith('gh', ['pr', 'merge', '12', '--merge'], {
        cwd: '/r',
        timeoutMs: 60_000,
      });
    });

    it('Should throw the trimmed stderr when gh fails', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: 'not mergeable\n'});

      await expect(service.merge('/r', 12)).rejects.toThrow(/^not mergeable$/);
    });

    it('Should throw a default message when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ' '});

      await expect(service.merge('/r', 12)).rejects.toThrow(
        'gh pr merge failed',
      );
    });

    it('Should throw the 60 s timeout message when gh was killed', async () => {
      run.mockImplementation(() =>
        Promise.reject(Object.assign(new Error('x'), {killed: true})),
      );

      await expect(service.merge('/r', 12)).rejects.toThrow(
        GH_SLOW_TIMEOUT_MESSAGE,
      );
      expect(GH_SLOW_TIMEOUT_MESSAGE).toBe('gh não respondeu em 60 s');
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = Object.assign(new Error('x'), {killed: false});
      run.mockImplementation(() => Promise.reject(error));

      await expect(service.merge('/r', 12)).rejects.toBe(error);
    });
  });

  describe('defaultBranch', () => {
    beforeEach(() => {
      run.mockReset();
    });

    it('Should ask gh for the default branch name', async () => {
      run.mockResolvedValue({code: 0, stdout: 'main\n', stderr: ''});

      expect(await service.defaultBranch('/r')).toBe('main');
      expect(run).toHaveBeenCalledExactlyOnceWith(
        'gh',
        [
          'repo',
          'view',
          '--json',
          'defaultBranchRef',
          '-q',
          '.defaultBranchRef.name',
        ],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should reject on empty output', async () => {
      run.mockResolvedValue({code: 0, stdout: '\n', stderr: ''});

      await expect(service.defaultBranch('/r')).rejects.toThrow(
        'Não foi possível descobrir o branch padrão',
      );
    });

    it('Should reject on a non-zero exit', async () => {
      run.mockResolvedValue({code: 1, stdout: 'main\n', stderr: 'x'});

      await expect(service.defaultBranch('/r')).rejects.toThrow(
        'Não foi possível descobrir o branch padrão',
      );
    });

    it('Should throw the timeout message when gh was killed', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.defaultBranch('/r')).rejects.toThrow(
        GH_TIMEOUT_MESSAGE,
      );
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = new Error('x');
      run.mockRejectedValue(error);

      await expect(service.defaultBranch('/r')).rejects.toBe(error);
    });
  });

  describe('create', () => {
    const input = {
      cwd: '/w',
      title: 't',
      bodyFile: '/u/tasks/t/pr-body.md',
      base: 'main',
      head: 'feat-x',
    };

    it('Should run gh pr create and parse the URL it prints', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: 'https://github.com/o/r/pull/42\n',
        stderr: '',
      });

      const result = await service.create(input);

      expect(run).toHaveBeenCalledWith(
        'gh',
        [
          'pr',
          'create',
          '--title',
          't',
          '--body-file',
          '/u/tasks/t/pr-body.md',
          '--base',
          'main',
          '--head',
          'feat-x',
        ],
        {cwd: '/w', timeoutMs: 60_000},
      );
      expect(result).toEqual({
        number: 42,
        url: 'https://github.com/o/r/pull/42',
      });
    });

    it('Should reject with stderr on a non-zero exit', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: 'boom\n'});

      await expect(service.create(input)).rejects.toMatchObject({
        message: 'gh pr create falhou: boom',
      });
    });

    it('Should reject with stdout when it has no pull URL', async () => {
      run.mockResolvedValue({code: 0, stdout: 'nothing here\n', stderr: ''});

      await expect(service.create(input)).rejects.toMatchObject({
        message: 'gh pr create falhou: nothing here',
      });
    });

    it('Should reject when the pull URL is not at the end of stdout', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: 'https://github.com/o/r/pull/42/files\n',
        stderr: '',
      });

      await expect(service.create(input)).rejects.toThrow(
        'gh pr create falhou: https://github.com/o/r/pull/42/files',
      );
    });

    it('Should reject a failed exit even when stdout has a pull URL', async () => {
      run.mockResolvedValue({
        code: 1,
        stdout: 'https://github.com/o/r/pull/42\n',
        stderr: 'late\n',
      });

      await expect(service.create(input)).rejects.toThrow(
        'gh pr create falhou: late',
      );
    });

    it('Should throw the 60 s timeout message when gh was killed', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.create(input)).rejects.toThrow(
        GH_SLOW_TIMEOUT_MESSAGE,
      );
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = new Error('x');
      run.mockRejectedValue(error);

      await expect(service.create(input)).rejects.toBe(error);
    });
  });

  describe('failedLog', () => {
    beforeEach(() => {
      run.mockReset();
    });

    it('Should read the failed log of the job with a 60 s timeout', async () => {
      run.mockResolvedValue({code: 0, stdout: 'a\nb\n', stderr: ''});

      expect(await service.failedLog('/r', '121586961078')).toBe('a\nb\n');
      expect(run).toHaveBeenCalledExactlyOnceWith(
        'gh',
        ['run', 'view', '--job', '121586961078', '--log-failed'],
        {cwd: '/r', timeoutMs: 60_000},
      );
    });

    it('Should return null when gh has no log for the job', async () => {
      run.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'log not found: 121586961078\n',
      });

      expect(await service.failedLog('/r', '121586961078')).toBeNull();
    });

    it('Should return null on empty output', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      expect(await service.failedLog('/r', '1')).toBeNull();
    });

    it('Should reject with the trimmed stderr on any other failure', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: 'HTTP 401\n'});

      await expect(service.failedLog('/r', '1')).rejects.toThrow(/^HTTP 401$/);
    });

    it('Should reject with a default message when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ' '});

      await expect(service.failedLog('/r', '1')).rejects.toThrow(
        'gh run view failed',
      );
    });

    it('Should reject with the 60 s timeout message when gh was killed', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.failedLog('/r', '1')).rejects.toThrow(
        GH_SLOW_TIMEOUT_MESSAGE,
      );
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = new Error('x');
      run.mockRejectedValue(error);

      await expect(service.failedLog('/r', '1')).rejects.toBe(error);
    });
  });

  describe('rerun', () => {
    beforeEach(() => {
      run.mockReset();
    });

    it('Should rerun the failed jobs of the run with a 30 s timeout', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      await expect(service.rerun('/r', '40097015929')).resolves.toBeUndefined();
      expect(run).toHaveBeenCalledExactlyOnceWith(
        'gh',
        ['run', 'rerun', '40097015929', '--failed'],
        {cwd: '/r', timeoutMs: 30_000},
      );
    });

    it('Should reject with the trimmed stderr on a non-zero exit', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: 'nope\n'});

      await expect(service.rerun('/r', '1')).rejects.toThrow(/^nope$/);
    });

    it('Should reject with a default message when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      await expect(service.rerun('/r', '1')).rejects.toThrow(
        'gh run rerun failed',
      );
    });

    it('Should reject with the 30 s timeout message when gh was killed', async () => {
      run.mockRejectedValue(Object.assign(new Error('x'), {killed: true}));

      await expect(service.rerun('/r', '1')).rejects.toThrow(
        GH_RERUN_TIMEOUT_MESSAGE,
      );
      expect(GH_RERUN_TIMEOUT_MESSAGE).toBe('gh não respondeu em 30 s');
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = new Error('x');
      run.mockRejectedValue(error);

      await expect(service.rerun('/r', '1')).rejects.toBe(error);
    });
  });

  describe('reviewComments', () => {
    const view = {
      reviews: [
        {
          id: 'PRR_1',
          author: {login: 'rev'},
          body: 'review body',
          submittedAt: '2026-10-27T10:00:00Z',
          url: 'https://github.com/o/r/pull/42#pullrequestreview-1',
        },
      ],
      comments: [
        {
          id: 'IC_1',
          author: {login: 'talker'},
          body: 'conversation',
          createdAt: '2026-10-27T09:00:00Z',
          url: 'https://github.com/o/r/pull/42#issuecomment-1',
        },
      ],
    };
    const lines = [
      {
        id: 555,
        user: {login: 'liner'},
        body: 'line comment',
        path: 'src/a.ts',
        line: 7,
        original_line: 3,
        html_url: 'https://github.com/o/r/pull/42#discussion_r555',
        created_at: '2026-10-27T11:00:00Z',
      },
    ];

    beforeEach(() => {
      run.mockReset();
    });

    const reply = (first: string, second: string) => {
      run
        .mockResolvedValueOnce({code: 0, stdout: first, stderr: ''})
        .mockResolvedValueOnce({code: 0, stdout: second, stderr: ''});
    };

    it('Should call gh pr view and gh api in the repo with a 15 s timeout', async () => {
      reply('{}', '[]');

      await service.reviewComments('/r', 42);

      expect(run).toHaveBeenNthCalledWith(
        1,
        'gh',
        ['pr', 'view', '42', '--json', 'reviews,comments,url'],
        {cwd: '/r', timeoutMs: 15_000},
      );
      expect(run).toHaveBeenNthCalledWith(
        2,
        'gh',
        ['api', 'repos/{owner}/{repo}/pulls/42/comments?per_page=100'],
        {cwd: '/r', timeoutMs: 15_000},
      );
    });

    it('Should merge both sources sorted by createdAt', async () => {
      reply(JSON.stringify(view), JSON.stringify(lines));

      expect(await service.reviewComments('/r', 42)).toEqual([
        {
          id: 'IC_1',
          author: 'talker',
          body: 'conversation',
          path: null,
          line: null,
          url: 'https://github.com/o/r/pull/42#issuecomment-1',
          createdAt: Date.parse('2026-10-27T09:00:00Z'),
        },
        {
          id: 'PRR_1',
          author: 'rev',
          body: 'review body',
          path: null,
          line: null,
          url: 'https://github.com/o/r/pull/42#pullrequestreview-1',
          createdAt: Date.parse('2026-10-27T10:00:00Z'),
        },
        {
          id: '555',
          author: 'liner',
          body: 'line comment',
          path: 'src/a.ts',
          line: 7,
          url: 'https://github.com/o/r/pull/42#discussion_r555',
          createdAt: Date.parse('2026-10-27T11:00:00Z'),
        },
      ]);
    });

    it.each([
      ['{', '[]'],
      ['{}', '{'],
      ['[]', '[]'],
      ['{}', '{}'],
      ['null', '[]'],
      ['{}', 'null'],
    ])('Should reject unexpected JSON (%s, %s)', async (first, second) => {
      reply(first, second);

      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        /^Resposta inesperada do GitHub$/,
      );
    });

    it('Should reject with the trimmed stderr when a call fails', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: 'boom\n'});

      await expect(service.reviewComments('/r', 42)).rejects.toThrow(/^boom$/);
      expect(run).toHaveBeenCalledOnce();
    });

    it('Should reject with the trimmed stderr when the api call fails', async () => {
      run
        .mockResolvedValueOnce({code: 0, stdout: '{}', stderr: ''})
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'api boom\n'});

      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        /^api boom$/,
      );
    });

    it('Should reject with a default message when stderr is empty', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});
      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        'gh pr view failed',
      );

      run
        .mockResolvedValueOnce({code: 0, stdout: '{}', stderr: ''})
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});
      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        'gh api failed',
      );
    });

    it('Should reject with the 15 s timeout message when gh was killed', async () => {
      run.mockRejectedValueOnce(Object.assign(new Error('x'), {killed: true}));
      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        GH_TIMEOUT_MESSAGE,
      );

      run
        .mockResolvedValueOnce({code: 0, stdout: '{}', stderr: ''})
        .mockRejectedValueOnce(Object.assign(new Error('x'), {killed: true}));
      await expect(service.reviewComments('/r', 42)).rejects.toThrow(
        GH_TIMEOUT_MESSAGE,
      );
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = new Error('x');
      run.mockRejectedValueOnce(error);

      await expect(service.reviewComments('/r', 42)).rejects.toBe(error);
    });
  });
});
