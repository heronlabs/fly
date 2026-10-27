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

// Not typing: X10 mouse reports, CSI (incl. SGR mouse), SS3 and Alt+Enter.
// eslint-disable-next-line no-control-regex
const ESCAPES = /\x1b\[M[\s\S]{3}|\x1b\[[0-?]*[ -/]*[@-~]|\x1bO.|\x1b[\r\n]/g;
// Not typing either: terminal replies (OSC colour queries answered by xterm.js,
// ended by BEL or ST; DCS, SOS, PM and APC strings ended by ST).
// eslint-disable-next-line no-control-regex
const REPLIES = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[PX^_][\s\S]*?\x1b\\/g;
// Bracketed paste markers: what lies between them is content, not keystrokes.
// eslint-disable-next-line no-control-regex
const PASTE_MARKERS = /(\x1b\[20[01]~)/;
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
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
  // Sessions whose last write left a bracketed paste open.
  private readonly pasting = new Map<string, boolean>();
  // Sessions whose last printable character written was a backslash: an Enter
  // right after it is a newline, not a submit.
  private readonly continued = new Map<string, boolean>();

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
    let inPaste = this.pasting.get(sessionName) ?? false;
    for (const part of data.split(PASTE_MARKERS)) {
      if (part === PASTE_START) {
        inPaste = true;
      } else if (part === PASTE_END) {
        inPaste = false;
      } else if (inPaste) {
        if (part !== '') {
          this.drafts.set(sessionName, true);
          this.continued.set(sessionName, false);
        }
      } else {
        this.trackTyped(sessionName, part);
      }
    }
    this.pasting.set(sessionName, inPaste);
  }

  private trackTyped(sessionName: string, data: string): void {
    let continued = this.continued.get(sessionName) === true;
    for (const char of data.replace(REPLIES, '').replace(ESCAPES, '')) {
      if (char === '\r' && continued) {
        continued = false;
      } else if (char === '\r' || char === '\x03') {
        this.drafts.set(sessionName, false);
      } else if (PRINTABLE.test(char)) {
        this.drafts.set(sessionName, true);
        continued = char === '\\';
      }
    }
    this.continued.set(sessionName, continued);
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
