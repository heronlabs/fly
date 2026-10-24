import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {LaunchRequest} from '../../../core/domain/launch';
import {LaunchService} from '../../../core/services/launch-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

@Injectable()
export class LaunchHandler {
  private pending: string | null = null;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly launches: LaunchService,
  ) {}

  register(): void {
    this.host.handle(channels.launchTake, () => this.take());
  }

  // The folder waits until the renderer takes it: a window that is still
  // loading misses the broadcast and takes it when it bootstraps.
  request(folder: string | null): void {
    if (folder === null) return;
    this.pending = folder;
    this.broadcaster.send(channels.launchRequested, null);
  }

  private async take(): Promise<LaunchRequest | null> {
    const folder = this.pending;
    if (folder === null) return null;
    this.pending = null;
    const plan = await this.launches.plan(folder);
    return {root: plan.root, worktreeId: plan.worktreeId};
  }
}
