import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {AppConfig} from '../../../core/domain/settings';
import {SettingsService} from '../../../core/services/settings-service';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';

@Injectable()
export class SettingsHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly settings: SettingsService,
  ) {}

  register(): void {
    this.host.handle(channels.settingsGet, () => this.settings.get());
    this.host.handle(
      channels.settingsSet,
      (_event, patch: Partial<AppConfig>) => this.settings.update(patch),
    );
  }
}
