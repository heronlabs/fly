import {Injectable} from '@nestjs/common';

import {
  type CommandState,
  INSTALL_LAYOUTS,
  type InstallerImage,
} from '../../core/domain/setup';
import {AppInstaller} from '../../core/interfaces/app-installer';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {FileStore} from '../../core/interfaces/file-store';
import {linkState} from './command-link';

const INSTALL_TIMEOUT_MS = 120_000;
const COMMAND_LINK = INSTALL_LAYOUTS.linux.commandLink;
// pkexec exits 126 when the user dismisses the password prompt.
const USER_CANCELLED = 126;

// The .deb's post-install already links /usr/bin/fly; this only repairs it.
// A .deb has no installer image to find or trash once installed.
@Injectable()
export class LinuxInstallerService extends AppInstaller {
  constructor(
    private readonly runner: CommandRunner,
    private readonly files: FileStore,
  ) {
    super();
  }

  commandState(launcher: string): Promise<CommandState> {
    return linkState(this.files, COMMAND_LINK, launcher);
  }

  async installCommand(launcher: string): Promise<void> {
    // Absolute paths: pkexec looks a bare program up in the caller's PATH and
    // runs it as root. -n replaces a link to a directory instead of writing
    // inside it.
    const result = await this.runner
      .run('/usr/bin/pkexec', ['/bin/ln', '-sfn', launcher, COMMAND_LINK], {
        timeoutMs: INSTALL_TIMEOUT_MS,
      })
      .catch((error: Error) => {
        throw new Error(`Falha ao instalar o comando: ${error.message}`);
      });
    if (result.code === 0) return;
    if (result.code === USER_CANCELLED) throw new Error('Instalação cancelada');
    throw new Error(`Falha ao instalar o comando: ${result.stderr.trim()}`);
  }

  async findInstaller(): Promise<InstallerImage | null> {
    return null;
  }

  async trashInstaller(): Promise<void> {
    throw new Error('Sem instalador para apagar');
  }
}
