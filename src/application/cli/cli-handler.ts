import {join, posix, resolve} from 'node:path';

import {FileStore} from '../../core/interfaces/file-store';
import {ProcessLauncher} from '../../core/interfaces/process-launcher';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../core/interfaces/session-launcher';
import {LaunchService} from '../../core/services/launch-service';
import {
  errorMessage,
  isMissing,
  SessionService,
  TMUX_MISSING,
} from '../../core/services/session-service';

export type CliContext = {
  cwd: string;
  // The checkout Electron opens as the app.
  appDir: string;
  // The Electron binary, which runs the CLI itself in Node mode.
  execPath: string;
  env: Record<string, string | undefined>;
  interactive: boolean;
  // IANA zone of the times `fly ls` prints; the system's when absent.
  timeZone?: string;
};

export type CliOutput = {out(line: string): void; err(line: string): void};

export const USAGE = [
  'Uso:',
  '  fly [pasta]          abre o fly nessa pasta (padrão: a atual)',
  '  fly start [pasta]    nova sessão do Claude no tmux nessa pasta',
  '  fly ls               lista as sessões',
  '  fly resume <nome>    volta a uma sessão',
  '  fly stop <nome>      encerra uma sessão',
  '  fly help             mostra esta ajuda',
].join('\n');

const HEADER = ['NOME', 'PASTA', 'CRIADA', 'ANEXADA', 'TAREFA'];

const created = (seconds: number, timeZone: string | undefined): string =>
  new Date(seconds * 1000).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  });

const row = (
  session: MultiplexerSession,
  timeZone: string | undefined,
): string[] => [
  session.name,
  session.options['@fly_worktree'] ?? session.cwd,
  created(session.createdAt, timeZone),
  session.attachedClients > 0 ? 'sim' : 'não',
  session.options['@fly_task'] ?? '-',
];

const table = (rows: string[][]): string[] => {
  const widths = HEADER.map((_, column) =>
    Math.max(...rows.map(cells => cells[column]!.length)),
  );
  return rows.map(cells =>
    cells
      .map((cell, column) => cell.padEnd(widths[column]!))
      .join('  ')
      .trimEnd(),
  );
};

export class CliHandler {
  constructor(
    private readonly context: CliContext,
    private readonly output: CliOutput,
    private readonly launcher: SessionLauncher,
    private readonly sessions: SessionService,
    private readonly launches: LaunchService,
    private readonly files: FileStore,
    private readonly processes: ProcessLauncher,
  ) {}

  // Resolves with the exit code: 0 ok, 1 failure, 2 usage.
  async run(args: string[]): Promise<number> {
    const [command, target] = args;
    try {
      switch (command) {
        case 'start':
          return await this.start(target);
        case 'ls':
          return await this.list();
        case 'resume':
          return await this.resume(target);
        case 'stop':
          return await this.stop(target);
        case 'help':
        case '--help':
        case '-h':
          this.output.out(USAGE);
          return 0;
        default:
          // Anything else is a folder: `fly ./start` opens a folder `start`.
          return await this.open(command);
      }
    } catch (error) {
      this.output.err(isMissing(error) ? TMUX_MISSING : errorMessage(error));
      return 1;
    }
  }

  private async start(target: string | undefined): Promise<number> {
    const plan = await this.launches.plan(this.path(target));
    const name = await this.sessions.launch(
      posix.relative(plan.base, plan.folder),
      plan.folder,
    );
    this.output.out(name);
    return this.context.interactive ? this.attach(name) : 0;
  }

  private async list(): Promise<number> {
    const listed = await this.launcher.list();
    if (listed.length === 0) {
      this.output.out('Nenhuma sessão.');
    } else {
      const rows = listed.map(session => row(session, this.context.timeZone));
      this.output.out(table([HEADER, ...rows]).join('\n'));
    }
    return 0;
  }

  private async resume(name: string | undefined): Promise<number> {
    if (!name) return this.usage('fly resume <nome>');
    if (!(await this.exists(name))) return this.notFound(name);
    return this.attach(name);
  }

  private async stop(name: string | undefined): Promise<number> {
    if (!name) return this.usage('fly stop <nome>');
    if (!(await this.exists(name))) return this.notFound(name);
    await this.sessions.kill(name);
    this.output.out(`Sessão ${name} encerrada.`);
    return 0;
  }

  private async open(target: string | undefined): Promise<number> {
    const folder = await this.launches.folder(this.path(target));
    const {appDir, execPath, env} = this.context;
    if (!(await this.files.exists(join(appDir, 'out/main/index.js')))) {
      this.output.err(
        `Build do fly não encontrado em ${appDir}: rode pnpm build`,
      );
      return 1;
    }
    // Without this the app would start as Node again, like the CLI.
    const appEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE'),
    );
    await this.processes.detached(execPath, [appDir, folder], appEnv);
    return 0;
  }

  private path(target: string | undefined): string {
    return resolve(this.context.cwd, target ?? '');
  }

  private async exists(name: string): Promise<boolean> {
    return (await this.launcher.list()).some(session => session.name === name);
  }

  private attach(name: string): Promise<number> {
    const {file, args} = this.launcher.attachCommand(name);
    return this.processes.foreground(file, args);
  }

  private usage(synopsis: string): number {
    this.output.err(`Uso: ${synopsis}`);
    return 2;
  }

  private notFound(name: string): number {
    this.output.err(`Sessão ${name} não encontrada`);
    return 1;
  }
}
