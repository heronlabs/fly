import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import {UpdateService} from '../../../core/services/update-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

export const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class UpdateHandler {
  private readonly logger = new Logger(UpdateHandler.name);
  private timer: NodeJS.Timeout | undefined;
  private lastBroadcast = 'null';

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly updates: UpdateService,
  ) {}

  register(): void {
    this.host.handle(channels.updateGet, () => this.updates.current());
  }

  start(): void {
    this.stop();
    void this.tick();
    this.timer = setInterval(() => void this.tick(), UPDATE_CHECK_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    try {
      const notice = await this.updates.check();
      const serialized = JSON.stringify(notice);
      if (serialized !== this.lastBroadcast) {
        this.lastBroadcast = serialized;
        this.broadcaster.send(channels.updateChanged, notice);
      }
    } catch (error) {
      this.logger.error(
        `Falha ao verificar atualizações: ${errorMessage(error)}`,
      );
    }
  }
}
