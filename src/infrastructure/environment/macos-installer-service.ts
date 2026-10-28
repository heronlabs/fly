import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {
  COMMAND_LINK,
  type CommandState,
  type InstallerImage,
} from '../../core/domain/setup';
import {AppInstaller} from '../../core/interfaces/app-installer';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {FileStore} from '../../core/interfaces/file-store';
import {parseHdiutilInfo} from './hdiutil-info-parser';
import {TRASH_ITEM, type TrashItem} from './tokens';

const PROBE_TIMEOUT_MS = 15_000;
const DETACH_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 120_000;
const PROBE_SCRIPT =
  '/usr/bin/hdiutil info -plist | /usr/bin/plutil -convert json -o - -';
const USER_CANCELLED = '(-128)';
const UNSAFE_PATH = /["\\]/;

@Injectable()
export class MacosInstallerService extends AppInstaller {
  constructor(
    private readonly runner: CommandRunner,
    private readonly files: FileStore,
    @Inject(TRASH_ITEM) private readonly trash: TrashItem,
  ) {
    super();
  }

  async commandState(launcher: string): Promise<CommandState> {
    if (!(await this.files.exists(COMMAND_LINK))) return 'missing';
    try {
      const [link, target] = await Promise.all([
        this.files.realPath(COMMAND_LINK),
        this.files.realPath(launcher),
      ]);
      return link === target ? 'installed' : 'other';
    } catch {
      return 'other';
    }
  }

  async installCommand(launcher: string): Promise<void> {
    if (UNSAFE_PATH.test(launcher)) throw new Error('Caminho inválido');
    const script = `do shell script "mkdir -p /usr/local/bin && ln -sfh " & quoted form of "${launcher}" & " ${COMMAND_LINK}" with administrator privileges`;
    const result = await this.runner
      .run('/usr/bin/osascript', ['-e', script], {
        timeoutMs: INSTALL_TIMEOUT_MS,
      })
      .catch((error: Error) => {
        throw new Error(`Falha ao instalar o comando: ${error.message}`);
      });
    if (result.code === 0) return;
    if (result.stderr.includes(USER_CANCELLED)) {
      throw new Error('Instalação cancelada');
    }
    throw new Error(`Falha ao instalar o comando: ${result.stderr.trim()}`);
  }

  async findInstaller(imagePath?: string): Promise<InstallerImage | null> {
    try {
      const result = await this.runner.run('/bin/sh', ['-c', PROBE_SCRIPT], {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      if (result.code !== 0) return null;
      for (const image of parseHdiutilInfo(result.stdout)) {
        if (imagePath !== undefined && image.imagePath !== imagePath) continue;
        for (const mountPoint of image.mountPoints) {
          if (await this.files.exists(join(mountPoint, 'fly.app'))) {
            return {imagePath: image.imagePath, mountPoint};
          }
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async trashInstaller(image: InstallerImage): Promise<void> {
    const result = await this.runner
      .run('/usr/bin/hdiutil', ['detach', image.mountPoint], {
        timeoutMs: DETACH_TIMEOUT_MS,
      })
      .catch((error: Error) => {
        throw new Error(`Falha ao ejetar o instalador: ${error.message}`);
      });
    if (result.code !== 0) {
      throw new Error(`Falha ao ejetar o instalador: ${result.stderr.trim()}`);
    }
    await this.trash(image.imagePath).catch((error: Error) => {
      throw new Error(
        `Falha ao mover o instalador para a Lixeira: ${error.message}`,
      );
    });
  }
}
