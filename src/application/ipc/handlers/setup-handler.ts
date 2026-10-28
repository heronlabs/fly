import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {SetupInfo, ToolId} from '../../../core/domain/setup';
import {SetupService} from '../../../core/services/setup-service';
import type {Broadcaster, IpcHost} from '../ipc-types';
import {BROADCASTER, IPC_HOST} from '../ipc-types';

@Injectable()
export class SetupHandler {
  private pending = false;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly setup: SetupService,
  ) {}

  register(): void {
    this.host.handle(channels.setupInfo, () => this.info());
    this.host.handle(channels.setupDoctor, () => this.setup.doctor());
    this.host.handle(channels.setupInstallTool, (_event, id) =>
      this.setup.installTool(id as ToolId),
    );
    this.host.handle(channels.setupCommandState, () =>
      this.setup.commandState(),
    );
    this.host.handle(channels.setupInstallCommand, () =>
      this.setup.installCommand(),
    );
    this.host.handle(channels.setupInstaller, () => this.setup.installer());
    this.host.handle(channels.setupTrashInstaller, (_event, imagePath) =>
      this.setup.trashInstaller(imagePath as string),
    );
    this.host.handle(channels.setupComplete, () => this.setup.complete());
  }

  // The wizard waits until the renderer asks for info: a window that is
  // still loading misses the broadcast and asks when it bootstraps.
  request(): void {
    this.pending = true;
    this.broadcaster.send(channels.setupRequested, null);
  }

  private info(): Promise<SetupInfo> {
    const requested = this.pending;
    this.pending = false;
    return this.setup.info(requested);
  }
}
