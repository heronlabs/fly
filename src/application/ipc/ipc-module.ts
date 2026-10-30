import {homedir} from 'node:os';
import {join, resolve} from 'node:path';

import {Module} from '@nestjs/common';
import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron';

import {AppInstaller} from '../../core/interfaces/app-installer';
import {AppRuntime} from '../../core/interfaces/app-runtime';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {ConfigStore} from '../../core/interfaces/config-store';
import {FileStore} from '../../core/interfaces/file-store';
import {IdGenerator} from '../../core/interfaces/id-generator';
import {ImageStore} from '../../core/interfaces/image-store';
import {PrGateway} from '../../core/interfaces/pr-gateway';
import {ReleaseSource} from '../../core/interfaces/release-source';
import {SessionLauncher} from '../../core/interfaces/session-launcher';
import {TaskFiles} from '../../core/interfaces/task-files';
import {TaskStore} from '../../core/interfaces/task-store';
import {TerminalSpawner} from '../../core/interfaces/terminal-spawner';
import {Toolchain} from '../../core/interfaces/toolchain';
import {TranscriptSource} from '../../core/interfaces/transcript-source';
import {VcsGateway} from '../../core/interfaces/vcs-gateway';
import {WorkspaceWatcher} from '../../core/interfaces/workspace-watcher';
import {CleanupService} from '../../core/services/cleanup-service';
import {DiffService} from '../../core/services/diff-service';
import {FileService} from '../../core/services/file-service';
import {LaunchService} from '../../core/services/launch-service';
import {LifecycleService} from '../../core/services/lifecycle-service';
import {QueueService} from '../../core/services/queue-service';
import {SessionService} from '../../core/services/session-service';
import {SettingsService} from '../../core/services/settings-service';
import {SetupService} from '../../core/services/setup-service';
import {TaskService} from '../../core/services/task-service';
import {TerminalService} from '../../core/services/terminal-service';
import {UpdateService} from '../../core/services/update-service';
import {WorkspaceService} from '../../core/services/workspace-service';
import {ClaudeTranscriptService} from '../../infrastructure/claude/claude-transcript-service';
import {CLAUDE_PROJECTS_DIR} from '../../infrastructure/claude/tokens';
import {CryptoIdGeneratorService} from '../../infrastructure/environment/crypto-id-generator-service';
import {JsonConfigStoreService} from '../../infrastructure/environment/json-config-store-service';
import {JsonTaskStoreService} from '../../infrastructure/environment/json-task-store-service';
import {MacosInstallerService} from '../../infrastructure/environment/macos-installer-service';
import {
  TRASH_ITEM,
  USER_DATA_DIR,
} from '../../infrastructure/environment/tokens';
import {ToolchainCliService} from '../../infrastructure/environment/toolchain-cli-service';
import {GitDirWatcherService} from '../../infrastructure/filesystem/git-dir-watcher-service';
import {NodeFileStoreService} from '../../infrastructure/filesystem/node-file-store-service';
import {NodeTaskFilesService} from '../../infrastructure/filesystem/node-task-files-service';
import {TempImageStoreService} from '../../infrastructure/filesystem/temp-image-store-service';
import {TEMP_DIR} from '../../infrastructure/filesystem/tokens';
import {GitCliService} from '../../infrastructure/git/git-cli-service';
import {GhCliService} from '../../infrastructure/github/gh-cli-service';
import {GhReleaseService} from '../../infrastructure/github/gh-release-service';
import {ExecCommandRunnerService} from '../../infrastructure/process/exec-command-runner-service';
import {NodePtyTerminalService} from '../../infrastructure/pty/node-pty-terminal-service';
import {TmuxSessionService} from '../../infrastructure/tmux/tmux-session-service';
import {TMUX_SOCKET} from '../../infrastructure/tmux/tokens';
import {AttachmentHandler} from './handlers/attachment-handler';
import {DiffHandler} from './handlers/diff-handler';
import {FileHandler} from './handlers/file-handler';
import {LaunchHandler} from './handlers/launch-handler';
import {LifecycleHandler} from './handlers/lifecycle-handler';
import {QueueHandler} from './handlers/queue-handler';
import {SessionHandler} from './handlers/session-handler';
import {SettingsHandler} from './handlers/settings-handler';
import {SetupHandler} from './handlers/setup-handler';
import {ShellHandler} from './handlers/shell-handler';
import {TerminalHandler} from './handlers/terminal-handler';
import {UpdateHandler} from './handlers/update-handler';
import {WorkspaceHandler} from './handlers/workspace-handler';
import type {
  Broadcaster,
  FilePicker,
  FolderPicker,
  LinkOpener,
} from './ipc-types';
import {
  BROADCASTER,
  FILE_PICKER,
  FOLDER_PICKER,
  IPC_HOST,
  LINK_OPENER,
} from './ipc-types';

@Module({
  providers: [
    {provide: CommandRunner, useClass: ExecCommandRunnerService},
    {provide: FileStore, useClass: NodeFileStoreService},
    {provide: TaskStore, useClass: JsonTaskStoreService},
    {provide: TaskFiles, useClass: NodeTaskFilesService},
    {provide: ImageStore, useClass: TempImageStoreService},
    {provide: VcsGateway, useClass: GitCliService},
    {provide: PrGateway, useClass: GhCliService},
    {provide: ReleaseSource, useClass: GhReleaseService},
    {provide: ConfigStore, useClass: JsonConfigStoreService},
    {provide: WorkspaceWatcher, useClass: GitDirWatcherService},
    {provide: SessionLauncher, useClass: TmuxSessionService},
    {provide: TerminalSpawner, useClass: NodePtyTerminalService},
    {provide: TMUX_SOCKET, useValue: null},
    {provide: Toolchain, useClass: ToolchainCliService},
    {provide: AppInstaller, useClass: MacosInstallerService},
    {
      provide: AppRuntime,
      useFactory: (): AppRuntime => ({
        bundlePath: app.isPackaged
          ? resolve(process.execPath, '../../..')
          : null,
        version: app.getVersion(),
      }),
    },
    {provide: TRASH_ITEM, useValue: (path: string) => shell.trashItem(path)},
    {provide: IdGenerator, useClass: CryptoIdGeneratorService},
    {provide: TranscriptSource, useClass: ClaudeTranscriptService},
    {
      provide: CLAUDE_PROJECTS_DIR,
      useFactory: () =>
        join(
          process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'),
          'projects',
        ),
    },
    {provide: USER_DATA_DIR, useFactory: () => app.getPath('userData')},
    {provide: TEMP_DIR, useFactory: () => app.getPath('temp')},
    {provide: IPC_HOST, useValue: ipcMain},
    {
      provide: FOLDER_PICKER,
      useValue: {
        pick: async () =>
          (await dialog.showOpenDialog({properties: ['openDirectory']}))
            .filePaths[0] ?? null,
      } satisfies FolderPicker,
    },
    {
      provide: FILE_PICKER,
      useValue: {
        pick: async () => {
          const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections'],
          });
          return result.canceled ? [] : result.filePaths;
        },
      } satisfies FilePicker,
    },
    {
      provide: LINK_OPENER,
      useValue: {
        open: url => shell.openExternal(url),
      } satisfies LinkOpener,
    },
    {
      provide: BROADCASTER,
      useFactory: (): Broadcaster => ({
        send: (channel, payload) =>
          BrowserWindow.getAllWindows().forEach(window =>
            window.webContents.send(channel, payload),
          ),
      }),
    },
    WorkspaceService,
    SettingsService,
    SessionService,
    TaskService,
    QueueService,
    CleanupService,
    LifecycleService,
    DiffService,
    FileService,
    TerminalService,
    LaunchService,
    SetupService,
    UpdateService,
    WorkspaceHandler,
    SettingsHandler,
    ShellHandler,
    SessionHandler,
    QueueHandler,
    LifecycleHandler,
    DiffHandler,
    FileHandler,
    TerminalHandler,
    AttachmentHandler,
    LaunchHandler,
    SetupHandler,
    UpdateHandler,
  ],
})
export class IpcModule {}
