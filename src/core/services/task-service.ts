import {posix} from 'node:path';

import {Injectable} from '@nestjs/common';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_PROMPT_CHARS,
  MODELS,
  NewTaskInput,
} from '../domain/task';
import {TranscriptSummary} from '../domain/transcript';
import {Repo, Workspace} from '../domain/workspace';
import {FileStore} from '../interfaces/file-store';
import {IdGenerator} from '../interfaces/id-generator';
import {PrGateway} from '../interfaces/pr-gateway';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../interfaces/session-launcher';
import {TaskFiles} from '../interfaces/task-files';
import {TaskStore} from '../interfaces/task-store';
import {TranscriptSource} from '../interfaces/transcript-source';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {
  claudeCommand,
  cleanPrompt,
  normalizePrompt,
  PROMPT_ENV,
  sessionName,
  sessionPrefix,
} from './session-naming';
import {rethrowMissing, SessionService} from './session-service';
import {compareText} from './text-order';

// A baseline we cannot read means we cannot tell which worktrees are new.
const parseBaseline = (raw: string | undefined): string[] | null => {
  let parsed: unknown = null;
  try {
    // An absent baseline reads as the text "undefined", which does not parse.
    parsed = JSON.parse(String(raw));
  } catch {
    // Unreadable stays null.
  }
  return Array.isArray(parsed) && parsed.every(p => typeof p === 'string')
    ? (parsed as string[])
    : null;
};

// tmux rejects commands over ~16 KB; 2000 code points stay well below it.
const MAX_DESCRIPTION = 2000;
// @fly_task is display-only and travels in every list-sessions line.
const TASK_LABEL_LENGTH = 200;

// Until the ship flow is removed, a description with this prefix keeps it.
const SHIP_PREFIX = '/supera:ship ';
const WORKTREES_DIR = '.worktrees';

const byAge = (a: MultiplexerSession, b: MultiplexerSession): number =>
  a.createdAt - b.createdAt || compareText(a.name, b.name);

@Injectable()
export class TaskService {
  constructor(
    private readonly sessions: SessionService,
    private readonly launcher: SessionLauncher,
    private readonly ids: IdGenerator,
    private readonly transcripts: TranscriptSource,
    private readonly vcs: VcsGateway,
    private readonly prs: PrGateway,
    private readonly files: FileStore,
    private readonly tasks: TaskStore,
    private readonly taskFiles: TaskFiles,
  ) {}

  async create(input: NewTaskInput): Promise<string> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) throw new Error('Nenhuma pasta aberta');
    const repo = workspace.repos.find(r => r.id === input.repoId);
    if (!repo) throw new Error('Repositório não encontrado');
    const description = input.description.trim();
    if (!description) throw new Error('Descreva a tarefa');
    return description.startsWith(SHIP_PREFIX)
      ? this.ship(workspace, repo, description.slice(SHIP_PREFIX.length).trim())
      : this.start(workspace, repo, input, description);
  }

  private async start(
    workspace: Workspace,
    repo: Repo,
    input: NewTaskInput,
    description: string,
  ): Promise<string> {
    const {branch, model} = input;
    if (Array.from(description).length > MAX_PROMPT_CHARS) {
      throw new Error(
        `Prompt muito longo (máx. ${MAX_PROMPT_CHARS} caracteres)`,
      );
    }
    if (model !== null && !(MODELS as readonly string[]).includes(model)) {
      throw new Error('Modelo inválido');
    }
    if (!(await this.vcs.validBranchName(repo.path, branch))) {
      throw new Error('Nome de branch inválido');
    }
    if (await this.vcs.branchExists(repo.path, branch)) {
      throw new Error(`O branch ${branch} já existe`);
    }
    const path = posix.join(repo.path, WORKTREES_DIR, branch);
    if (await this.files.exists(path)) {
      throw new Error(`Já existe uma pasta em ${path}`);
    }
    for (const source of input.attachments) {
      if ((await this.files.stat(source)).size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Arquivo maior que 20 MB: ${posix.basename(source)}`);
      }
    }
    const base =
      (await this.vcs.defaultBranch(repo.path)) ??
      (await this.prs.defaultBranch(repo.path));
    await this.vcs.fetch(repo.path, base);
    await this.vcs.addWorktree({
      repoPath: repo.path,
      path,
      branch,
      base: `origin/${base}`,
    });
    await this.vcs.ensureIgnored(repo.path, WORKTREES_DIR);
    // From here the worktree exists; a failure leaves it and its branch alone.
    const id = this.ids.uuid();
    const copies: string[] = [];
    for (const source of input.attachments) {
      copies.push(await this.taskFiles.copyIn(id, source));
    }
    const attached = copies.length
      ? `\n\nArquivos anexados:\n${copies.map(c => `- ${c}`).join('\n')}`
      : '';
    const promptFile = await this.taskFiles.write(
      id,
      'prompt.md',
      cleanPrompt(description) + attached,
    );
    const name = await this.sessions.launch(
      posix.relative(workspace.root, path),
      path,
      {
        promptFile,
        model,
        task: Array.from(description).slice(0, TASK_LABEL_LENGTH).join(''),
      },
    );
    await this.tasks.save({
      id,
      repoPath: repo.path,
      worktreePath: path,
      branch,
      base,
      model,
      promptFile,
      prNumber: null,
      phase: 'working',
      ciAttempts: 0,
      fixedSha: null,
      reviewSeenAt: null,
      review: null,
      outbox: null,
      pending: null,
      stop: null,
      createdAt: Date.now(),
    });
    return name;
  }

  // Transitional: the supera:ship path, until a later task deletes it.
  private async ship(
    workspace: Workspace,
    repo: Repo,
    description: string,
  ): Promise<string> {
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
    try {
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
    } catch (error) {
      rethrowMissing(error);
    }
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
    // Sessions without a worktree contribute undefined, which never matches a path.
    const taken = new Set(listed.map(s => s.options['@fly_worktree']));
    const pending = listed
      .filter(s => s.options['@fly_task_repo'] && !s.options['@fly_worktree'])
      .sort(byAge);
    for (const session of pending) {
      const repo = workspace.repos.find(
        r => r.path === session.options['@fly_task_repo'],
      );
      if (!repo) continue;
      const open = workspace.worktrees
        .filter(w => w.repoId === repo.id && !w.isMain && !taken.has(w.path))
        .map(w => w.path);
      const entered = await this.enteredWorktree(repo.path, session);
      // A named worktree is waited for, never overruled by the fallback (P8).
      const target = entered
        ? open.find(path => path === entered)
        : this.fallback(session, repo.path, open, pending);
      if (!target) continue;
      taken.add(target);
      await this.launcher.setOption(session.name, '@fly_worktree', target);
    }
  }

  // A missing session id or a failed read is no evidence.
  private async enteredWorktree(
    launchCwd: string,
    session: MultiplexerSession,
  ): Promise<string | null> {
    const sessionId = session.options['@fly_session_id'];
    if (!sessionId) return null;
    let summary: TranscriptSummary | null = null;
    try {
      summary = await this.transcripts.forSession({launchCwd, sessionId});
    } catch {
      // No evidence; the fallback may still apply.
    }
    return summary?.worktreePath ?? null;
  }

  // Only a repo's lone pending task takes the repo's lone new worktree. Counted
  // over the start-of-pass list, so no task falls back in a pass another bound.
  private fallback(
    session: MultiplexerSession,
    repoPath: string,
    open: string[],
    pending: MultiplexerSession[],
  ): string | undefined {
    const baseline = parseBaseline(session.options['@fly_task_baseline']);
    const inRepo = pending.filter(
      s => s.options['@fly_task_repo'] === repoPath,
    );
    if (inRepo.length !== 1 || !baseline) return undefined;
    const fresh = open.filter(path => !baseline.includes(path));
    return fresh.length === 1 ? fresh[0] : undefined;
  }
}
