import {join} from 'node:path';

import {
  APPLICATIONS_BUNDLE,
  InstallerImage,
  LAUNCHER_IN_BUNDLE,
  ToolId,
} from '../../../../src/core/domain/setup';
import {AppInstaller} from '../../../../src/core/interfaces/app-installer';
import {AppRuntime} from '../../../../src/core/interfaces/app-runtime';
import {Toolchain} from '../../../../src/core/interfaces/toolchain';
import {SettingsService} from '../../../../src/core/services/settings-service';
import {checkTool} from '../../../../src/core/services/setup-rules';
import {SetupService} from '../../../../src/core/services/setup-service';

const version = vi.fn();
const ghLoggedIn = vi.fn();
const hasBrew = vi.fn();
const brewInstall = vi.fn();
const refreshPath = vi.fn();
const toolchain: Toolchain = {
  version,
  ghLoggedIn,
  hasBrew,
  brewInstall,
  refreshPath,
};

const commandState = vi.fn();
const installCommand = vi.fn();
const findInstaller = vi.fn();
const trashInstaller = vi.fn();
const installer: AppInstaller = {
  commandState,
  installCommand,
  findInstaller,
  trashInstaller,
};

const get = vi.fn();
const update = vi.fn();
const settings = {get, update} as unknown as SettingsService;

const image: InstallerImage = {
  imagePath: '/Users/user/Downloads/fly.dmg',
  mountPoint: '/Volumes/fly',
};

const build = (bundlePath: string | null): SetupService => {
  const runtime: AppRuntime = {bundlePath, version: '1.0.0'};
  return new SetupService(toolchain, installer, settings, runtime);
};

const versions: Record<ToolId, string | null> = {
  git: '2.40.0',
  gh: '2.50.0',
  tmux: null,
  claude: '2.1.100',
};

beforeEach(() => {
  for (const mock of [
    version,
    ghLoggedIn,
    hasBrew,
    brewInstall,
    refreshPath,
    commandState,
    installCommand,
    findInstaller,
    trashInstaller,
    get,
    update,
  ]) {
    mock.mockReset();
  }
  version.mockImplementation(async (id: ToolId) => versions[id]);
  ghLoggedIn.mockResolvedValue(true);
  hasBrew.mockResolvedValue(true);
  brewInstall.mockResolvedValue(undefined);
  refreshPath.mockResolvedValue(undefined);
  installCommand.mockResolvedValue(undefined);
  trashInstaller.mockResolvedValue(undefined);
  update.mockResolvedValue({});
});

describe('SetupService.info', () => {
  it('Should open when packaged in Applications and setup is not done', async () => {
    get.mockResolvedValue({setupDone: false});

    expect(await build(APPLICATIONS_BUNDLE).info(false)).toEqual({
      packaged: true,
      inApplications: true,
      bundlePath: APPLICATIONS_BUNDLE,
      open: true,
    });
  });

  it('Should not open when setup is done and not requested', async () => {
    get.mockResolvedValue({setupDone: true});

    expect((await build(APPLICATIONS_BUNDLE).info(false)).open).toBe(false);
  });

  it('Should open when requested even if setup is done', async () => {
    get.mockResolvedValue({setupDone: true});

    expect((await build(APPLICATIONS_BUNDLE).info(true)).open).toBe(true);
  });

  it('Should not be in Applications when mounted from a volume', async () => {
    get.mockResolvedValue({setupDone: false});

    expect(await build('/Volumes/fly/fly.app').info(false)).toEqual({
      packaged: true,
      inApplications: false,
      bundlePath: '/Volumes/fly/fly.app',
      open: true,
    });
  });

  it('Should be all false and null when not packaged, even if requested', async () => {
    get.mockResolvedValue({setupDone: false});

    expect(await build(null).info(true)).toEqual({
      packaged: false,
      inApplications: false,
      bundlePath: null,
      open: false,
    });
  });
});

describe('SetupService.doctor', () => {
  it('Should report git, gh, tmux and claude in order with brew', async () => {
    const report = await build(null).doctor();

    expect(report).toEqual({
      tools: [
        checkTool('git', {version: '2.40.0'}),
        checkTool('gh', {version: '2.50.0', loggedIn: true}),
        checkTool('tmux', {version: null}),
        checkTool('claude', {version: '2.1.100'}),
      ],
      brew: true,
    });
    expect(version.mock.calls).toEqual([['git'], ['gh'], ['tmux'], ['claude']]);
  });

  it('Should refresh the PATH before any probe', async () => {
    await build(null).doctor();

    expect(refreshPath).toHaveBeenCalledTimes(1);
    expect(refreshPath.mock.invocationCallOrder[0]).toBeLessThan(
      version.mock.invocationCallOrder[0] as number,
    );
    expect(refreshPath.mock.invocationCallOrder[0]).toBeLessThan(
      hasBrew.mock.invocationCallOrder[0] as number,
    );
  });

  it('Should still run the doctor when the PATH refresh fails', async () => {
    refreshPath.mockRejectedValue(new Error('shell gone'));

    const report = await build(null).doctor();

    expect(report.tools).toHaveLength(4);
    expect(version).toHaveBeenCalledTimes(4);
  });

  it('Should report gh logged out and no brew', async () => {
    ghLoggedIn.mockResolvedValue(false);
    hasBrew.mockResolvedValue(false);

    const report = await build(null).doctor();

    expect(report.tools[1]).toEqual(
      checkTool('gh', {version: '2.50.0', loggedIn: false}),
    );
    expect(report.brew).toBe(false);
  });

  it('Should not probe gh login when gh is missing', async () => {
    version.mockImplementation(async (id: ToolId) =>
      id === 'gh' ? null : versions[id],
    );

    const report = await build(null).doctor();

    expect(ghLoggedIn).not.toHaveBeenCalled();
    expect(report.tools[1]).toEqual(checkTool('gh', {version: null}));
  });
});

describe('SetupService.installTool', () => {
  it('Should brew install then return a fresh report', async () => {
    const calls: string[] = [];
    brewInstall.mockImplementation(async () => {
      calls.push('install');
      versions.tmux = '3.4';
    });

    const report = await build(null).installTool('tmux');

    expect(brewInstall).toHaveBeenCalledExactlyOnceWith('tmux');
    expect(calls).toEqual(['install']);
    expect(report.tools[2]).toEqual(checkTool('tmux', {version: '3.4'}));
    versions.tmux = null;
  });

  it('Should reject claude without touching brew', async () => {
    await expect(build(null).installTool('claude')).rejects.toThrow(
      'Instale o claude pelo comando indicado',
    );

    expect(hasBrew).not.toHaveBeenCalled();
    expect(brewInstall).not.toHaveBeenCalled();
  });

  it('Should reject when brew is missing', async () => {
    hasBrew.mockResolvedValue(false);

    await expect(build(null).installTool('git')).rejects.toThrow(
      'Homebrew não encontrado',
    );

    expect(brewInstall).not.toHaveBeenCalled();
  });
});

describe('SetupService command', () => {
  const launcher = join(APPLICATIONS_BUNDLE, LAUNCHER_IN_BUNDLE);

  it('Should read the command state for the bundle launcher', async () => {
    commandState.mockResolvedValue('other');

    expect(await build(APPLICATIONS_BUNDLE).commandState()).toBe('other');
    expect(commandState).toHaveBeenCalledExactlyOnceWith(launcher);
  });

  it('Should reject when the link does not point to the launcher after the install', async () => {
    commandState.mockResolvedValue('other');

    await expect(build(APPLICATIONS_BUNDLE).installCommand()).rejects.toThrow(
      new Error(
        'Falha ao instalar o comando: /usr/local/bin/fly não aponta para o fly',
      ),
    );
  });

  it('Should reject when the link is still missing after the install', async () => {
    commandState.mockResolvedValue('missing');

    await expect(build(APPLICATIONS_BUNDLE).installCommand()).rejects.toThrow(
      'não aponta para o fly',
    );
  });

  it('Should install the command then return the fresh state', async () => {
    commandState.mockResolvedValue('installed');

    expect(await build(APPLICATIONS_BUNDLE).installCommand()).toBe('installed');
    expect(installCommand).toHaveBeenCalledExactlyOnceWith(launcher);
    expect(installCommand.mock.invocationCallOrder[0]).toBeLessThan(
      commandState.mock.invocationCallOrder[0] as number,
    );
  });

  it('Should reject the state when not packaged', async () => {
    await expect(build(null).commandState()).rejects.toThrow(
      'Disponível só no app instalado',
    );

    expect(commandState).not.toHaveBeenCalled();
  });

  it('Should reject the install when not packaged', async () => {
    await expect(build(null).installCommand()).rejects.toThrow(
      'Disponível só no app instalado',
    );

    expect(installCommand).not.toHaveBeenCalled();
  });
});

describe('SetupService installer', () => {
  it('Should find the installer when packaged', async () => {
    findInstaller.mockResolvedValue(image);

    expect(await build(APPLICATIONS_BUNDLE).installer()).toBe(image);
  });

  it('Should return null without searching when not packaged', async () => {
    expect(await build(null).installer()).toBeNull();
    expect(findInstaller).not.toHaveBeenCalled();
  });

  it('Should trash the mounted installer with exactly that image path', async () => {
    findInstaller.mockResolvedValue(image);

    await build(APPLICATIONS_BUNDLE).trashInstaller(image.imagePath);

    expect(findInstaller).toHaveBeenCalledExactlyOnceWith(image.imagePath);
    expect(trashInstaller).toHaveBeenCalledExactlyOnceWith(image);
  });

  it.each([
    ['was ejected', null],
    [
      'is another fly image',
      {imagePath: '/Users/user/Downloads/fly-0.4.0.dmg', mountPoint: '/V/old'},
    ],
  ])('Should reject when the installer %s', async (_name, found) => {
    findInstaller.mockResolvedValue(found);

    await expect(
      build(APPLICATIONS_BUNDLE).trashInstaller(image.imagePath),
    ).rejects.toThrow(
      new Error('O instalador não está mais montado; apague-o pelo Finder'),
    );
    expect(trashInstaller).not.toHaveBeenCalled();
  });

  it('Should reject on trash when not packaged', async () => {
    await expect(build(null).trashInstaller(image.imagePath)).rejects.toThrow(
      'O instalador não está mais montado',
    );

    expect(findInstaller).not.toHaveBeenCalled();
    expect(trashInstaller).not.toHaveBeenCalled();
  });
});

describe('SetupService.complete', () => {
  it('Should mark setup as done', async () => {
    await build(null).complete();

    expect(update).toHaveBeenCalledExactlyOnceWith({setupDone: true});
  });
});
