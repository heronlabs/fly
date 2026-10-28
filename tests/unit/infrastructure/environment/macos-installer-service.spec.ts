import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {MacosInstallerService} from '../../../../src/infrastructure/environment/macos-installer-service';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../../../fixtures/hdiutil', name), 'utf8');

const IMAGE = {
  imagePath: '/Users/user/Downloads/fly-0.7.0-arm64.dmg',
  mountPoint: '/Volumes/fly 0.7.0-arm64',
};

describe('MacosInstallerService', () => {
  const run = vi.fn();
  const exists = vi.fn();
  const realPath = vi.fn();
  const trash = vi.fn();
  const service = new MacosInstallerService(
    {run} as unknown as CommandRunner,
    {exists, realPath} as unknown as FileStore,
    trash,
  );

  beforeEach(() => {
    run.mockReset();
    exists.mockReset();
    realPath.mockReset();
    trash.mockReset();
  });

  describe('commandState', () => {
    it('Should be missing when the link is absent', async () => {
      exists.mockResolvedValue(false);

      expect(await service.commandState('/A/fly')).toBe('missing');
      expect(exists).toHaveBeenCalledWith('/usr/local/bin/fly');
      expect(realPath).not.toHaveBeenCalled();
    });

    it('Should be installed when both resolve to the same file', async () => {
      exists.mockResolvedValue(true);
      realPath.mockResolvedValue('/A/fly');

      expect(await service.commandState('/A/fly')).toBe('installed');
      expect(realPath).toHaveBeenCalledWith('/usr/local/bin/fly');
      expect(realPath).toHaveBeenCalledWith('/A/fly');
    });

    it('Should be other when they resolve differently', async () => {
      exists.mockResolvedValue(true);
      realPath.mockImplementation(async (p: string) =>
        p === '/A/fly' ? '/A/fly' : '/B/fly',
      );

      expect(await service.commandState('/A/fly')).toBe('other');
    });

    it('Should be other when a real path cannot be resolved', async () => {
      exists.mockResolvedValue(true);
      realPath.mockRejectedValue(new Error('ENOENT'));

      expect(await service.commandState('/A/fly')).toBe('other');
    });
  });

  describe('installCommand', () => {
    it('Should link the launcher with administrator privileges', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

      await service.installCommand('/Applications/fly.app/x/fly');

      expect(run).toHaveBeenCalledTimes(1);
      expect(run).toHaveBeenCalledWith(
        '/usr/bin/osascript',
        [
          '-e',
          'do shell script "mkdir -p /usr/local/bin && ln -sfh " & quoted form of "/Applications/fly.app/x/fly" & " /usr/local/bin/fly" with administrator privileges',
        ],
        {timeoutMs: 120_000},
      );
    });

    it.each([
      '/Applications/My App/fly',
      "/Applications/it's/fly",
      '/Applications/two\nlines/fly',
    ])(
      'Should pass the launcher %j verbatim inside the script',
      async launcher => {
        run.mockResolvedValue({code: 0, stdout: '', stderr: ''});

        await service.installCommand(launcher);

        expect(run.mock.calls[0]?.[1]).toEqual([
          '-e',
          `do shell script "mkdir -p /usr/local/bin && ln -sfh " & quoted form of "${launcher}" & " /usr/local/bin/fly" with administrator privileges`,
        ]);
      },
    );

    it('Should not read -128 outside parentheses as a cancellation', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: 'error -1280 x'});

      await expect(service.installCommand('/A/fly')).rejects.toThrow(
        new Error('Falha ao instalar o comando: error -1280 x'),
      );
    });

    it.each(['/A/fl"y', '/A/fl\\y'])(
      'Should refuse the launcher %s without running anything',
      async launcher => {
        await expect(service.installCommand(launcher)).rejects.toThrow(
          new Error('Caminho inválido'),
        );
        expect(run).not.toHaveBeenCalled();
      },
    );

    it('Should report a cancelled prompt', async () => {
      run.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'execution error: User canceled. (-128)\n',
      });

      await expect(service.installCommand('/A/fly')).rejects.toThrow(
        new Error('Instalação cancelada'),
      );
    });

    it('Should report any other failure with its stderr', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ' other \n'});

      await expect(service.installCommand('/A/fly')).rejects.toThrow(
        new Error('Falha ao instalar o comando: other'),
      );
    });

    it('Should report a runner rejection', async () => {
      run.mockRejectedValue(new Error('spawn osascript ENOENT'));

      await expect(service.installCommand('/A/fly')).rejects.toThrow(
        new Error('Falha ao instalar o comando: spawn osascript ENOENT'),
      );
    });
  });

  describe('findInstaller', () => {
    const probe = [
      '-c',
      '/usr/bin/hdiutil info -plist | /usr/bin/plutil -convert json -o - -',
    ];

    it('Should find the image whose volume holds fly.app', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: fixture('info-mounted.json'),
        stderr: '',
      });
      exists.mockResolvedValue(true);

      expect(await service.findInstaller()).toEqual(IMAGE);
      expect(run).toHaveBeenCalledWith('/bin/sh', probe, {timeoutMs: 15_000});
      expect(exists).toHaveBeenCalledWith('/Volumes/fly 0.7.0-arm64/fly.app');
    });

    it('Should skip images without fly.app', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: fixture('info-two-images.json'),
        stderr: '',
      });
      exists.mockImplementation(
        async (p: string) => p === '/Volumes/fly 0.7.0-arm64/fly.app',
      );

      expect(await service.findInstaller()).toEqual(IMAGE);
      expect(exists).toHaveBeenCalledWith('/Volumes/Other/fly.app');
    });

    it('Should skip a fly image whose path is not the one asked for', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: fixture('info-two-images.json'),
        stderr: '',
      });
      exists.mockResolvedValue(true);

      expect(
        await service.findInstaller(
          '/Users/user/Downloads/fly-0.7.0-arm64.dmg',
        ),
      ).toEqual(IMAGE);
      expect(
        await service.findInstaller(
          '/Users/user/Downloads/fly-0.4.0-arm64.dmg',
        ),
      ).toBeNull();
    });

    it('Should be null when no volume holds fly.app', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: fixture('info-two-images.json'),
        stderr: '',
      });
      exists.mockResolvedValue(false);

      expect(await service.findInstaller()).toBeNull();
    });

    it('Should be null on a non-zero exit', async () => {
      run.mockResolvedValue({
        code: 1,
        stdout: fixture('info-mounted.json'),
        stderr: 'boom',
      });
      exists.mockResolvedValue(true);

      expect(await service.findInstaller()).toBeNull();
    });

    it('Should be null when the probe rejects', async () => {
      run.mockRejectedValue(new Error('timeout'));

      expect(await service.findInstaller()).toBeNull();
    });
  });

  describe('trashInstaller', () => {
    it('Should detach the volume, then trash the image', async () => {
      run.mockResolvedValue({
        code: 0,
        stdout: '',
        stderr: 'WARNING: deprecated\n',
      });
      trash.mockResolvedValue(undefined);

      await service.trashInstaller(IMAGE);

      expect(run).toHaveBeenCalledWith(
        '/usr/bin/hdiutil',
        ['detach', '/Volumes/fly 0.7.0-arm64'],
        {timeoutMs: 30_000},
      );
      expect(trash).toHaveBeenCalledWith(IMAGE.imagePath);
      expect(run.mock.invocationCallOrder[0]).toBeLessThan(
        trash.mock.invocationCallOrder[0] as number,
      );
    });

    it('Should say so in pt-BR when the Trash move fails', async () => {
      run.mockResolvedValue({code: 0, stdout: '', stderr: ''});
      trash.mockRejectedValue(new Error('Failed to move to trash'));

      await expect(service.trashInstaller(IMAGE)).rejects.toThrow(
        new Error(
          'Falha ao mover o instalador para a Lixeira: Failed to move to trash',
        ),
      );
    });

    it('Should not trash when detach fails', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ' busy\n'});

      await expect(service.trashInstaller(IMAGE)).rejects.toThrow(
        new Error('Falha ao ejetar o instalador: busy'),
      );
      expect(trash).not.toHaveBeenCalled();
    });

    it('Should not trash when detach rejects', async () => {
      run.mockRejectedValue(new Error('timeout'));

      await expect(service.trashInstaller(IMAGE)).rejects.toThrow(
        new Error('Falha ao ejetar o instalador: timeout'),
      );
      expect(trash).not.toHaveBeenCalled();
    });
  });
});
