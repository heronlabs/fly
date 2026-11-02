import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {Workspace} from '../../../core/domain/workspace';
import {WorkspaceWatcher} from '../../../core/interfaces/workspace-watcher';
import {SettingsService} from '../../../core/services/settings-service';
import {WorkspaceService} from '../../../core/services/workspace-service';
import type {Broadcaster, FolderPicker, IpcHost} from '../ipc-types';
import {BROADCASTER, FOLDER_PICKER, IPC_HOST} from '../ipc-types';
import {WindowWorkspacesService} from '../window-workspaces-service';

@Injectable()
export class WorkspaceHandler {
  private readonly logger = new Logger(WorkspaceHandler.name);
  // Each window watches the repos of its own workspace.
  private readonly disposers = new Map<number, () => void>();

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    @Inject(FOLDER_PICKER) private readonly picker: FolderPicker,
    private readonly workspaces: WorkspaceService,
    private readonly settings: SettingsService,
    private readonly watcher: WorkspaceWatcher,
    private readonly windows: WindowWorkspacesService,
  ) {}

  register(): void {
    this.host.handle(channels.workspacePickFolder, () => this.picker.pick());
    this.host.handle(channels.workspaceOpen, (event, root: string) =>
      this.open(event.sender.id, root),
    );
    this.host.handle(channels.workspaceRefresh, event =>
      this.refresh(event.sender.id),
    );
  }

  // A closed window takes its workspace and its watcher with it.
  forget(windowId: number): void {
    this.disposers.get(windowId)?.();
    this.disposers.delete(windowId);
    this.windows.forget(windowId);
  }

  private async open(windowId: number, root: string): Promise<Workspace> {
    let workspace: Workspace;
    try {
      workspace = await this.load(windowId, root);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Não foi possível abrir ${root}: ${message}`);
    }
    try {
      await this.settings.rememberRoot(root);
    } catch (error) {
      this.logger.error(
        `Falha ao lembrar ${root}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return workspace;
  }

  private async refresh(windowId: number): Promise<Workspace> {
    const shown = this.windows.of(windowId);
    if (shown === null) throw new Error('Nenhuma pasta aberta');
    return this.load(windowId, shown.root);
  }

  private async load(windowId: number, root: string): Promise<Workspace> {
    const workspace = await this.workspaces.discover(root);
    this.windows.set(windowId, workspace);
    this.rewatch(windowId, root, workspace);
    return workspace;
  }

  private rewatch(windowId: number, root: string, workspace: Workspace): void {
    this.disposers.get(windowId)?.();
    const paths = this.repoPaths(workspace);
    this.disposers.set(
      windowId,
      this.watcher.watch(
        paths,
        () => void this.onChange(windowId, root, paths),
      ),
    );
  }

  private repoPaths(workspace: Workspace): string[] {
    return workspace.repos.map(repo => repo.path).sort();
  }

  private async onChange(
    windowId: number,
    root: string,
    watched: string[],
  ): Promise<void> {
    try {
      const workspace = await this.workspaces.discover(root);
      // The window opened another folder, or closed, meanwhile.
      if (this.windows.of(windowId)?.root !== root) return;
      this.windows.set(windowId, workspace);
      const paths = this.repoPaths(workspace);
      if (paths.join('\0') !== watched.join('\0')) {
        this.rewatch(windowId, root, workspace);
      }
      this.broadcaster.sendTo(windowId, channels.workspaceChanged, workspace);
    } catch (error) {
      this.logger.error(
        `Falha ao redescobrir ${root}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
