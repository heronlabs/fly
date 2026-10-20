import {homedir} from 'node:os';

import {Injectable} from '@nestjs/common';
import {spawn} from 'node-pty';

import {
  TerminalProcess,
  TerminalSize,
  TerminalSpawner,
} from '../../core/interfaces/terminal-spawner';

// tmux refuses to attach from inside another tmux client when TMUX is set.
const DROPPED_ENV = new Set(['TMUX', 'TMUX_PANE']);

const ptyEnv = (): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !DROPPED_ENV.has(key)) {
      env[key] = value;
    }
  }
  return {
    ...env,
    COLORTERM: 'truecolor',
    LANG: process.env.LANG ?? 'en_US.UTF-8',
  };
};

@Injectable()
export class NodePtyTerminalService extends TerminalSpawner {
  spawn(file: string, args: string[], size: TerminalSize): TerminalProcess {
    const pty = spawn(file, args, {
      // node-pty's Unix backend exports this name as TERM in the child environment.
      name: 'xterm-256color',
      cols: size.cols,
      rows: size.rows,
      cwd: homedir(),
      env: ptyEnv(),
    });
    return {
      onData: listener => {
        pty.onData(listener);
      },
      onExit: listener => {
        pty.onExit(({exitCode}) => listener(exitCode));
      },
      write: data => pty.write(data),
      resize: ({cols, rows}) => pty.resize(cols, rows),
      kill: () => pty.kill(),
    };
  }
}
