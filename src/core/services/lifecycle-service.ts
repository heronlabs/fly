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
import {createPullRequest, PR_FILE} from './lifecycle-steps';
import {QueueService} from './queue-service';
import {errorMessage, MappedSessions, SessionService} from './session-service';
import {
  isSessionIdle,
  newestFlySession,
  openInstruction,
  prRequest,
} from './task-rules';
import {TerminalService} from './terminal-service';

const NO_WORKTREE = 'Worktree não encontrado';
const BUSY = 'A sessão está ocupada; aguarde o turno terminar';

const PROMPT_FILE = 'prompt.md';
const REQUEST_FILE = 'pr-request.md';

// The record fields an open request sets, whatever they were before: a new
// PR starts its CI loop and its review forwarding from scratch.
type Unopened = Omit<
  TaskRecord,
  'phase' | 'stop' | 'pending' | 'ciAttempts' | 'fixedSha' | 'review' | 'outbox'
>;

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

  // Worktree paths with an open request between its checks and its save.
  private readonly requesting = new Set<string>();
  private ticking = false;

  // P8: asks the worktree's idle session to commit and write the PR's text;
  // tick finishes the job once that turn ends. An overlapping request for the
  // same worktree is refused before anything is read, so one click types once.
  async openPullRequest(worktreeId: string, now = Date.now()): Promise<void> {
    const {repo, worktree, branch} = this.locate(worktreeId);
    if (this.requesting.has(worktree.path)) throw new Error(BUSY);
    this.requesting.add(worktree.path);
    try {
      await this.requestOpen(worktreeId, repo, worktree, branch, now);
    } finally {
      this.requesting.delete(worktree.path);
    }
  }

  private async requestOpen(
    worktreeId: string,
    repo: Repo,
    worktree: Worktree,
    branch: string,
    now: number,
  ): Promise<void> {
    if (this.queue.pullRequestFor(worktreeId)?.state === 'open') {
      throw new Error('Já existe um PR aberto');
    }
    const target = this.target(worktree, (await this.sessions.mapped()).items);
    if (!target) throw new Error('Nenhuma sessão do fly aberta neste worktree');
    const summary = await this.summaryOf(worktree, target);
    const existing = await this.recordOf(worktree);
    // A request already typed counts as busy until tick settles it.
    if (!isSessionIdle(summary, target, now) || existing?.pending)
      throw new Error(BUSY);
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
    // A pr.json left by an earlier request must not pass for this one's.
    await this.taskFiles.write(record.id, PR_FILE, '');
    const headSha = await this.vcs.headSha(worktree.path);
    await this.launcher.sendText(target.name, openInstruction(requestFile));
    await this.tasks.save({
      ...record,
      phase: 'opening',
      stop: null,
      pending: {kind: 'open', sentAt: now, headSha},
      ciAttempts: 0,
      fixedSha: null,
      review: null,
      outbox: null,
    });
  }

  // Settles every pending open request whose turn has ended. One record's
  // failure never holds up another's; the first one rejects at the end. A
  // tick that starts while another runs returns at once, so a request is
  // never pushed or created twice.
  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.settleAll(now);
    } finally {
      this.ticking = false;
    }
  }

  private async settleAll(now: number): Promise<void> {
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
    // From here the request is settled: any failure is a stop with its
    // message, never a request left pending.
    try {
      const number = await createPullRequest(
        {
          vcs: this.vcs,
          prs: this.prs,
          queue: this.queue,
          taskFiles: this.taskFiles,
        },
        record,
        worktree.path,
      );
      await this.tasks.save({
        ...record,
        prNumber: number,
        phase: 'ci',
        pending: null,
        reviewSeenAt: now,
      });
    } catch (error) {
      await this.stop(record, {kind: 'open', message: errorMessage(error)});
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
      reviewSeenAt: null,
      createdAt: now,
    };
  }
}
