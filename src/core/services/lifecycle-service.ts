import {join} from 'node:path';

import {Injectable} from '@nestjs/common';

import {PR_TEMPLATE} from '../domain/pr-template';
import {TaskRecord, TaskStop} from '../domain/task';
import {TranscriptSummary} from '../domain/transcript';
import {Repo, Worktree} from '../domain/workspace';
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
import {resolveDefaultBranch} from './default-branch';
import {QueueService} from './queue-service';
import {errorMessage, MappedSessions, SessionService} from './session-service';
import {
  isConventionalTitle,
  newestFlySession,
  openInstruction,
  parsePrText,
  prRequest,
} from './task-rules';
import {TerminalService} from './terminal-service';

const NO_WORKTREE = 'Worktree não encontrado';
const BUSY = 'A sessão está ocupada; aguarde o turno terminar';

const PROMPT_FILE = 'prompt.md';
const REQUEST_FILE = 'pr-request.md';
const PR_FILE = 'pr.json';
const BODY_FILE = 'pr-body.md';

// The record fields an open request sets, whatever they were before.
type Unopened = Omit<TaskRecord, 'phase' | 'stop' | 'pending'>;

// P6: the transcript's last turn ended, with no question or agent open.
const isIdle = (summary: TranscriptSummary | null): boolean =>
  summary?.phase === 'turn-ended' &&
  !summary.asking &&
  summary.backgroundAgents === 0;

// A gateway error already carrying the stop's prefix keeps it once.
const prefixed = (prefix: string, error: unknown): string => {
  const message = errorMessage(error);
  return message.startsWith(prefix) ? message : prefix + message;
};

@Injectable()
export class LifecycleService {
  constructor(
    private readonly sessions: SessionService,
    private readonly transcripts: TranscriptSource,
    private readonly launcher: SessionLauncher,
    private readonly terminals: TerminalService,
    private readonly vcs: VcsGateway,
    private readonly prs: PrGateway,
    private readonly queue: QueueService,
    private readonly tasks: TaskStore,
    private readonly taskFiles: TaskFiles,
    private readonly ids: IdGenerator,
  ) {}

  // P8: asks the worktree's idle session to commit and write the PR's text;
  // tick finishes the job once that turn ends.
  async openPullRequest(worktreeId: string, now = Date.now()): Promise<void> {
    const {repo, worktree, branch} = this.locate(worktreeId);
    if (this.queue.pullRequestFor(worktreeId)?.state === 'open') {
      throw new Error('Já existe um PR aberto');
    }
    const target = this.target(worktree, (await this.sessions.mapped()).items);
    if (!target) throw new Error('Nenhuma sessão do fly aberta neste worktree');
    const summary = await this.summaryOf(worktree, target);
    const existing = await this.recordOf(worktree);
    // A request already typed counts as busy until tick settles it.
    if (!isIdle(summary) || existing?.pending) throw new Error(BUSY);
    if (this.terminals.hasDraft(target.name)) {
      throw new Error('Há texto digitado e não enviado na sessão');
    }
    const record: Unopened =
      existing ?? (await this.newRecord(repo, worktree.path, branch, now));
    const prompt =
      record.promptFile === null
        ? null
        : await this.taskFiles.read(record.id, PROMPT_FILE);
    const requestFile = await this.taskFiles.write(
      record.id,
      REQUEST_FILE,
      prRequest({
        template: PR_TEMPLATE,
        prompt,
        outFile: join(this.taskFiles.dir(record.id), PR_FILE),
      }),
    );
    const headSha = await this.vcs.headSha(worktree.path);
    await this.launcher.sendText(target.name, openInstruction(requestFile));
    await this.tasks.save({
      ...record,
      phase: 'opening',
      stop: null,
      pending: {kind: 'open', sentAt: now, headSha},
    });
  }

  // Settles every pending open request whose turn has ended. One record's
  // failure never holds up another's; the first one rejects at the end.
  async tick(now = Date.now()): Promise<void> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) return;
    const opening = (await this.tasks.list()).flatMap(record =>
      record.pending?.kind === 'open'
        ? [{record, sentAt: record.pending.sentAt ?? 0}]
        : [],
    );
    if (opening.length === 0) return;
    const {tmux, items} = await this.sessions.mapped();
    // Without a tmux listing, a live session would look gone.
    if (tmux !== 'ok') return;
    const results = await Promise.allSettled(
      opening.map(({record, sentAt}) =>
        this.settleOpen(record, sentAt, workspace.worktrees, items, now),
      ),
    );
    const failed = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failed) throw failed.reason;
  }

  private async settleOpen(
    record: TaskRecord,
    sentAt: number,
    worktrees: Worktree[],
    items: MappedSessions['items'],
    now: number,
  ): Promise<void> {
    // A worktree that is gone, elsewhere, or on another branch is not ours.
    const worktree = worktrees.find(
      w => w.path === record.worktreePath && w.branch === record.branch,
    );
    if (!worktree) return;
    const target = this.target(worktree, items);
    if (!target) {
      return this.stop(record, {
        kind: 'session',
        message: 'A sessão do worktree foi encerrada',
      });
    }
    const summary = await this.summaryOf(worktree, target);
    // P6: the turn that follows the instruction has ended.
    if ((summary?.lastTurnEndAt ?? 0) <= sentAt) return;
    const result = await this.createPullRequest(record, worktree.path);
    if ('stop' in result) {
      return this.stop(record, {kind: 'open', message: result.stop});
    }
    await this.tasks.save({
      ...record,
      prNumber: result.number,
      phase: 'ci',
      pending: null,
      reviewSeenAt: now,
    });
  }

  // P8 on turn done: the first failed check stops the flow.
  private async createPullRequest(
    record: TaskRecord,
    path: string,
  ): Promise<{stop: string} | {number: number}> {
    const dirty = Object.keys(await this.vcs.status(path));
    if (dirty.length > 0) {
      return {stop: `Ficaram mudanças sem commit: ${dirty.join(', ')}`};
    }
    if ((await this.vcs.aheadCount(path, `origin/${record.base}`)) === 0) {
      return {
        stop: `Nada para abrir: o branch não tem commits à frente de ${record.base}`,
      };
    }
    const text = parsePrText(await this.taskFiles.read(record.id, PR_FILE));
    if (!text) return {stop: 'A sessão não escreveu o título e o corpo do PR'};
    if (!isConventionalTitle(text.title)) {
      return {
        stop: `Título fora do padrão Conventional Commits: ${text.title}`,
      };
    }
    try {
      await this.vcs.push(path, record.branch);
    } catch (error) {
      return {stop: prefixed('git push falhou: ', error)};
    }
    const bodyFile = await this.taskFiles.write(
      record.id,
      BODY_FILE,
      text.body,
    );
    try {
      const {number} = await this.prs.create({
        cwd: path,
        title: text.title,
        bodyFile,
        base: record.base,
        head: record.branch,
      });
      return {number};
    } catch (error) {
      return {stop: prefixed('gh pr create falhou: ', error)};
    }
  }

  private stop(record: TaskRecord, stop: TaskStop): Promise<void> {
    return this.tasks.save({...record, phase: 'stopped', stop, pending: null});
  }

  // Only a branch worktree outside the main checkout can carry a PR.
  private locate(worktreeId: string): {
    repo: Repo;
    worktree: Worktree;
    branch: string;
  } {
    const workspace = this.sessions.currentWorkspace();
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    const repo = workspace?.repos.find(r => r.id === worktree?.repoId);
    if (!worktree?.branch || worktree.isMain || !repo) {
      throw new Error(NO_WORKTREE);
    }
    return {repo, worktree, branch: worktree.branch};
  }

  private target(
    worktree: Worktree,
    items: MappedSessions['items'],
  ): MultiplexerSession | null {
    return (
      newestFlySession(items.filter(i => i.worktreeId === worktree.id))
        ?.session ?? null
    );
  }

  private summaryOf(
    worktree: Worktree,
    target: MultiplexerSession,
  ): Promise<TranscriptSummary | null> {
    return this.transcripts.forSession({
      launchCwd: worktree.path,
      // newestFlySession only returns sessions that carry an id.
      sessionId: target.options['@fly_session_id'] as string,
    });
  }

  // A record left by another branch at this path is stale: treated as absent.
  private async recordOf(worktree: Worktree): Promise<TaskRecord | null> {
    const record = await this.tasks.get(worktree.path);
    return record?.branch === worktree.branch ? record : null;
  }

  // P8: a worktree "Nova tarefa" did not create gets its record on the first
  // open, with the default branch as base and no original prompt.
  private async newRecord(
    repo: Repo,
    worktreePath: string,
    branch: string,
    now: number,
  ): Promise<Unopened> {
    return {
      id: this.ids.uuid(),
      repoPath: repo.path,
      worktreePath,
      branch,
      base: await resolveDefaultBranch(this.vcs, this.prs, repo.path),
      model: null,
      promptFile: null,
      prNumber: null,
      ciAttempts: 0,
      fixedSha: null,
      reviewSeenAt: null,
      review: null,
      outbox: null,
      createdAt: now,
    };
  }
}
