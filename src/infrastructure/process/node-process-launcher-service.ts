import {spawn} from 'node:child_process';

import {Injectable} from '@nestjs/common';

import {ProcessLauncher} from '../../core/interfaces/process-launcher';

@Injectable()
export class NodeProcessLauncherService extends ProcessLauncher {
  foreground(file: string, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, {stdio: 'inherit'});
      child.on('error', reject);
      // A signal death has no exit code.
      child.on('close', code => resolve(code ?? 1));
    });
  }

  detached(
    file: string,
    args: string[],
    env: Record<string, string | undefined>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(file, args, {detached: true, stdio: 'ignore', env});
      child.on('error', reject);
      child.on('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}
