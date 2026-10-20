import {Injectable} from '@nestjs/common';

import {IdGenerator} from '../interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../interfaces/session-launcher';
import {
  claudeCommand,
  normalizePrompt,
  PROMPT_ENV,
  sessionName,
  sessionPrefix,
} from './session-naming';
import {SessionService} from './session-service';

// A baseline we cannot read means we cannot tell which worktrees are new.
const parseBaseline = (raw: string | undefined): string[] | null => {
  try {
    const parsed: unknown = JSON.parse(raw ?? '');
    return Array.isArray(parsed) && parsed.every(p => typeof p === 'string')
      ? (parsed as string[])
      : null;
  } catch {
    return null;
  }
};

// tmux rejects commands over ~16 KB; 2000 code points stay well below it.
const MAX_DESCRIPTION = 2000;
// @fly_task is display-only and travels in every list-sessions line.
const TASK_LABEL_LENGTH = 200;

const byAge = (a: MultiplexerSession, b: MultiplexerSession): number =>
  a.createdAt - b.createdAt ||
  Number(a.name > b.name) - Number(a.name < b.name);

@Injectable()
export class TaskService {
  constructor(
    private readonly sessions: SessionService,
    private readonly launcher: SessionLauncher,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: {repoId: string; description: string}): Promise<string> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) throw new Error('Nenhuma pasta aberta');
    const repo = workspace.repos.find(r => r.id === input.repoId);
    if (!repo) throw new Error('Repositório não encontrado');
    const description = input.description.trim();
    if (!description) throw new Error('Descreva a tarefa');
    // Code points, so an emoji counts once and is never split in half.
    const characters = Array.from(description);
    if (characters.length > MAX_DESCRIPTION) {
      throw new Error('Descrição muito longa (máx. 2000 caracteres)');
    }
    const uuid = this.ids.uuid();
    const name = sessionName(sessionPrefix(repo.id), this.ids.hex(3));
    const baseline = workspace.worktrees
      .filter(w => w.repoId === repo.id)
      .map(w => w.path);
    await this.launcher.start({
      name,
      cwd: repo.path,
      command: claudeCommand({sessionId: uuid, withPrompt: true}),
      env: {[PROMPT_ENV]: normalizePrompt(`/supera:ship ${description}`)},
      options: {
        '@fly_session_id': uuid,
        '@fly_task': characters.slice(0, TASK_LABEL_LENGTH).join(''),
        '@fly_task_repo': repo.path,
        '@fly_task_baseline': JSON.stringify(baseline),
      },
    });
    return name;
  }

  async bind(): Promise<void> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) return;
    let listed: MultiplexerSession[];
    try {
      listed = await this.launcher.list();
    } catch {
      return;
    }
    const taken = new Set(
      listed.flatMap(s => s.options['@fly_worktree'] ?? []),
    );
    const pending = listed
      .filter(s => s.options['@fly_task_repo'] && !s.options['@fly_worktree'])
      .sort(byAge);
    for (const session of pending) {
      const repo = workspace.repos.find(
        r => r.path === session.options['@fly_task_repo'],
      );
      const baseline = parseBaseline(session.options['@fly_task_baseline']);
      if (!repo || !baseline) continue;
      const candidate = workspace.worktrees
        .filter(
          w =>
            w.repoId === repo.id &&
            !w.isMain &&
            !baseline.includes(w.path) &&
            !taken.has(w.path),
        )
        .map(w => w.path)
        .sort()[0];
      if (!candidate) continue;
      taken.add(candidate);
      await this.launcher.setOption(session.name, '@fly_worktree', candidate);
    }
  }
}
