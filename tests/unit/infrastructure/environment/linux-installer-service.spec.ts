import {AppInstaller} from '../../../../src/core/interfaces/app-installer';
import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {LinuxInstallerService} from '../../../../src/infrastructure/environment/linux-installer-service';

const LAUNCHER = '/opt/fly/resources/bin/fly';

describe('LinuxInstallerService', () => {
  const run = vi.fn();
  const exists = vi.fn();
  const realPath = vi.fn();
  const service = new LinuxInstallerService(
    {run} as unknown as CommandRunner,
    {exists, realPath} as unknown as FileStore,
  );

  beforeEach(() => {
    run.mockReset();
    exists.mockReset();
    realPath.mockReset();
  });

  describe('commandState', () => {
    it('Should look for the link at /usr/bin/fly', async () => {
      exists.mockResolvedValue(false);

      expect(await service.commandState(LAUNCHER)).toBe('missing');
      expect(exists).toHaveBeenCalledWith('/usr/bin/fly');
    });

    it('Should compare /usr/bin/fly with the launcher', async () => {
      exists.mockResolvedValue(true);
      realPath.mockResolvedValue(LAUNCHER);

      expect(await service.commandState(LAUNCHER)).toBe('installed');
      expect(realPath).toHaveBeenCalledWith('/usr/bin/fly');
      expect(realPath).toHaveBeenCalledWith(LAUNCHER);
    });
  });

  describe('installCommand', () => {
    it('Should link the launcher through pkexec', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      await service.installCommand(LAUNCHER);

      expect(run).toHaveBeenCalledExactlyOnceWith(
        '/usr/bin/pkexec',
        ['/bin/ln', '-sfn', LAUNCHER, '/usr/bin/fly'],
        {timeoutMs: 120_000},
      );
    });

    it('Should report a dismissed password prompt as cancelled', async () => {
      run.mockResolvedValue({
        code: 126,
        stdout: '',
        stderr: 'Error executing command as another user: Request dismissed\n',
      });

      await expect(service.installCommand(LAUNCHER)).rejects.toThrow(
        new Error('Instalação cancelada'),
      );
    });

    it('Should report another failure with its stderr', async () => {
      run.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: '  ln: failed to create symbolic link\n',
      });

      await expect(service.installCommand(LAUNCHER)).rejects.toThrow(
        new Error(
          'Falha ao instalar o comando: ln: failed to create symbolic link',
        ),
      );
    });

    it('Should wrap a run that could not start', async () => {
      run.mockRejectedValue(new Error('spawn pkexec ENOENT'));

      await expect(service.installCommand(LAUNCHER)).rejects.toThrow(
        new Error('Falha ao instalar o comando: spawn pkexec ENOENT'),
      );
    });
  });

  describe('installer image', () => {
    const installer: AppInstaller = service;

    it('Should never find one', async () => {
      expect(await installer.findInstaller()).toBeNull();
      expect(await installer.findInstaller('/home/user/fly.deb')).toBeNull();
      expect(run).not.toHaveBeenCalled();
    });

    it('Should refuse to trash one', async () => {
      await expect(
        installer.trashInstaller({imagePath: '/x.deb', mountPoint: '/x'}),
      ).rejects.toThrow(new Error('Sem instalador para apagar'));
      expect(run).not.toHaveBeenCalled();
    });
  });
});
