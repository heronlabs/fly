import {execFile} from 'node:child_process';

import {Injectable} from '@nestjs/common';

import {
  CommandResult,
  CommandRunner,
} from '../../core/interfaces/command-runner';

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;

@Injectable()
export class ExecCommandRunnerService extends CommandRunner {
  run(
    command: string,
    args: string[],
    options?: {cwd?: string; timeoutMs?: number},
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: options?.cwd,
          timeout: options?.timeoutMs,
          maxBuffer: MAX_BUFFER_BYTES,
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({code: 0, stdout, stderr});
          } else if (typeof error.code === 'number') {
            resolve({code: error.code, stdout, stderr});
          } else {
            reject(error);
          }
        },
      );
    });
  }
}
