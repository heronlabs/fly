import {Injectable} from '@nestjs/common';

import {CommandRunner} from '../../core/interfaces/command-runner';
import {EditorLauncher} from '../../core/interfaces/editor-launcher';

const NOT_FOUND =
  'VSCode não encontrado: instale o comando "code" ou o app Visual Studio Code';

@Injectable()
export class VscodeEditorLauncherService extends EditorLauncher {
  constructor(private readonly runner: CommandRunner) {
    super();
  }

  async open(path: string): Promise<void> {
    if (await this.succeeds('code', [path])) return;
    if (await this.succeeds('open', ['-a', 'Visual Studio Code', path])) return;
    throw new Error(NOT_FOUND);
  }

  private async succeeds(command: string, args: string[]): Promise<boolean> {
    try {
      const result = await this.runner.run(command, args);
      return result.code === 0;
    } catch {
      return false;
    }
  }
}
