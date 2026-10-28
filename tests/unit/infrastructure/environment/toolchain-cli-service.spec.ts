import {ToolId} from '../../../../src/core/domain/setup';
import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {ToolchainCliService} from '../../../../src/infrastructure/environment/toolchain-cli-service';

describe('ToolchainCliService', () => {
  const run = vi.fn();
  const service = new ToolchainCliService({run} as unknown as CommandRunner);

  beforeEach(() => {
    run.mockReset();
  });

  it.each<[ToolId, string[], string, string]>([
    ['git', ['--version'], 'git version 2.54.0\n', '2.54.0'],
    [
      'gh',
      ['--version'],
      'gh version 2.92.0 (2026-10-01)\nhttps://x\n',
      '2.92.0',
    ],
    ['tmux', ['-V'], 'tmux 3.5a\n', '3.5a'],
    ['claude', ['--version'], '2.1.310 (Claude Code)\n', '2.1.310'],
  ])(
    'Should probe %s and read its version',
    async (tool, args, stdout, version) => {
      run.mockResolvedValue({code: 0, stdout, stderr: ''});

      expect(await service.version(tool)).toBe(version);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(tool, args, {timeoutMs: 10_000});
    },
  );

  it('Should return null when the binary cannot be spawned', async () => {
    run.mockRejectedValue(new Error('spawn git ENOENT'));

    expect(await service.version('git')).toBeNull();
  });

  it('Should return null on a non-zero exit even with a version in stdout', async () => {
    run.mockResolvedValue({code: 1, stdout: 'git version 2.54.0', stderr: ''});

    expect(await service.version('git')).toBeNull();
  });

  it('Should return null when stdout has no version', async () => {
    run.mockResolvedValue({code: 0, stdout: 'no digits here', stderr: ''});

    expect(await service.version('git')).toBeNull();
  });

  it('Should return null for a single number without dots', async () => {
    run.mockResolvedValue({code: 0, stdout: 'version 7', stderr: ''});

    expect(await service.version('git')).toBeNull();
  });

  it('Should report gh logged in when auth status exits 0', async () => {
    run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

    expect(await service.ghLoggedIn()).toBe(true);
    expect(run).toHaveBeenCalledWith('gh', ['auth', 'status'], {
      timeoutMs: 10_000,
    });
  });

  it('Should report gh logged out when auth status exits non-zero', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

    expect(await service.ghLoggedIn()).toBe(false);
  });

  it('Should report gh logged out when auth status rejects', async () => {
    run.mockRejectedValue(new Error('spawn gh ENOENT'));

    expect(await service.ghLoggedIn()).toBe(false);
  });

  it('Should detect brew when --version exits 0', async () => {
    run.mockResolvedValue({code: 0, stdout: 'Homebrew 4.0\n', stderr: ''});

    expect(await service.hasBrew()).toBe(true);
    expect(run).toHaveBeenCalledWith('brew', ['--version'], {
      timeoutMs: 10_000,
    });
  });

  it('Should report no brew when --version exits non-zero', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

    expect(await service.hasBrew()).toBe(false);
  });

  it('Should report no brew when the runner rejects', async () => {
    run.mockRejectedValue(new Error('spawn brew ENOENT'));

    expect(await service.hasBrew()).toBe(false);
  });

  it('Should install a formula with a 600 s timeout', async () => {
    run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

    await expect(service.brewInstall('tmux')).resolves.toBeUndefined();
    expect(run).toHaveBeenCalledWith('brew', ['install', 'tmux'], {
      timeoutMs: 600_000,
    });
  });

  it('Should reject with the trimmed stderr when brew install fails', async () => {
    run.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Error: No formulae found\n',
    });

    await expect(service.brewInstall('tmux')).rejects.toThrow(
      new Error('brew install tmux falhou: Error: No formulae found'),
    );
  });

  it('Should reject with the runner error message when brew install rejects', async () => {
    run.mockRejectedValue(new Error('timeout'));

    await expect(service.brewInstall('gh')).rejects.toThrow(
      new Error('brew install gh falhou: timeout'),
    );
  });

  it('Should stringify a non-Error rejection of brew install', async () => {
    run.mockRejectedValue('boom');

    await expect(service.brewInstall('gh')).rejects.toThrow(
      new Error('brew install gh falhou: boom'),
    );
  });
});
