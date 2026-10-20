import {homedir} from 'node:os';
import {join} from 'node:path';

import {Module} from '@nestjs/common';
import {app, BrowserWindow, dialog, ipcMain} from 'electron';

import {CommandRunner} from '../../core/interfaces/command-runner';
import {ConfigStore} from '../../core/interfaces/config-store';
import {EditorLauncher} from '../../core/interfaces/editor-launcher';
import {FileStore} from '../../core/interfaces/file-store';
import {IdGenerator} from '../../core/interfaces/id-generator';
import {SessionLauncher} from '../../core/interfaces/session-launcher';
import {TerminalSpawner} from '../../core/interfaces/terminal-spawner';
import {TranscriptSource} from '../../core/interfaces/transcript-source';
import {VcsGateway} from '../../core/interfaces/vcs-gateway';
import {WorkspaceWatcher} from '../../core/interfaces/workspace-watcher';
import {SessionService} from '../../core/services/session-service';
import {SettingsService} from '../../core/services/settings-service';
import {TaskService} from '../../core/services/task-service';
import {TerminalService} from '../../core/services/terminal-service';
import {WorkspaceService} from '../../core/services/workspace-service';
import {ClaudeTranscriptService} from '../../infrastructure/claude/claude-transcript-service';
import {CLAUDE_PROJECTS_DIR} from '../../infrastructure/claude/tokens';
import {CryptoIdGeneratorService} from '../../infrastructure/environment/crypto-id-generator-service';
import {JsonConfigStoreService} from '../../infrastructure/environment/json-config-store-service';
import {USER_DATA_DIR} from '../../infrastructure/environment/tokens';
import {VscodeEditorLauncherService} from '../../infrastructure/environment/vscode-editor-launcher-service';
import {GitDirWatcherService} from '../../infrastructure/filesystem/git-dir-watcher-service';
import {NodeFileStoreService} from '../../infrastructure/filesystem/node-file-store-service';
import {GitCliService} from '../../infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from '../../infrastructure/process/exec-command-runner-service';
import {NodePtyTerminalService} from '../../infrastructure/pty/node-pty-terminal-service';
import {TmuxSessionService} from '../../infrastructure/tmux/tmux-session-service';
import {TMUX_SOCKET} from '../../infrastructure/tmux/tokens';
import {SessionHandler} from './handlers/session-handler';
import {SettingsHandler} from './handlers/settings-handler';
import {ShellHandler} from './handlers/shell-handler';
import {TerminalHandler} from './handlers/terminal-handler';
import {WorkspaceHandler} from './handlers/workspace-handler';
import type {Broadcaster, FolderPicker} from './ipc-types';
import {BROADCASTER, FOLDER_PICKER, IPC_HOST} from './ipc-types';

@Module({
  providers: [
    {provide: CommandRunner, useClass: ExecCommandRunnerService},
    {provide: FileStore, useClass: NodeFileStoreService},
    {provide: VcsGateway, useClass: GitCliService},
    {provide: ConfigStore, useClass: JsonConfigStoreService},
    {provide: EditorLauncher, useClass: VscodeEditorLauncherService},
    {provide: WorkspaceWatcher, useClass: GitDirWatcherService},
    {provide: SessionLauncher, useClass: TmuxSessionService},
    {provide: TerminalSpawner, useClass: NodePtyTerminalService},
    {provide: TMUX_SOCKET, useValue: null},
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
    TerminalService,
    WorkspaceHandler,
    SettingsHandler,
    ShellHandler,
    SessionHandler,
    TerminalHandler,
  ],
})
export class IpcModule {}
