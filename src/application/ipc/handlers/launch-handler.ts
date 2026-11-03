import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {LaunchRequest} from '../../../core/domain/launch';
import {LaunchService} from '../../../core/services/launch-service';
import {SettingsService} from '../../../core/services/settings-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';
import {WindowWorkspacesService} from '../window-workspaces-service';

@Injectable()
export class LaunchHandler {
  // The `fly <pasta>` folder each window has yet to take.
  private readonly pending = new Map<number, string>();

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly launches: LaunchService,
    private readonly windows: WindowWorkspacesService,
    private readonly settings: SettingsService,
  ) {}

  register(): void {
    this.host.handle(channels.launchTake, event => this.take(event.sender.id));
  }

  // The window that already shows the folder's root, so `fly <pasta>` lands
  // there; null when none does or the folder is gone (a new window then
  // shows why).
  async windowFor(folder: string): Promise<number | null> {
    try {
      const {root} = await this.launches.plan(folder);
      return this.windows.windowOf(root);
    } catch {
      return null;
    }
  }

  // The folder waits until the window takes it: a window that is still
  // loading misses the message and takes it when it bootstraps.
  request(windowId: number, folder: string | null): void {
    if (folder === null) return;
    this.pending.set(windowId, folder);
    this.broadcaster.sendTo(windowId, channels.launchRequested, null);
  }

  forget(windowId: number): void {
    this.pending.delete(windowId);
  }

  // A requested folder first; else a reloaded window gets its own folder back,
  // and only the first window brings back the last folder used: another one
  // starts empty, so it never doubles a folder already open.
  private async take(windowId: number): Promise<LaunchRequest | null> {
    const folder = this.pending.get(windowId);
    if (folder !== undefined) {
      this.pending.delete(windowId);
      const plan = await this.launches.plan(folder);
      return {root: plan.root, worktreeId: plan.worktreeId};
    }
    const shown = this.windows.of(windowId);
    if (shown) return {root: shown.root, worktreeId: null};
    if (this.windows.all().length > 0) return null;
    const [last] = (await this.settings.get()).recentRoots;
    return last === undefined ? null : {root: last, worktreeId: null};
  }
}
