import {Inject, Injectable} from '@nestjs/common';

import type {Channel} from '../../../core/domain/fly-api';
import {channels} from '../../../core/domain/fly-api';
import type {Workspace} from '../../../core/domain/workspace';
import {LifecycleService} from '../../../core/services/lifecycle-service';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';
import {WindowWorkspacesService} from '../window-workspaces-service';
import {QueueHandler} from './queue-handler';

@Injectable()
export class LifecycleHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly lifecycle: LifecycleService,
    private readonly queue: QueueHandler,
    private readonly windows: WindowWorkspacesService,
  ) {}

  register(): void {
    this.handle(channels.prOpen, (shown, id) =>
      this.lifecycle.openPullRequest(shown, id),
    );
    this.handle(channels.prRerun, (shown, id) =>
      this.lifecycle.rerun(shown, id),
    );
    this.handle(channels.prResume, (shown, id) =>
      this.lifecycle.resume(shown, id),
    );
    this.handle(channels.prClean, (shown, id, confirmed) =>
      this.lifecycle.clean(shown, id, confirmed),
    );
  }

  // Acts on the folder of the window that asked; the renderer sees the
  // action's effect at once: the queue ticks after it.
  private handle(
    channel: Channel,
    action: (
      shown: Workspace | null,
      worktreeId: string,
      confirmed: boolean,
    ) => Promise<void>,
  ): void {
    this.host.handle(
      channel,
      async (event, worktreeId: string, confirmed: boolean) => {
        await action(this.windows.of(event.sender.id), worktreeId, confirmed);
        await this.queue.tick();
      },
    );
  }
}
