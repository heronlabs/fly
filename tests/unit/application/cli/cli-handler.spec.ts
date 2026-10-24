import {
  CliContext,
  CliHandler,
  USAGE,
} from '../../../../src/application/cli/cli-handler';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {ProcessLauncher} from '../../../../src/core/interfaces/process-launcher';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../../../src/core/interfaces/session-launcher';
import {LaunchService} from '../../../../src/core/services/launch-service';
import {
  SessionService,
  TMUX_MISSING,
} from '../../../../src/core/services/session-service';

const context: CliContext = {
  cwd: '/home/me/w',
  appDir: '/opt/fly',
  execPath: '/opt/fly/node_modules/electron/dist/Electron',
  env: {PATH: '/bin', ELECTRON_RUN_AS_NODE: '1', HOME: '/home/me'},
  interactive: false,
};
const out = vi.fn();
const err = vi.fn();
const list = vi.fn();
const attachCommand = vi.fn();
const launch = vi.fn();
const kill = vi.fn();
const plan = vi.fn();
const folder = vi.fn();
const exists = vi.fn();
const foreground = vi.fn();
const detached = vi.fn();

const cli = (over: Partial<CliContext> = {}) =>
  new CliHandler(
    {...context, ...over},
    {out, err},
    {list, attachCommand} as unknown as SessionLauncher,
    {launch, kill} as unknown as SessionService,
    {plan, folder} as unknown as LaunchService,
    {exists} as unknown as FileStore,
    {foreground, detached} as unknown as ProcessLauncher,
  );

const session = (over: Partial<MultiplexerSession>): MultiplexerSession => ({
  name: 'fly-abc123',
  cwd: '/w/fly',
  createdAt: 1_761_314_580,
  attachedClients: 0,
  options: {},
  ...over,
});

beforeEach(() => {
  list.mockResolvedValue([session({})]);
  attachCommand.mockReturnValue({
    file: 'tmux',
    args: ['-u', 'attach-session', '-t', '=fly-abc123'],
  });
  launch.mockResolvedValue('fly-src-abc123');
  kill.mockResolvedValue(undefined);
  plan.mockResolvedValue({
    root: '/w',
    base: '/w',
    folder: '/w/fly/src',
    worktree: '/w/fly',
    worktreeId: 'fly',
  });
  folder.mockImplementation(async (path: string) => `/real${path}`);
  exists.mockResolvedValue(true);
  foreground.mockResolvedValue(0);
  detached.mockResolvedValue(undefined);
});

describe('CliHandler', () => {
  it.each(['help', '--help', '-h'])(
    'Should print the usage for %s',
    async arg => {
      expect(await cli().run([arg])).toBe(0);
      expect(out).toHaveBeenCalledWith(USAGE);
      expect(USAGE).toContain('fly resume <nome>');
    },
  );

  describe('start', () => {
    it('Should start a session named after the folder under the root', async () => {
      expect(await cli().run(['start', '../fly/src'])).toBe(0);
      expect(plan).toHaveBeenCalledWith('/home/me/fly/src');
      expect(launch).toHaveBeenCalledWith('fly/src', '/w/fly/src');
      expect(out).toHaveBeenCalledWith('fly-src-abc123');
      expect(foreground).not.toHaveBeenCalled();
    });

    it('Should default to the current folder', async () => {
      await cli().run(['start']);
      expect(plan).toHaveBeenCalledWith('/home/me/w');
    });

    it('Should attach on a terminal and exit with tmux', async () => {
      foreground.mockResolvedValue(4);
      expect(await cli({interactive: true}).run(['start'])).toBe(4);
      expect(attachCommand).toHaveBeenCalledWith('fly-src-abc123');
      expect(foreground).toHaveBeenCalledWith('tmux', [
        '-u',
        'attach-session',
        '-t',
        '=fly-abc123',
      ]);
    });

    it('Should report a missing folder', async () => {
      plan.mockRejectedValue(new Error('Pasta não encontrada: /home/me/x'));
      expect(await cli().run(['start', 'x'])).toBe(1);
      expect(err).toHaveBeenCalledWith('Pasta não encontrada: /home/me/x');
      expect(launch).not.toHaveBeenCalled();
    });
  });

  describe('ls', () => {
    it('Should say when there is no session', async () => {
      list.mockResolvedValue([]);
      expect(await cli().run(['ls'])).toBe(0);
      expect(out).toHaveBeenCalledWith('Nenhuma sessão.');
    });

    // Tokyo is neither UTC (CI) nor a likely local zone, so the zone counts.
    it('Should print a table of every session in the given zone', async () => {
      list.mockResolvedValue([
        session({
          name: 'fly-feat-abc123',
          attachedClients: 1,
          options: {
            '@fly_worktree': '/w/fly/.worktrees/feat',
            '@fly_task': 'x',
          },
        }),
        session({name: 'notes-1', cwd: '/notes', createdAt: 0}),
      ]);

      expect(await cli({timeZone: 'Asia/Tokyo'}).run(['ls'])).toBe(0);
      expect(out).toHaveBeenCalledWith(
        [
          'NOME             PASTA                   CRIADA             ANEXADA  TAREFA',
          'fly-feat-abc123  /w/fly/.worktrees/feat  24/10/2025, 23:03  sim      x',
          'notes-1          /notes                  01/01/1970, 09:00  não      -',
        ].join('\n'),
      );
    });

    it('Should report a missing tmux with the install hint', async () => {
      list.mockRejectedValue(
        Object.assign(new Error('spawn tmux ENOENT'), {code: 'ENOENT'}),
      );
      expect(await cli().run(['ls'])).toBe(1);
      expect(err).toHaveBeenCalledWith(TMUX_MISSING);
    });

    it('Should report any other failure as is', async () => {
      list.mockRejectedValue('tmux exploded');
      expect(await cli().run(['ls'])).toBe(1);
      expect(err).toHaveBeenCalledWith('tmux exploded');
    });
  });

  describe('resume', () => {
    it('Should attach to a session by exact name', async () => {
      foreground.mockResolvedValue(7);
      expect(await cli().run(['resume', 'fly-abc123'])).toBe(7);
      expect(attachCommand).toHaveBeenCalledWith('fly-abc123');
    });

    it('Should refuse an unknown name', async () => {
      expect(await cli().run(['resume', 'fly-abc'])).toBe(1);
      expect(err).toHaveBeenCalledWith('Sessão fly-abc não encontrada');
      expect(foreground).not.toHaveBeenCalled();
    });

    it('Should print the usage without a name', async () => {
      expect(await cli().run(['resume'])).toBe(2);
      expect(err).toHaveBeenCalledWith('Uso: fly resume <nome>');
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('Should kill a session by exact name', async () => {
      expect(await cli().run(['stop', 'fly-abc123'])).toBe(0);
      expect(kill).toHaveBeenCalledWith('fly-abc123');
      expect(out).toHaveBeenCalledWith('Sessão fly-abc123 encerrada.');
    });

    it('Should refuse an unknown name', async () => {
      expect(await cli().run(['stop', 'fly-abc'])).toBe(1);
      expect(err).toHaveBeenCalledWith('Sessão fly-abc não encontrada');
      expect(kill).not.toHaveBeenCalled();
    });

    it('Should print the usage without a name', async () => {
      expect(await cli().run(['stop', ''])).toBe(2);
      expect(err).toHaveBeenCalledWith('Uso: fly stop <nome>');
      expect(list).not.toHaveBeenCalled();
    });
  });

  describe('open', () => {
    it('Should open the app on the current folder, outside Node mode', async () => {
      expect(await cli().run([])).toBe(0);
      expect(folder).toHaveBeenCalledWith('/home/me/w');
      expect(exists).toHaveBeenCalledWith('/opt/fly/out/main/index.js');
      expect(detached).toHaveBeenCalledWith(
        '/opt/fly/node_modules/electron/dist/Electron',
        ['/opt/fly', '/real/home/me/w'],
        {PATH: '/bin', HOME: '/home/me'},
      );
    });

    it('Should take a first argument that is no subcommand as the folder', async () => {
      expect(await cli().run(['./start'])).toBe(0);
      expect(folder).toHaveBeenCalledWith('/home/me/w/start');
    });

    it('Should ask for a build when the app is missing', async () => {
      exists.mockResolvedValue(false);
      expect(await cli().run(['.'])).toBe(1);
      expect(err).toHaveBeenCalledWith(
        'Build do fly não encontrado em /opt/fly: rode pnpm build',
      );
      expect(detached).not.toHaveBeenCalled();
    });

    it('Should report a missing folder', async () => {
      folder.mockRejectedValue(new Error('Pasta não encontrada: /home/me/x'));
      expect(await cli().run(['/home/me/x'])).toBe(1);
      expect(err).toHaveBeenCalledWith('Pasta não encontrada: /home/me/x');
      expect(exists).not.toHaveBeenCalled();
    });
  });
});
