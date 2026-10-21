import {Inject, Injectable} from '@nestjs/common';

import type {DiffScope} from '../../../core/domain/diff';
import {channels} from '../../../core/domain/fly-api';
import {DiffService} from '../../../core/services/diff-service';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';

@Injectable()
export class DiffHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly diffs: DiffService,
  ) {}

  register(): void {
    this.host.handle(
      channels.diffGet,
      (_event, worktreeId: string, scope: DiffScope) =>
        this.diffs.read(worktreeId, scope),
    );
  }
}
