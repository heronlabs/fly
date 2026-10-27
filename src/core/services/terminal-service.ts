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

// Control sequences (CSI, SS3) are not typing.
// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO./g;
// eslint-disable-next-line no-control-regex
const PRINTABLE = /[^\x00-\x1f\x7f]/;

const clamp = (value: number): number => Math.max(MIN_SIZE, Math.floor(value));

@Injectable()
export class TerminalService {
  private readonly terminals = new Map<
    string,
    {process: TerminalProcess; sessionName: string}
  >();
  // Whether the user left unsent text in the session's input, per session.
  private readonly drafts = new Map<string, boolean>();

  constructor(
    private readonly launcher: SessionLauncher,
    private readonly spawner: TerminalSpawner,
    private readonly ids: IdGenerator,
  ) {}

  attach(sessionName: string, size: TerminalSize, sink: TerminalSink): string {
    const terminalId = this.ids.uuid();
    const {file, args} = this.launcher.attachCommand(sessionName);
    const terminal = this.spawner.spawn(file, args, size);
    const entry = {process: terminal, sessionName};
    this.terminals.set(terminalId, entry);
    // Events from a pty we already detached are dropped.
    terminal.onData(data => {
      if (this.terminals.get(terminalId) === entry) {
        sink.data(terminalId, data);
      }
    });
    terminal.onExit(exitCode => {
      if (this.terminals.get(terminalId) === entry) {
        this.terminals.delete(terminalId);
        sink.exit(terminalId, exitCode);
      }
    });
    return terminalId;
  }

  write(terminalId: string, data: string): void {
    const entry = this.terminals.get(terminalId);
    if (entry === undefined) return;
    this.trackDraft(entry.sessionName, data);
    entry.process.write(data);
  }

  hasDraft(sessionName: string): boolean {
    return this.drafts.get(sessionName) ?? false;
  }

  private trackDraft(sessionName: string, data: string): void {
    const text = data.replace(ESCAPES, '');
    const submit = Math.max(text.lastIndexOf('\r'), text.lastIndexOf('\x03'));
    if (submit >= 0) {
      this.drafts.set(sessionName, PRINTABLE.test(text.slice(submit + 1)));
    } else if (PRINTABLE.test(text)) {
      this.drafts.set(sessionName, true);
    }
  }

  resize(terminalId: string, size: TerminalSize): void {
    this.terminals
      .get(terminalId)
      ?.process.resize({cols: clamp(size.cols), rows: clamp(size.rows)});
  }

  detach(terminalId: string): void {
    const entry = this.terminals.get(terminalId);
    this.terminals.delete(terminalId);
    entry?.process.kill();
  }

  detachAll(): void {
    const all = [...this.terminals.values()];
    this.terminals.clear();
    for (const {process} of all) {
      process.kill();
    }
  }
}
