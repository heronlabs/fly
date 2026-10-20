import {Inject, Injectable} from '@nestjs/common';

import {
  CommandResult,
  CommandRunner,
} from '../../core/interfaces/command-runner';
import {
  FlyOption,
  flyOptions,
  MultiplexerSession,
  SessionLauncher,
} from '../../core/interfaces/session-launcher';
import {TMUX_SOCKET} from './tokens';

const LIST_FORMAT = [
  '#{session_name}',
  '#{pane_current_path}',
  '#{session_created}',
  '#{session_attached}',
  ...flyOptions.map(option => `#{${option}}`),
].join('\t');

const NO_SERVER = /no server running|error connecting to/;

// A hung tmux must not stall the session poll forever.
const TMUX_TIMEOUT_MS = 5000;

@Injectable()
export class TmuxSessionService extends SessionLauncher {
  constructor(
    @Inject(TMUX_SOCKET) private readonly socket: string | null,
    private readonly runner: CommandRunner,
  ) {
    super();
  }

  async list(): Promise<MultiplexerSession[]> {
    const result = await this.tmux(['list-sessions', '-F', LIST_FORMAT]);
    if (result.code !== 0) {
      if (NO_SERVER.test(result.stderr)) {
        return [];
      }
      throw this.failure(result, 'list-sessions');
    }
    return result.stdout
      .split('\n')
      .filter(line => line !== '')
      .map(line => this.parseLine(line));
  }

  async start(input: {
    name: string;
    cwd: string;
    command: string;
    env?: Record<string, string>;
    options: Partial<Record<FlyOption, string>>;
  }): Promise<void> {
    // set-option and new-window parse -t as a pane/window target, where a bare
    // `=name` fails ("no such session"); the trailing colon makes it a session.
    const target = `=${input.name}:`;
    const firstWindow = await this.checked(
      [
        'new-session',
        '-d',
        '-s',
        input.name,
        '-c',
        input.cwd,
        '-P',
        '-F',
        '#{window_id}',
      ],
      'new-session',
    );
    try {
      // history-limit only applies to windows created after it is set, hence
      // the second window and the removal of the first.
      await this.checked(
        ['set-option', '-t', target, 'mouse', 'on'],
        'set-option',
      );
      await this.checked(
        ['set-option', '-t', target, 'status', 'off'],
        'set-option',
      );
      await this.checked(
        ['set-option', '-t', target, 'history-limit', '10000'],
        'set-option',
      );
      for (const option of flyOptions) {
        const value = input.options[option];
        if (value !== undefined) {
          await this.setOption(input.name, option, value);
        }
      }
      const env = Object.entries(input.env ?? {}).flatMap(([key, value]) => [
        '-e',
        `${key}=${value}`,
      ]);
      const secondWindow = await this.checked(
        [
          'new-window',
          '-d',
          '-t',
          target,
          '-c',
          input.cwd,
          ...env,
          '-P',
          '-F',
          '#{window_id}',
        ],
        'new-window',
      );
      await this.checked(['kill-window', '-t', firstWindow], 'kill-window');
      await this.checked(
        ['send-keys', '-t', secondWindow, '-l', input.command],
        'send-keys',
      );
      await this.checked(
        ['send-keys', '-t', secondWindow, 'Enter'],
        'send-keys',
      );
    } catch (error) {
      // A half-built session would otherwise be bound as a pending task.
      await this.kill(input.name).catch(() => undefined);
      throw error;
    }
  }

  async setOption(
    name: string,
    option: FlyOption,
    value: string,
  ): Promise<void> {
    await this.checked(
      ['set-option', '-t', `=${name}:`, option, encodeURIComponent(value)],
      'set-option',
    );
  }

  async kill(name: string): Promise<void> {
    await this.checked(['kill-session', '-t', `=${name}`], 'kill-session');
  }

  attachCommand(name: string): {file: string; args: string[]} {
    return {
      file: 'tmux',
      args: [...this.socketArgs(), '-u', 'attach-session', '-t', `=${name}`],
    };
  }

  private parseLine(line: string): MultiplexerSession {
    const [name = '', cwd = '', created = '', attached = '', ...values] =
      line.split('\t');
    const options: Partial<Record<FlyOption, string>> = {};
    flyOptions.forEach((option, index) => {
      const value = values[index];
      if (value) {
        options[option] = decodeURIComponent(value);
      }
    });
    return {
      name,
      cwd,
      createdAt: Number(created),
      attachedClients: Number(attached),
      options,
    };
  }

  private socketArgs(): string[] {
    return this.socket === null ? [] : ['-L', this.socket];
  }

  private tmux(args: string[]): Promise<CommandResult> {
    return this.runner.run('tmux', [...this.socketArgs(), ...args], {
      timeoutMs: TMUX_TIMEOUT_MS,
    });
  }

  private async checked(args: string[], subcommand: string): Promise<string> {
    const result = await this.tmux(args);
    if (result.code !== 0) {
      throw this.failure(result, subcommand);
    }
    return result.stdout.trim();
  }

  private failure(result: CommandResult, subcommand: string): Error {
    return new Error(result.stderr.trim() || `tmux ${subcommand} failed`);
  }
}
