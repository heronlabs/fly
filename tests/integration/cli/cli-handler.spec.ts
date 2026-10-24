import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {CliHandler} from '../../../src/application/cli/cli-handler';
import {LaunchService} from '../../../src/core/services/launch-service';
import {SessionService} from '../../../src/core/services/session-service';
import {WorkspaceService} from '../../../src/core/services/workspace-service';
import {CryptoIdGeneratorService} from '../../../src/infrastructure/environment/crypto-id-generator-service';
import {JsonConfigStoreService} from '../../../src/infrastructure/environment/json-config-store-service';
import {NodeFileStoreService} from '../../../src/infrastructure/filesystem/node-file-store-service';
import {GitCliService} from '../../../src/infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from '../../../src/infrastructure/process/exec-command-runner-service';
import {NodeProcessLauncherService} from '../../../src/infrastructure/process/node-process-launcher-service';
import {TmuxSessionService} from '../../../src/infrastructure/tmux/tmux-session-service';

// The panes run a fake shell that records each typed line and runs none, so
// no real claude ever starts; the server is private and has no tmux.conf.
describe('CliHandler (real tmux, git and files)', () => {
  const socket = `fly-test-${randomBytes(4).toString('hex')}`;
  const runner = new ExecCommandRunnerService();
  const files = new NodeFileStoreService();
  const git = new GitCliService(runner);
  const tmuxService = new TmuxSessionService(socket, runner);
  const sessions = new SessionService(
    tmuxService,
    new CryptoIdGeneratorService(),
  );
  const tmux = (...args: string[]) =>
    execFileSync('tmux', ['-L', socket, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let socketPath: string;
  let dir: string;
  let root: string;
  let repo: string;
  let userData: string;
  let typed: string;
  let lines: string[];
  let errors: string[];

  const cli = (cwd: string) =>
    new CliHandler(
      {
        cwd,
        appDir: dir,
        execPath: process.execPath,
        env: {},
        interactive: false,
      },
      {out: line => lines.push(line), err: line => errors.push(line)},
      tmuxService,
      sessions,
      new LaunchService(
        files,
        git,
        new JsonConfigStoreService(userData, files),
      ),
      files,
      new NodeProcessLauncherService(),
    );

  beforeAll(() => {
    // kill-server leaves the socket file behind; learn its path while a
    // server lives so every test can unlink it.
    tmux('-f', '/dev/null', 'new-session', '-d', '-s', 'probe');
    socketPath = tmux('display', '-p', '#{socket_path}').trim();
    tmux('kill-server');
    rmSync(socketPath, {force: true});
  });

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-cli-')));
    root = join(dir, 'w');
    repo = join(root, 'fly');
    userData = join(dir, 'user-data');
    typed = join(dir, 'typed.txt');
    lines = [];
    errors = [];
    mkdirSync(repo, {recursive: true});
    const gitIn = (...args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=fly-test',
          '-c',
          'user.email=fly-test@example.com',
          '-c',
          'commit.gpgsign=false',
          ...args,
        ],
        {cwd: repo, stdio: 'pipe'},
      );
    gitIn('init', '-b', 'main');
    gitIn('commit', '--allow-empty', '-m', 'init');
    gitIn('worktree', 'add', '.worktrees/feat-a', '-b', 'feat-a');
    mkdirSync(join(repo, '.worktrees/feat-a/src'));
    const shell = join(dir, 'fake-sh');
    writeFileSync(
      shell,
      `#!/bin/sh\nwhile IFS= read -r line; do printf '%s\\n' "$line" >> '${typed}'; done\n`,
    );
    chmodSync(shell, 0o755);
    tmux(
      '-f',
      '/dev/null',
      'start-server',
      ';',
      'set-option',
      '-g',
      'exit-empty',
      'off',
      ';',
      'set-option',
      '-g',
      'default-shell',
      shell,
    );
  });

  afterEach(() => {
    try {
      tmux('kill-server');
    } catch {
      // the server is already gone
    }
    rmSync(socketPath, {force: true});
    rmSync(dir, {recursive: true, force: true});
  });

  const appSnapshot = async () => {
    const workspace = await new WorkspaceService(files, git).discover(root);
    const app = new SessionService(tmuxService, new CryptoIdGeneratorService());
    app.setWorkspace(workspace);
    return (await app.snapshot()).sessions;
  };

  it('Should start, list and stop a session the app maps to its worktree', async () => {
    mkdirSync(userData);
    writeFileSync(
      join(userData, 'config.json'),
      JSON.stringify({recentRoots: [root]}),
    );
    const folder = join(repo, '.worktrees/feat-a/src');

    expect(await cli(repo).run(['start', '.worktrees/feat-a/src'])).toBe(0);
    const [name = ''] = lines;
    expect(name).toMatch(/^fly-feat-a-src-[0-9a-f]{6}$/);

    const [started] = await tmuxService.list();
    expect(started).toMatchObject({
      name,
      cwd: folder,
      options: {'@fly_worktree': folder},
    });
    const uuid = started?.options['@fly_session_id'];
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(
      () =>
        expect(readFileSync(typed, 'utf8')).toBe(
          `claude --dangerously-skip-permissions --session-id ${uuid}; exit\n`,
        ),
      {timeout: 10_000, interval: 100},
    );
    expect(await appSnapshot()).toEqual([
      expect.objectContaining({
        name,
        worktreeId: 'fly/.worktrees/feat-a',
        origin: 'fly',
      }),
    ]);

    lines = [];
    expect(await cli(repo).run(['ls'])).toBe(0);
    expect(lines[0]?.split('\n')[1]).toMatch(
      new RegExp(`^${name} +${folder} +\\S+, \\S+ +não +-$`),
    );

    lines = [];
    expect(await cli(repo).run(['stop', name])).toBe(0);
    expect(lines).toEqual([`Sessão ${name} encerrada.`]);
    expect(await tmuxService.list()).toEqual([]);
    expect(errors).toEqual([]);
  }, 20_000);

  it('Should name a repo outside the recent roots after its parent dir', async () => {
    expect(await cli(repo).run(['start'])).toBe(0);
    const [name = ''] = lines;
    expect(name).toMatch(/^fly-[0-9a-f]{6}$/);
    expect((await tmuxService.list())[0]?.options['@fly_worktree']).toBe(repo);
    expect(await appSnapshot()).toEqual([
      expect.objectContaining({name, worktreeId: 'fly', origin: 'fly'}),
    ]);
    expect(existsSync(userData)).toBe(false);
  }, 20_000);

  it('Should plan the worktree id discovery gives the folder', async () => {
    const launches = new LaunchService(
      files,
      git,
      new JsonConfigStoreService(userData, files),
    );
    const plan = await launches.plan(join(repo, '.worktrees/feat-a/src'));
    const workspace = await new WorkspaceService(files, git).discover(
      plan.root,
    );

    expect(plan.root).toBe(root);
    expect(workspace.worktrees).toContainEqual(
      expect.objectContaining({id: plan.worktreeId, path: plan.worktree}),
    );
  });

  it('Should refuse to resume or stop an unknown session', async () => {
    expect(await cli(repo).run(['resume', 'nope'])).toBe(1);
    expect(await cli(repo).run(['stop', 'nope'])).toBe(1);
    expect(errors).toEqual([
      'Sessão nope não encontrada',
      'Sessão nope não encontrada',
    ]);
  });
});
