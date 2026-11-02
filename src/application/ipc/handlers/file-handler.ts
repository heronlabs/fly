import {Inject, Injectable} from '@nestjs/common';

import type {Eol} from '../../../core/domain/files';
import {channels} from '../../../core/domain/fly-api';
import type {SearchQuery} from '../../../core/domain/search';
import type {Workspace} from '../../../core/domain/workspace';
import {FileService} from '../../../core/services/file-service';
import type {IpcEvent, IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';
import {WindowWorkspacesService} from '../window-workspaces-service';

@Injectable()
export class FileHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly files: FileService,
    private readonly windows: WindowWorkspacesService,
  ) {}

  register(): void {
    this.host.handle(
      channels.fileList,
      (event, worktreeId: string, dir: string) =>
        this.files.list(this.shown(event), worktreeId, dir),
    );
    this.host.handle(
      channels.fileRead,
      (event, worktreeId: string, path: string) =>
        this.files.read(this.shown(event), worktreeId, path),
    );
    this.host.handle(
      channels.fileWrite,
      (
        event,
        worktreeId: string,
        path: string,
        text: string,
        eol: Eol,
        expectedMtimeMs: number | null,
      ) =>
        this.files.write(
          this.shown(event),
          worktreeId,
          path,
          text,
          eol,
          expectedMtimeMs,
        ),
    );
    this.host.handle(
      channels.filePoll,
      (event, worktreeId: string, openPaths: string[]) =>
        this.files.poll(this.shown(event), worktreeId, openPaths),
    );
    this.host.handle(
      channels.fileSearch,
      (event, worktreeId: string, query: SearchQuery) =>
        this.files.search(this.shown(event), worktreeId, query),
    );
  }

  private shown(event: IpcEvent): Workspace | null {
    return this.windows.of(event.sender.id);
  }
}
