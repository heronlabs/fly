import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import {LifecycleService} from '../../../core/services/lifecycle-service';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';
import {QueueHandler} from './queue-handler';

@Injectable()
export class LifecycleHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly lifecycle: LifecycleService,
    private readonly queue: QueueHandler,
  ) {}

  register(): void {
    this.host.handle(channels.prOpen, async (_event, worktreeId: string) => {
      await this.lifecycle.openPullRequest(worktreeId);
      await this.queue.tick();
    });
  }
}
