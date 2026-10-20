import {Injectable} from '@nestjs/common';

import {Session, SessionsSnapshot} from '../domain/session';
import {Workspace, Worktree} from '../domain/workspace';
import {IdGenerator} from '../interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../interfaces/session-launcher';
import {claudeCommand, sessionName, sessionPrefix} from './session-naming';
import {compareText} from './text-order';

export const TMUX_MISSING =
  'tmux não encontrado — instale com: brew install tmux';

export const isMissing = (error: unknown): boolean =>
  (error as {code?: unknown} | null)?.code === 'ENOENT';

// Turns a raw `spawn tmux ENOENT` into the install hint; anything else as is.
export const rethrowMissing = (error: unknown): never => {
  throw isMissing(error) ? new Error(TMUX_MISSING) : error;
};

export const errorMessage = (error: unknown): string =>
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

export type MappedSessions = {
  tmux: SessionsSnapshot['tmux'];
  message: string | null;
  items: {session: MultiplexerSession; worktreeId: string}[];
};

const bySessionOrder = (a: Session, b: Session): number =>
  a.createdAt - b.createdAt || compareText(a.name, b.name);

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

  // Every tmux session that belongs to a worktree of the open workspace.
  async mapped(): Promise<MappedSessions> {
    let listed: MultiplexerSession[];
    try {
      listed = await this.launcher.list();
    } catch (error) {
      return isMissing(error)
        ? {tmux: 'missing', message: TMUX_MISSING, items: []}
        : {tmux: 'error', message: errorMessage(error), items: []};
    }
    const worktrees = this.workspace?.worktrees ?? [];
    const items = listed.flatMap(session => {
      const worktree = findWorktree(worktrees, session);
      return worktree ? [{session, worktreeId: worktree.id}] : [];
    });
    return {tmux: 'ok', message: null, items};
  }

  async snapshot(): Promise<SessionsSnapshot> {
    const {tmux, message, items} = await this.mapped();
    const sessions = items.map(({session, worktreeId}): Session => ({
      name: session.name,
      worktreeId,
      createdAt: session.createdAt,
      attachedClients: session.attachedClients,
      origin: session.options['@fly_session_id'] ? 'fly' : 'external',
      task: session.options['@fly_task'] ?? null,
    }));
    return {tmux, message, sessions: sessions.sort(bySessionOrder)};
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
