import {join} from 'node:path';

import {Injectable} from '@nestjs/common';

import {
  APPLICATIONS_BUNDLE,
  CommandState,
  DoctorReport,
  InstallerImage,
  LAUNCHER_IN_BUNDLE,
  SetupInfo,
  ToolCheck,
  ToolId,
} from '../domain/setup';
import {AppInstaller} from '../interfaces/app-installer';
import {AppRuntime} from '../interfaces/app-runtime';
import {Toolchain} from '../interfaces/toolchain';
import {SettingsService} from './settings-service';
import {BREW_TOOLS, checkTool} from './setup-rules';

@Injectable()
export class SetupService {
  constructor(
    private readonly toolchain: Toolchain,
    private readonly appInstaller: AppInstaller,
    private readonly settings: SettingsService,
    private readonly runtime: AppRuntime,
  ) {}

  async info(requested: boolean): Promise<SetupInfo> {
    const {bundlePath} = this.runtime;
    const packaged = bundlePath !== null;
    const config = await this.settings.get();
    return {
      packaged,
      inApplications: bundlePath === APPLICATIONS_BUNDLE,
      bundlePath,
      open: packaged && (requested || !config.setupDone),
    };
  }

  async doctor(): Promise<DoctorReport> {
    const [git, gh, tmux, claude, brew] = await Promise.all([
      this.check('git'),
      this.check('gh'),
      this.check('tmux'),
      this.check('claude'),
      this.toolchain.hasBrew(),
    ]);
    return {tools: [git, gh, tmux, claude], brew};
  }

  async installTool(id: ToolId): Promise<DoctorReport> {
    if (!BREW_TOOLS.includes(id)) {
      throw new Error('Instale o claude pelo comando indicado');
    }
    if (!(await this.toolchain.hasBrew())) {
      throw new Error('Homebrew não encontrado');
    }
    await this.toolchain.brewInstall(id);
    return this.doctor();
  }

  async commandState(): Promise<CommandState> {
    return this.appInstaller.commandState(this.launcher());
  }

  async installCommand(): Promise<CommandState> {
    await this.appInstaller.installCommand(this.launcher());
    return this.commandState();
  }

  async installer(): Promise<InstallerImage | null> {
    if (this.runtime.bundlePath === null) {
      return null;
    }
    return this.appInstaller.findInstaller();
  }

  async trashInstaller(): Promise<void> {
    const image = await this.installer();
    if (image !== null) {
      await this.appInstaller.trashInstaller(image);
    }
  }

  async complete(): Promise<void> {
    await this.settings.update({setupDone: true});
  }

  private async check(id: ToolId): Promise<ToolCheck> {
    const version = await this.toolchain.version(id);
    if (id === 'gh' && version !== null) {
      return checkTool(id, {
        version,
        loggedIn: await this.toolchain.ghLoggedIn(),
      });
    }
    return checkTool(id, {version});
  }

  private launcher(): string {
    const {bundlePath} = this.runtime;
    if (bundlePath === null) {
      throw new Error('Disponível só no app instalado');
    }
    return join(bundlePath, LAUNCHER_IN_BUNDLE);
  }
}
