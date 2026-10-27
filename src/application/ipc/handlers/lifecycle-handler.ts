import {Inject, Injectable} from '@nestjs/common';

import type {Channel} from '../../../core/domain/fly-api';
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
    this.handle(channels.prOpen, id => this.lifecycle.openPullRequest(id));
    this.handle(channels.prRerun, id => this.lifecycle.rerun(id));
    this.handle(channels.prResume, id => this.lifecycle.resume(id));
  }

  // The renderer sees the action's effect at once: the queue ticks after it.
  private handle(
    channel: Channel,
    action: (worktreeId: string) => Promise<void>,
  ): void {
    this.host.handle(channel, async (_event, worktreeId: string) => {
      await action(worktreeId);
      await this.queue.tick();
    });
  }
}
