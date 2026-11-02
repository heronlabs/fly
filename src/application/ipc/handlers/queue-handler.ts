import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {QueueSnapshot} from '../../../core/domain/queue';
import {LifecycleService} from '../../../core/services/lifecycle-service';
import {QueueService} from '../../../core/services/queue-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';
import {WindowBroadcast} from '../window-broadcast';
import {WindowWorkspacesService} from '../window-workspaces-service';

export const QUEUE_POLL_MS = 3000;
export const PR_POLL_MS = 30_000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class QueueHandler {
  private readonly logger = new Logger(QueueHandler.name);
  private tickTimer: NodeJS.Timeout | null = null;
  private prTimer: NodeJS.Timeout | null = null;
  private ticking = false;
  private refreshing = false;
  private readonly broadcast: WindowBroadcast<QueueSnapshot>;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) broadcaster: Broadcaster,
    private readonly queue: QueueService,
    private readonly lifecycle: LifecycleService,
    private readonly windows: WindowWorkspacesService,
  ) {
    this.broadcast = new WindowBroadcast(
      broadcaster,
      channels.queueChanged,
      workspace => this.queue.snapshot(workspace),
      error =>
        this.logger.error(`Falha ao atualizar a fila: ${errorMessage(error)}`),
    );
  }

  register(): void {
    this.host.handle(channels.queueList, event => this.list(event.sender.id));
    this.host.handle(channels.prMerge, async (event, worktreeId: string) => {
      await this.lifecycle.merge(this.windows.of(event.sender.id), worktreeId);
      await this.tick();
    });
    this.stop();
    this.tickTimer = setInterval(() => void this.tick(), QUEUE_POLL_MS);
    this.tickTimer.unref();
    this.prTimer = setInterval(() => void this.refresh(), PR_POLL_MS);
    this.prTimer.unref();
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.prTimer) clearInterval(this.prTimer);
    this.tickTimer = null;
    this.prTimer = null;
  }

  private async list(windowId: number): Promise<QueueSnapshot> {
    // The window may have opened another folder: refresh the PRs (skipped
    // while a refresh runs).
    void this.refresh();
    return this.queue.snapshot(this.windows.of(windowId));
  }

  // The tasks of every open folder move along; each window then gets the
  // queue of its own.
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      try {
        await this.lifecycle.tick(this.windows.all());
      } catch (error) {
        this.logger.error(`Falha no ciclo das tarefas: ${errorMessage(error)}`);
      }
      await this.broadcast.update(this.windows.entries());
    } finally {
      this.ticking = false;
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const open = this.windows.all();
      await this.queue.refreshPullRequests(open);
      try {
        await this.lifecycle.poll(open);
      } catch (error) {
        this.logger.error(`Falha ao acompanhar a CI: ${errorMessage(error)}`);
      }
      await this.tick();
    } catch (error) {
      this.logger.error(`Falha ao consultar PRs: ${errorMessage(error)}`);
    } finally {
      this.refreshing = false;
    }
  }
}
