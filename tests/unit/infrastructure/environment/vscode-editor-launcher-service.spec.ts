import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {VscodeEditorLauncherService} from '../../../../src/infrastructure/environment/vscode-editor-launcher-service';

const NOT_FOUND =
  'VSCode não encontrado: instale o comando "code" ou o app Visual Studio Code';
const ok = {code: 0, stdout: '', stderr: ''};

describe('VscodeEditorLauncherService', () => {
  const run = vi.fn();
  const service = new VscodeEditorLauncherService({
    run,
  } as unknown as CommandRunner);

  it('Should call code and stop when it succeeds', async () => {
    run.mockResolvedValue(ok);

    await service.open('/w/feat-a');

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('code', ['/w/feat-a']);
  });

  it('Should fall back to open -a when code is not on PATH (ENOENT)', async () => {
    run
      .mockRejectedValueOnce(
        Object.assign(new Error('spawn code ENOENT'), {code: 'ENOENT'}),
      )
      .mockResolvedValueOnce(ok);

    await service.open('/w/feat-a');

    expect(run).toHaveBeenNthCalledWith(2, 'open', [
      '-a',
      'Visual Studio Code',
      '/w/feat-a',
    ]);
  });

  it('Should fall back to open -a when code rejects with a non-ENOENT error', async () => {
    run
      .mockRejectedValueOnce(
        Object.assign(new Error('spawn code EACCES'), {code: 'EACCES'}),
      )
      .mockResolvedValueOnce(ok);

    await service.open('/w/feat-a');

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, 'open', [
      '-a',
      'Visual Studio Code',
      '/w/feat-a',
    ]);
  });

  it('Should fall back to open -a when code exits non-zero', async () => {
    run
      .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'boom'})
      .mockResolvedValueOnce(ok);

    await service.open('/w/feat-a');

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('Should throw the pt-BR error when open exits non-zero', async () => {
    run
      .mockResolvedValueOnce({code: 1, stdout: '', stderr: ''})
      .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'nope'});

    await expect(service.open('/w/feat-a')).rejects.toThrow(NOT_FOUND);
  });

  it('Should throw the pt-BR error when open rejects too', async () => {
    run
      .mockRejectedValueOnce(new Error('spawn code ENOENT'))
      .mockRejectedValueOnce(new Error('spawn open ENOENT'));

    await expect(service.open('/w/feat-a')).rejects.toThrow(NOT_FOUND);
  });
});
