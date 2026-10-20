import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {Workspace} from '../../../core/domain/workspace';
import {WorkspaceWatcher} from '../../../core/interfaces/workspace-watcher';
import {SessionService} from '../../../core/services/session-service';
import {SettingsService} from '../../../core/services/settings-service';
import {WorkspaceService} from '../../../core/services/workspace-service';
import type {Broadcaster, FolderPicker, IpcHost} from '../ipc-types';
import {BROADCASTER, FOLDER_PICKER, IPC_HOST} from '../ipc-types';

@Injectable()
export class WorkspaceHandler {
  private readonly logger = new Logger(WorkspaceHandler.name);
  private currentRoot: string | null = null;
  private disposeWatcher: (() => void) | null = null;
  private watchedPaths: string[] = [];

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    @Inject(FOLDER_PICKER) private readonly picker: FolderPicker,
    private readonly workspaces: WorkspaceService,
    private readonly settings: SettingsService,
    private readonly watcher: WorkspaceWatcher,
    private readonly sessions: SessionService,
  ) {}

  register(): void {
    this.host.handle(channels.workspacePickFolder, () => this.picker.pick());
    this.host.handle(channels.workspaceOpen, (_event, root: string) =>
      this.open(root),
    );
    this.host.handle(channels.workspaceRefresh, () => this.refresh());
  }

  private async open(root: string): Promise<Workspace> {
    let workspace: Workspace;
    try {
      workspace = await this.load(root);
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

  private async refresh(): Promise<Workspace> {
    if (this.currentRoot === null) throw new Error('Nenhuma pasta aberta');
    return this.load(this.currentRoot);
  }

  private async load(root: string): Promise<Workspace> {
    const workspace = await this.workspaces.discover(root);
    this.currentRoot = root;
    this.sessions.setWorkspace(workspace);
    this.rewatch(root, workspace);
    return workspace;
  }

  private rewatch(root: string, workspace: Workspace): void {
    this.disposeWatcher?.();
    this.watchedPaths = this.repoPaths(workspace);
    this.disposeWatcher = this.watcher.watch(
      this.watchedPaths,
      () => void this.onChange(root),
    );
  }

  private repoPaths(workspace: Workspace): string[] {
    return workspace.repos.map(repo => repo.path).sort();
  }

  private async onChange(root: string): Promise<void> {
    try {
      const workspace = await this.workspaces.discover(root);
      if (this.currentRoot !== root) return;
      this.sessions.setWorkspace(workspace);
      const paths = this.repoPaths(workspace);
      if (paths.join('\0') !== this.watchedPaths.join('\0')) {
        this.rewatch(root, workspace);
      }
      this.broadcaster.send(channels.workspaceChanged, workspace);
    } catch (error) {
      this.logger.error(
        `Falha ao redescobrir ${root}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
