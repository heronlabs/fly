import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {
  LoginShellEnvService,
  mergePath,
} from '../../../../src/infrastructure/environment/login-shell-env-service';

describe('LoginShellEnvService', () => {
  const runner = {run: vi.fn()};
  const service = new LoginShellEnvService(runner as unknown as CommandRunner);

  it('Should read PATH and LANG between the markers, ignoring shell banners', async () => {
    runner.run.mockResolvedValue({
      code: 0,
      stdout:
        'Welcome!\n__FLY_ENV__/opt/homebrew/bin:/usr/bin\nen_US.UTF-8__FLY_ENV__',
      stderr: '',
    });

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({
      PATH: '/opt/homebrew/bin:/usr/bin',
      LANG: 'en_US.UTF-8',
    });
    expect(runner.run).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-ilc', expect.stringContaining('__FLY_ENV__')],
      {timeoutMs: 5000},
    );
  });

  it('Should return {} when the shell rejects (spawn error or timeout)', async () => {
    runner.run.mockRejectedValue(new Error('timeout'));

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({});
  });

  it('Should return {} when the shell exits non-zero', async () => {
    runner.run.mockResolvedValue({
      code: 1,
      stdout: '__FLY_ENV__/usr/bin\nen__FLY_ENV__',
      stderr: '',
    });

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({});
  });

  it('Should return {} when the output has no markers', async () => {
    runner.run.mockResolvedValue({code: 0, stdout: 'hello', stderr: ''});

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({});
  });

  it('Should return {} when the closing marker is missing', async () => {
    runner.run.mockResolvedValue({
      code: 0,
      stdout: '__FLY_ENV__/usr/bin\nen',
      stderr: '',
    });

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({});
  });

  it('Should omit empty values', async () => {
    runner.run.mockResolvedValue({
      code: 0,
      stdout: '__FLY_ENV__/usr/bin\n__FLY_ENV__',
      stderr: '',
    });

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({
      PATH: '/usr/bin',
    });
  });

  it('Should omit PATH when only LANG is printed', async () => {
    runner.run.mockResolvedValue({
      code: 0,
      stdout: '__FLY_ENV__\nen_US.UTF-8__FLY_ENV__',
      stderr: '',
    });

    await expect(service.resolve('/bin/zsh')).resolves.toEqual({
      LANG: 'en_US.UTF-8',
    });
  });
});

describe('mergePath', () => {
  it('Should merge login PATH entries first without duplicates', () => {
    expect(mergePath('/usr/bin:/bin', '/opt/homebrew/bin:/usr/bin')).toBe(
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
    expect(mergePath(undefined, undefined)).toBe('');
  });

  it('Should drop empty entries', () => {
    expect(mergePath('/bin::/usr/bin', ':/opt/bin:')).toBe(
      '/opt/bin:/bin:/usr/bin',
    );
  });
});
