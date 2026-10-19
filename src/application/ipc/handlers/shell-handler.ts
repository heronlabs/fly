import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import {EditorLauncher} from '../../../core/interfaces/editor-launcher';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';

@Injectable()
export class ShellHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly editor: EditorLauncher,
  ) {}

  register(): void {
    this.host.handle(channels.shellOpenInEditor, (_event, path: string) =>
      this.editor.open(path),
    );
  }
}
