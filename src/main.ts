import 'reflect-metadata';

import {join} from 'node:path';

import {NestFactory} from '@nestjs/core';
import {app, BrowserWindow} from 'electron';

import {SettingsHandler} from './application/ipc/handlers/settings-handler';
import {ShellHandler} from './application/ipc/handlers/shell-handler';
import {WorkspaceHandler} from './application/ipc/handlers/workspace-handler';
import {IpcModule} from './application/ipc/ipc-module';

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
  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

let context: Awaited<
  ReturnType<typeof NestFactory.createApplicationContext>
> | null = null;

void app.whenReady().then(async () => {
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void context?.close();
});
