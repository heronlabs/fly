import {Injectable} from '@nestjs/common';

import {Session, SessionsSnapshot} from '../domain/session';
import {Workspace, Worktree} from '../domain/workspace';
import {IdGenerator} from '../interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../interfaces/session-launcher';
import {claudeCommand, sessionName, sessionPrefix} from './session-naming';

export const TMUX_MISSING =
  'tmux não encontrado — instale com: brew install tmux';

const isMissing = (error: unknown): boolean =>
  (error as {code?: unknown} | null)?.code === 'ENOENT';

// Turns a raw `spawn tmux ENOENT` into the install hint; anything else as is.
export const rethrowMissing = (error: unknown): never => {
  throw isMissing(error) ? new Error(TMUX_MISSING) : error;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const findWorktree = (
  worktrees: Worktree[],
  session: MultiplexerSession,
): Worktree | undefined => {
  const explicit = worktrees.find(
    worktree => worktree.path === session.options['@fly_worktree'],
  );
  if (explicit) return explicit;
  return worktrees
    .filter(
      worktree =>
        session.cwd === worktree.path ||
        session.cwd.startsWith(`${worktree.path}/`),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];
};

const bySessionOrder = (a: Session, b: Session): number =>
  a.createdAt - b.createdAt ||
  Number(a.name > b.name) - Number(a.name < b.name);

@Injectable()
export class SessionService {
  private workspace: Workspace | null = null;

  constructor(
    private readonly launcher: SessionLauncher,
    private readonly ids: IdGenerator,
  ) {}

  setWorkspace(workspace: Workspace | null): void {
    this.workspace = workspace;
  }

  currentWorkspace(): Workspace | null {
    return this.workspace;
  }

  async snapshot(): Promise<SessionsSnapshot> {
    let listed: MultiplexerSession[];
    try {
      listed = await this.launcher.list();
    } catch (error) {
      return isMissing(error)
        ? {tmux: 'missing', message: TMUX_MISSING, sessions: []}
        : {tmux: 'error', message: errorMessage(error), sessions: []};
    }
    const worktrees = this.workspace?.worktrees ?? [];
    const sessions: Session[] = [];
    for (const item of listed) {
      const worktree = findWorktree(worktrees, item);
      if (!worktree) continue;
      sessions.push({
        name: item.name,
        worktreeId: worktree.id,
        createdAt: item.createdAt,
        attachedClients: item.attachedClients,
        origin: item.options['@fly_session_id'] ? 'fly' : 'external',
        task: item.options['@fly_task'] ?? null,
      });
    }
    return {tmux: 'ok', message: null, sessions: sessions.sort(bySessionOrder)};
  }

  async start(worktreeId: string): Promise<string> {
    if (!this.workspace) throw new Error('Nenhuma pasta aberta');
    const worktree = this.workspace.worktrees.find(w => w.id === worktreeId);
    if (!worktree) throw new Error('Worktree não encontrado');
    const uuid = this.ids.uuid();
    const name = sessionName(sessionPrefix(worktree.id), this.ids.hex(3));
    try {
      await this.launcher.start({
        name,
        cwd: worktree.path,
        command: claudeCommand({sessionId: uuid}),
        options: {'@fly_session_id': uuid, '@fly_worktree': worktree.path},
      });
    } catch (error) {
      rethrowMissing(error);
    }
    return name;
  }

  kill(name: string): Promise<void> {
    return this.launcher.kill(name);
  }
}
