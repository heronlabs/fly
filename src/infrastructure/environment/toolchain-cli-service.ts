import {Injectable} from '@nestjs/common';

import type {ToolId} from '../../core/domain/setup';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {Toolchain} from '../../core/interfaces/toolchain';
import {LoginShellEnvService, mergePath} from './login-shell-env-service';

const PROBE_TIMEOUT_MS = 10_000;
const BREW_INSTALL_TIMEOUT_MS = 600_000;
const STDERR_TAIL_LINES = 20;
const VERSION_PATTERN = /\d+(?:\.\d+)+[a-z]?/;
const VERSION_ARGS: Record<ToolId, string[]> = {
  git: ['--version'],
  gh: ['--version'],
  tmux: ['-V'],
  claude: ['--version'],
};

@Injectable()
export class ToolchainCliService extends Toolchain {
  private readonly loginShell: LoginShellEnvService;

  constructor(private readonly runner: CommandRunner) {
    super();
    this.loginShell = new LoginShellEnvService(runner);
  }

  async refreshPath(): Promise<void> {
    const env = await this.loginShell.resolve(
      process.env['SHELL'] ?? '/bin/zsh',
    );
    if (env.PATH !== undefined) {
      process.env['PATH'] = mergePath(process.env['PATH'], env.PATH);
    }
  }

  async version(tool: ToolId): Promise<string | null> {
    try {
      const result = await this.runner.run(tool, VERSION_ARGS[tool], {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      if (result.code !== 0) {
        return null;
      }
      const match = VERSION_PATTERN.exec(result.stdout);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  ghLoggedIn(): Promise<boolean> {
    return this.succeeds('gh', ['auth', 'status', '--hostname', 'github.com']);
  }

  hasBrew(): Promise<boolean> {
    return this.succeeds('brew', ['--version']);
  }

  async brewInstall(formula: string): Promise<void> {
    const prefix = `brew install ${formula} falhou: `;
    let result;
    try {
      result = await this.runner.run('brew', ['install', formula], {
        timeoutMs: BREW_INSTALL_TIMEOUT_MS,
      });
    } catch (error) {
      throw new Error(
        prefix + (error instanceof Error ? error.message : String(error)),
      );
    }
    if (result.code !== 0) {
      throw new Error(
        prefix +
          result.stderr.trim().split('\n').slice(-STDERR_TAIL_LINES).join('\n'),
      );
    }
  }

  private async succeeds(command: string, args: string[]): Promise<boolean> {
    try {
      const result = await this.runner.run(command, args, {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      return result.code === 0;
    } catch {
      return false;
    }
  }
}
