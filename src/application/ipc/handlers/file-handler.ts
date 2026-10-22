import {Inject, Injectable} from '@nestjs/common';

import type {Eol} from '../../../core/domain/files';
import {channels} from '../../../core/domain/fly-api';
import {FileService} from '../../../core/services/file-service';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';

@Injectable()
export class FileHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly files: FileService,
  ) {}

  register(): void {
    this.host.handle(
      channels.fileList,
      (_event, worktreeId: string, dir: string) =>
        this.files.list(worktreeId, dir),
    );
    this.host.handle(
      channels.fileRead,
      (_event, worktreeId: string, path: string) =>
        this.files.read(worktreeId, path),
    );
    this.host.handle(
      channels.fileWrite,
      (
        _event,
        worktreeId: string,
        path: string,
        text: string,
        eol: Eol,
        expectedMtimeMs: number | null,
      ) => this.files.write(worktreeId, path, text, eol, expectedMtimeMs),
    );
    this.host.handle(
      channels.filePoll,
      (_event, worktreeId: string, openPaths: string[]) =>
        this.files.poll(worktreeId, openPaths),
    );
  }
}
