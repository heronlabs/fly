import 'reflect-metadata';

import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

import {NestFactory} from '@nestjs/core';
import {app, BrowserWindow} from 'electron';

import {SettingsHandler} from './application/ipc/handlers/settings-handler';
import {ShellHandler} from './application/ipc/handlers/shell-handler';
import {WorkspaceHandler} from './application/ipc/handlers/workspace-handler';
import {IpcModule} from './application/ipc/ipc-module';

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

function createWindow(): void {
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

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(indexFile);
  }
}

let context: Awaited<
  ReturnType<typeof NestFactory.createApplicationContext>
> | null = null;

app
  .whenReady()
  .then(async () => {
    context = await NestFactory.createApplicationContext(IpcModule, {
      logger: ['error', 'warn'],
    });
    context.get(WorkspaceHandler).register();
    context.get(SettingsHandler).register();
    context.get(ShellHandler).register();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o fly', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  context?.close().catch((error: unknown) => {
    console.error('Falha ao encerrar o contexto', error);
  });
});
