import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {ExecCommandRunnerService} from '../../../src/infrastructure/process/exec-command-runner-service';
import {TmuxSessionService} from '../../../src/infrastructure/tmux/tmux-session-service';

describe('TmuxSessionService (real tmux)', () => {
  const socket = `fly-test-${randomBytes(4).toString('hex')}`;
  const service = new TmuxSessionService(
    socket,
    new ExecCommandRunnerService(),
  );
  const tmux = (...args: string[]) =>
    execFileSync('tmux', ['-L', socket, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let cwd: string;
  let socketPath: string;

  beforeAll(() => {
    // kill-server leaves the socket file behind; learn its path while a
    // server lives so every test can unlink it.
    tmux('new-session', '-d', '-s', 'probe');
    socketPath = tmux('display', '-p', '#{socket_path}').trim();
    tmux('kill-server');
    rmSync(socketPath, {force: true});
  });

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'fly tmux '));
  });

  afterEach(() => {
    try {
      tmux('kill-server');
    } catch {
      // no server was started, or it exited with its last session
    }
    rmSync(socketPath, {force: true});
    rmSync(cwd, {recursive: true, force: true});
  });

  it('Should return [] when no server is running on the socket', async () => {
    expect(await service.list()).toEqual([]);
  });

  it('Should start, list, configure and kill a session', async () => {
    await service.start({
      name: 'it-abc123',
      cwd,
      command: 'cat',
      options: {'@fly_task': "x'y z"},
    });

    await vi.waitFor(async () => {
      const sessions = await service.list();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        name: 'it-abc123',
        cwd: realpathSync(cwd),
        attachedClients: 0,
        options: {'@fly_task': "x'y z"},
      });
    });
    expect(
      tmux(
        'display',
        '-p',
        '-t',
        '=it-abc123:',
        '#{history_limit} #{session_windows}',
      ),
    ).toBe('10000 1\n');

    await service.setOption('it-abc123', '@fly_worktree', '/a b');
    expect((await service.list())[0]?.options['@fly_worktree']).toBe('/a b');

    await service.kill('it-abc123');
    expect(await service.list()).toEqual([]);
  });

  it('Should hand a hostile prompt to the shell byte-exact through the pane environment', async () => {
    const out = join(cwd, 'prompt.txt');
    const fragment =
      'it\'s "q" $(touch pwned) `touch pwned` ; a & b | c \\ ação 🚀 ';
    const prompt = fragment
      .repeat(Math.ceil(3072 / Buffer.byteLength(fragment)))
      .trim();

    await service.start({
      name: 'it-def456',
      cwd,
      command: `printf %s "$FLY_PROMPT" > '${out}'; exit`,
      env: {FLY_PROMPT: prompt},
      options: {},
    });

    await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toBe(prompt), {
      timeout: 10_000,
      interval: 100,
    });
    expect(Buffer.byteLength(prompt)).toBeGreaterThan(3000);
    expect(existsSync(join(cwd, 'pwned'))).toBe(false);
  }, 15_000);

  it.each([
    ['plain text', 'fly: x'],
    ['a leading dash', '-x y'],
    ['a trailing semicolon', 'done;'],
    ['an escaped-looking tail', 'a\\;'],
  ])(
    'Should type a line into the pane and submit it verbatim (%s)',
    async (_label, text) => {
      const out = join(cwd, 'typed.txt');
      // The pane runs a recorder instead of claude.
      tmux(
        'new-session',
        '-d',
        '-s',
        'it-type1',
        '-c',
        cwd,
        `read -r line; printf %s "$line" > '${out}'; sleep 30`,
      );

      await service.sendText('it-type1', text);

      await vi.waitFor(() => expect(readFileSync(out, 'utf8')).toBe(text), {
        timeout: 10_000,
        interval: 100,
      });
    },
    15_000,
  );
});
