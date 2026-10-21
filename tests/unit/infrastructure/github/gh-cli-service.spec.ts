import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {
  GH_AUTH_MESSAGE,
  GH_MERGE_TIMEOUT_MESSAGE,
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
        'number,url,headRefName,state,isDraft,mergeable,reviewDecision,statusCheckRollup,title',
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
        GH_MERGE_TIMEOUT_MESSAGE,
      );
      expect(GH_MERGE_TIMEOUT_MESSAGE).toBe('gh não respondeu em 60 s');
    });

    it('Should propagate other spawn errors unchanged', async () => {
      const error = Object.assign(new Error('x'), {killed: false});
      run.mockImplementation(() => Promise.reject(error));

      await expect(service.merge('/r', 12)).rejects.toBe(error);
    });
  });
});
