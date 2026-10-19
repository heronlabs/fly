import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
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
});
