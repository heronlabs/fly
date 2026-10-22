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
  shell: {openExternal: vi.fn()},
}));

import {DiffHandler} from '../../src/application/ipc/handlers/diff-handler';
import {QueueHandler} from '../../src/application/ipc/handlers/queue-handler';
import {SessionHandler} from '../../src/application/ipc/handlers/session-handler';
import {SettingsHandler} from '../../src/application/ipc/handlers/settings-handler';
import {ShellHandler} from '../../src/application/ipc/handlers/shell-handler';
import {TerminalHandler} from '../../src/application/ipc/handlers/terminal-handler';
import {WorkspaceHandler} from '../../src/application/ipc/handlers/workspace-handler';
import {IpcModule} from '../../src/application/ipc/ipc-module';
import {CLAUDE_PROJECTS_DIR} from '../../src/infrastructure/claude/tokens';

describe('IpcModule (real Nest DI)', () => {
  // Transcripts resolve under this dir, never the real ~/.claude.
  let claudeConfigDir = '';
  let previousConfigDir: string | undefined;

  beforeAll(() => {
    userData.path = mkdtempSync(join(tmpdir(), 'fly-di-'));
    claudeConfigDir = mkdtempSync(join(tmpdir(), 'fly-di-claude-'));
    previousConfigDir = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = claudeConfigDir;
  });

  afterAll(() => {
    if (previousConfigDir === undefined) {
      delete process.env['CLAUDE_CONFIG_DIR'];
    } else {
      process.env['CLAUDE_CONFIG_DIR'] = previousConfigDir;
    }
    rmSync(claudeConfigDir, {recursive: true, force: true});
    rmSync(userData.path, {recursive: true, force: true});
  });

  it('Should resolve and register every IPC handler', async () => {
    const context = await NestFactory.createApplicationContext(IpcModule, {
      logger: false,
      abortOnError: false,
    });

    try {
      expect(context.get(CLAUDE_PROJECTS_DIR)).toBe(
        join(claudeConfigDir, 'projects'),
      );
      expect(() => context.get(WorkspaceHandler).register()).not.toThrow();
      expect(() => context.get(SettingsHandler).register()).not.toThrow();
      expect(() => context.get(ShellHandler).register()).not.toThrow();

      const sessions = context.get(SessionHandler);
      expect(() => sessions.register()).not.toThrow();
      sessions.stop();

      const queue = context.get(QueueHandler);
      expect(() => queue.register()).not.toThrow();
      queue.stop();

      expect(() => context.get(DiffHandler).register()).not.toThrow();
      expect(() => context.get(TerminalHandler).register()).not.toThrow();
    } finally {
      await context.close();
    }
  });
});
