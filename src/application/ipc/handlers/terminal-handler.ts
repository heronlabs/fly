import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {TerminalSize} from '../../../core/interfaces/terminal-spawner';
import type {TerminalSink} from '../../../core/services/terminal-service';
import {TerminalService} from '../../../core/services/terminal-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

export const TERMINAL_FLUSH_MS = 8;

type Pending = {data: string; timer: NodeJS.Timeout};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class TerminalHandler {
  private readonly logger = new Logger(TerminalHandler.name);
  private readonly pending = new Map<string, Pending>();

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly terminals: TerminalService,
  ) {}

  register(): void {
    this.host.handle(
      channels.terminalAttach,
      (_event, sessionName: string, size: TerminalSize) =>
        this.terminals.attach(sessionName, size, this.sink),
    );
    this.host.handle(channels.terminalDetach, (_event, terminalId: string) => {
      this.drop(terminalId);
      this.terminals.detach(terminalId);
    });
    this.host.on(
      channels.terminalInput,
      (_event, terminalId: string, data: string) =>
        this.terminals.write(terminalId, data),
    );
    this.host.on(
      channels.terminalResize,
      (_event, terminalId: string, size: TerminalSize) =>
        this.terminals.resize(terminalId, size),
    );
  }

  // Renderer reload or window close: forget buffered output and kill every pty.
  reset(): void {
    for (const terminalId of [...this.pending.keys()]) this.drop(terminalId);
    this.terminals.detachAll();
  }

  // Called from inside pty callbacks: it must never throw.
  private readonly sink: TerminalSink = {
    data: (terminalId, data) => {
      const current = this.pending.get(terminalId);
      if (current) {
        current.data += data;
        return;
      }
      const timer = setTimeout(() => this.flush(terminalId), TERMINAL_FLUSH_MS);
      this.pending.set(terminalId, {data, timer});
    },
    exit: (terminalId, exitCode) => {
      this.flush(terminalId);
      this.broadcast(channels.terminalExit, {terminalId, exitCode});
    },
  };

  private flush(terminalId: string): void {
    const current = this.pending.get(terminalId);
    if (!current) return;
    this.drop(terminalId);
    this.broadcast(channels.terminalData, {terminalId, data: current.data});
  }

  private drop(terminalId: string): void {
    const current = this.pending.get(terminalId);
    if (current) clearTimeout(current.timer);
    this.pending.delete(terminalId);
  }

  private broadcast(
    channel: typeof channels.terminalData | typeof channels.terminalExit,
    payload: unknown,
  ): void {
    try {
      this.broadcaster.send(channel, payload);
    } catch (error) {
      this.logger.error(
        `Falha ao enviar saída do terminal: ${errorMessage(error)}`,
      );
    }
  }
}
