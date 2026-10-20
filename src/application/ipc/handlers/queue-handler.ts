import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {QueueSnapshot} from '../../../core/domain/queue';
import {QueueService} from '../../../core/services/queue-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

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
  private lastBroadcast: string | null = null;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly queue: QueueService,
  ) {}

  register(): void {
    this.host.handle(channels.queueList, () => this.list());
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

  private async list(): Promise<QueueSnapshot> {
    // Another folder may be open now: refresh its PRs (skipped while one runs).
    void this.refresh();
    return this.queue.snapshot();
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const snapshot = await this.queue.snapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized !== this.lastBroadcast) {
        this.lastBroadcast = serialized;
        this.broadcaster.send(channels.queueChanged, snapshot);
      }
    } catch (error) {
      this.logger.error(`Falha ao atualizar a fila: ${errorMessage(error)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.queue.refreshPullRequests();
      await this.tick();
    } catch (error) {
      this.logger.error(`Falha ao consultar PRs: ${errorMessage(error)}`);
    } finally {
      this.refreshing = false;
    }
  }
}
