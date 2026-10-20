import {Injectable} from '@nestjs/common';

import {IdGenerator} from '../interfaces/id-generator';
import {SessionLauncher} from '../interfaces/session-launcher';
import {
  TerminalProcess,
  TerminalSize,
  TerminalSpawner,
} from '../interfaces/terminal-spawner';

export type TerminalSink = {
  data(terminalId: string, data: string): void;
  exit(terminalId: string, exitCode: number): void;
};

const MIN_SIZE = 2;

const clamp = (value: number): number => Math.max(MIN_SIZE, Math.floor(value));

@Injectable()
export class TerminalService {
  private readonly terminals = new Map<string, TerminalProcess>();

  constructor(
    private readonly launcher: SessionLauncher,
    private readonly spawner: TerminalSpawner,
    private readonly ids: IdGenerator,
  ) {}

  attach(sessionName: string, size: TerminalSize, sink: TerminalSink): string {
    const terminalId = this.ids.uuid();
    const {file, args} = this.launcher.attachCommand(sessionName);
    const terminal = this.spawner.spawn(file, args, size);
    this.terminals.set(terminalId, terminal);
    // Events from a pty we already detached are dropped.
    terminal.onData(data => {
      if (this.terminals.get(terminalId) === terminal) {
        sink.data(terminalId, data);
      }
    });
    terminal.onExit(exitCode => {
      if (this.terminals.get(terminalId) === terminal) {
        this.terminals.delete(terminalId);
        sink.exit(terminalId, exitCode);
      }
    });
    return terminalId;
  }

  write(terminalId: string, data: string): void {
    this.terminals.get(terminalId)?.write(data);
  }

  resize(terminalId: string, size: TerminalSize): void {
    this.terminals
      .get(terminalId)
      ?.resize({cols: clamp(size.cols), rows: clamp(size.rows)});
  }

  detach(terminalId: string): void {
    const terminal = this.terminals.get(terminalId);
    this.terminals.delete(terminalId);
    terminal?.kill();
  }

  detachAll(): void {
    const all = [...this.terminals.values()];
    this.terminals.clear();
    for (const terminal of all) {
      terminal.kill();
    }
  }
}
