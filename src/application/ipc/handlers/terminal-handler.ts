import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {TerminalSize} from '../../../core/interfaces/terminal-spawner';
import type {TerminalSink} from '../../../core/services/terminal-service';
import {TerminalService} from '../../../core/services/terminal-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

export const TERMINAL_FLUSH_MS = 8;

type Pending = {windowId: number; data: string; timer: NodeJS.Timeout};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class TerminalHandler {
  private readonly logger = new Logger(TerminalHandler.name);
  private readonly pending = new Map<string, Pending>();
  // The window each live terminal was attached from.
  private readonly owners = new Map<string, number>();

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly terminals: TerminalService,
  ) {}

  register(): void {
    this.host.handle(
      channels.terminalAttach,
      async (event, sessionName: string, size: TerminalSize) => {
        const windowId = event.sender.id;
        const terminalId = await this.terminals.attach(
          sessionName,
          size,
          this.sinkFor(windowId),
        );
        this.owners.set(terminalId, windowId);
        return terminalId;
      },
    );
    this.host.handle(channels.terminalDetach, (_event, terminalId: string) =>
      this.detach(terminalId),
    );
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

  // A window reloaded or closed: forget its buffered output and kill its
  // ptys; the other windows' terminals live on.
  reset(windowId: number): void {
    for (const [terminalId, owner] of [...this.owners]) {
      if (owner === windowId) this.detach(terminalId);
    }
  }

  private detach(terminalId: string): void {
    this.drop(terminalId);
    this.owners.delete(terminalId);
    this.terminals.detach(terminalId);
  }

  // Called from inside pty callbacks: it must never throw.
  private sinkFor(windowId: number): TerminalSink {
    return {
      data: (terminalId, data) => {
        const current = this.pending.get(terminalId);
        if (current) {
          current.data += data;
          return;
        }
        const timer = setTimeout(
          () => this.flush(terminalId),
          TERMINAL_FLUSH_MS,
        );
        this.pending.set(terminalId, {windowId, data, timer});
      },
      exit: (terminalId, exitCode) => {
        this.flush(terminalId);
        this.owners.delete(terminalId);
        this.broadcast(windowId, channels.terminalExit, {terminalId, exitCode});
      },
    };
  }

  private flush(terminalId: string): void {
    const current = this.pending.get(terminalId);
    if (!current) return;
    this.drop(terminalId);
    this.broadcast(current.windowId, channels.terminalData, {
      terminalId,
      data: current.data,
    });
  }

  private drop(terminalId: string): void {
    const current = this.pending.get(terminalId);
    if (current) clearTimeout(current.timer);
    this.pending.delete(terminalId);
  }

  private broadcast(
    windowId: number,
    channel: typeof channels.terminalData | typeof channels.terminalExit,
    payload: unknown,
  ): void {
    try {
      this.broadcaster.sendTo(windowId, channel, payload);
    } catch (error) {
      this.logger.error(
        `Falha ao enviar saída do terminal: ${errorMessage(error)}`,
      );
    }
  }
}
