import 'reflect-metadata';

import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {NestFactory} from '@nestjs/core';
import {app, BrowserWindow, Menu, nativeImage} from 'electron';

import {appMenuTemplate} from './application/ipc/app-menu';
import {AttachmentHandler} from './application/ipc/handlers/attachment-handler';
import {DiffHandler} from './application/ipc/handlers/diff-handler';
import {FileHandler} from './application/ipc/handlers/file-handler';
import {LaunchHandler} from './application/ipc/handlers/launch-handler';
import {LifecycleHandler} from './application/ipc/handlers/lifecycle-handler';
import {QueueHandler} from './application/ipc/handlers/queue-handler';
import {SessionHandler} from './application/ipc/handlers/session-handler';
import {SettingsHandler} from './application/ipc/handlers/settings-handler';
import {SetupHandler} from './application/ipc/handlers/setup-handler';
import {ShellHandler} from './application/ipc/handlers/shell-handler';
import {TerminalHandler} from './application/ipc/handlers/terminal-handler';
import {WorkspaceHandler} from './application/ipc/handlers/workspace-handler';
import {IpcModule} from './application/ipc/ipc-module';
import {launchFolder} from './application/ipc/launch-args';
import {userDataFolder} from './core/domain/app-data';
import {
  LoginShellEnvService,
  mergePath,
} from './infrastructure/environment/login-shell-env-service';
import {ExecCommandRunnerService} from './infrastructure/process/exec-command-runner-service';

function isAppUrl(
  url: string,
  rendererUrl: string | undefined,
  indexFile: string,
): boolean {
  try {
    const target = new URL(url);
    if (rendererUrl) return target.origin === new URL(rendererUrl).origin;
    return (
      target.protocol === 'file:' &&
      target.pathname === pathToFileURL(indexFile).pathname
    );
  } catch {
    return false;
  }
}

// onReset runs when the renderer reloads or the window closes.
function createWindow(onReset: () => void): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: {x: 14, y: 14},
    backgroundColor: '#051528',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const indexFile = join(__dirname, '../renderer/index.html');

  // Dropping a file on the window must never navigate away from the app.
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, rendererUrl, indexFile)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('did-start-loading', onReset);
  window.on('closed', onReset);

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(indexFile);
  }
}

let context: Awaited<
  ReturnType<typeof NestFactory.createApplicationContext>
> | null = null;

// Dev and installed builds keep separate data; set before the lock, which
// lives in userData.
app.setPath(
  'userData',
  join(app.getPath('appData'), userDataFolder(app.isPackaged)),
);

// A second `fly <pasta>` hands its argv to this instance and quits.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

const folderOf = (argv: string[], cwd: string): string | null =>
  launchFolder(argv, {cwd, defaultApp: process.defaultApp});

const booted = app
  .whenReady()
  .then(async () => {
    if (!primary) return null;
    // Apps launched from Finder get a minimal PATH; load the login shell's.
    const env = await new LoginShellEnvService(
      new ExecCommandRunnerService(),
    ).resolve(process.env['SHELL'] ?? '/bin/zsh');
    process.env['PATH'] = mergePath(process.env['PATH'], env.PATH);
    process.env['LANG'] ??= env.LANG ?? 'en_US.UTF-8';
    context = await NestFactory.createApplicationContext(IpcModule, {
      logger: ['error', 'warn'],
    });
    context.get(WorkspaceHandler).register();
    context.get(SettingsHandler).register();
    context.get(ShellHandler).register();
    context.get(SessionHandler).register();
    context.get(QueueHandler).register();
    context.get(LifecycleHandler).register();
    context.get(DiffHandler).register();
    context.get(FileHandler).register();
    context.get(AttachmentHandler).register();
    const terminalHandler = context.get(TerminalHandler);
    terminalHandler.register();
    const onReset = () => terminalHandler.reset();
    const launch = context.get(LaunchHandler);
    launch.register();
    launch.request(folderOf(process.argv, process.cwd()));
    const setupHandler = context.get(SetupHandler);
    setupHandler.register();
    if (app.isPackaged) {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate(appMenuTemplate(() => setupHandler.request())),
      );
    }
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock?.setIcon(
        nativeImage.createFromPath(join(app.getAppPath(), 'build/icon.png')),
      );
    }
    createWindow(onReset);
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(onReset);
    });
    return {launch, onReset};
  })
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o fly', error);
    app.quit();
    return null;
  });

app.on('second-instance', (_event, argv, workingDirectory) => {
  void booted.then(state => {
    if (!state) return;
    state.launch.request(folderOf(argv, workingDirectory));
    const [window] = BrowserWindow.getAllWindows();
    if (!window) {
      createWindow(state.onReset);
      return;
    }
    if (window.isMinimized()) window.restore();
    window.focus();
    app.focus({steal: true});
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  context?.close().catch((error: unknown) => {
    console.error('Falha ao encerrar o contexto', error);
  });
});
