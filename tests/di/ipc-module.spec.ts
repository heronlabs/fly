import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {NestFactory} from '@nestjs/core';

// One temp dir for every app.getPath call, removed after the suite.
const userData = vi.hoisted(() => ({path: ''}));

vi.mock('electron', () => ({
  app: {getPath: () => userData.path},
  BrowserWindow: {getAllWindows: () => []},
  dialog: {},
  ipcMain: {handle: vi.fn(), on: vi.fn()},
}));

import {SessionHandler} from '../../src/application/ipc/handlers/session-handler';
import {SettingsHandler} from '../../src/application/ipc/handlers/settings-handler';
import {ShellHandler} from '../../src/application/ipc/handlers/shell-handler';
import {TerminalHandler} from '../../src/application/ipc/handlers/terminal-handler';
import {WorkspaceHandler} from '../../src/application/ipc/handlers/workspace-handler';
import {IpcModule} from '../../src/application/ipc/ipc-module';

describe('IpcModule (real Nest DI)', () => {
  beforeAll(() => {
    userData.path = mkdtempSync(join(tmpdir(), 'fly-di-'));
  });

  afterAll(() => {
    rmSync(userData.path, {recursive: true, force: true});
  });

  it('Should resolve and register every IPC handler', async () => {
    const context = await NestFactory.createApplicationContext(IpcModule, {
      logger: false,
      abortOnError: false,
    });

    try {
      expect(() => context.get(WorkspaceHandler).register()).not.toThrow();
      expect(() => context.get(SettingsHandler).register()).not.toThrow();
      expect(() => context.get(ShellHandler).register()).not.toThrow();

      const sessions = context.get(SessionHandler);
      expect(() => sessions.register()).not.toThrow();
      sessions.stop();

      expect(() => context.get(TerminalHandler).register()).not.toThrow();
    } finally {
      await context.close();
    }
  });
});
