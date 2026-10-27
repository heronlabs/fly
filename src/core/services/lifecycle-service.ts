import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

import {Injectable} from '@nestjs/common';

import {PR_TEMPLATE} from '../domain/pr-template';
import {TaskAction, TaskRecord} from '../domain/task';
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
import {pollRecord} from './lifecycle-poll';
import {
  createPullRequest,
  PR_FILE,
  sentRecord,
  SESSION_GONE,
  settleTurn,
  stopped,
} from './lifecycle-steps';
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

// A worktree that is gone, elsewhere, or on another branch is not the record's.
const worktreeOf = (
  worktrees: Worktree[],
  record: TaskRecord,
): Worktree | undefined =>
  worktrees.find(
    w => w.path === record.worktreePath && w.branch === record.branch,
  );

// P6: a turn that ended after `now` was taken must not pass for the turn the
// instruction starts.
const sentAtFor = (summary: TranscriptSummary | null, now: number): number =>
  Math.max(now, summary?.lastTurnEndAt ?? 0);

// One record's failure never holds up another's; the first one rejects at
// the end.
const settled = async (work: Promise<void>[]): Promise<void> => {
  const failed = (await Promise.allSettled(work)).find(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  if (failed) throw failed.reason;
};

// The record fields an open request sets, whatever they were before: a new
// PR starts its CI loop and its review forwarding from scratch.
type Unopened = Omit<
  TaskRecord,
  | 'prNumber'
  | 'phase'
  | 'stop'
  | 'pending'
  | 'ciAttempts'
  | 'fixedSha'
  | 'review'
  | 'outbox'
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

  // Worktree paths with an open request between its checks and its save, or
  // a queued action being typed.
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
      prNumber: null,
      phase: 'opening',
      stop: null,
      pending: {kind: 'open', sentAt: sentAtFor(summary, now), headSha},
      ciAttempts: 0,
      fixedSha: null,
      review: null,
      outbox: null,
    });
  }

  // P10, after each PR refresh: moves every task of the workspace along its
  // open PR's CI and review comments (see pollRecord).
  async poll(now = Date.now()): Promise<void> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) return;
    const gateways = {prs: this.prs, taskFiles: this.taskFiles};
    const records = await this.tasks.list();
    await settled(
      records.map(async record => {
        const worktree = worktreeOf(workspace.worktrees, record);
        if (!worktree) return;
        const pr = this.queue.pullRequestFor(worktree.id);
        const next = await pollRecord(gateways, record, pr, now);
        if (next) await this.replace(record, next);
      }),
    );
  }

  // Types every queued fix or review into its idle session and settles every
  // pending action whose turn has ended. A tick that starts while another
  // runs returns at once, so nothing is typed, pushed or created twice.
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
    const records = await this.tasks.list();
    if (!records.some(r => r.pending || r.outbox)) return;
    const {tmux, items} = await this.sessions.mapped();
    // Without a tmux listing, a live session would look gone.
    if (tmux !== 'ok') return;
    await settled(
      records.map(record =>
        this.settle(record, workspace.worktrees, items, now),
      ),
    );
  }

  private async settle(
    record: TaskRecord,
    worktrees: Worktree[],
    items: MappedSessions['items'],
    now: number,
  ): Promise<void> {
    const worktree = worktreeOf(worktrees, record);
    if (!worktree) return;
    const target = this.target(worktree, items);
    const {pending, outbox} = record;
    if (pending) {
      if (!target) return this.replace(record, stopped(record, SESSION_GONE));
      const summary = await this.summaryOf(worktree, target);
      // P6: the turn that follows the instruction has ended.
      if ((summary?.lastTurnEndAt ?? 0) <= (pending.sentAt ?? 0)) return;
      if (pending.kind === 'open') {
        return this.settleOpen(record, worktree.path, now);
      }
      const next = await settleTurn(this.vcs, record, pending, worktree.path);
      return this.replace(record, next);
    }
    // Ruling: a queued action waits for a live session, which the user may
    // start on the worktree.
    if (target && outbox?.text) {
      await this.send(record, outbox, outbox.text, worktree, target, now);
    }
  }

  private async settleOpen(
    record: TaskRecord,
    path: string,
    now: number,
  ): Promise<void> {
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
        path,
      );
      await this.replace(record, {
        ...record,
        prNumber: number,
        phase: 'ci',
        pending: null,
        reviewSeenAt: now,
      });
    } catch (error) {
      const stop = {kind: 'open' as const, message: errorMessage(error)};
      await this.replace(record, stopped(record, stop));
    }
  }

  // P6 for a queued fix or review: typed only into an idle session with no
  // draft, holding the worktree like "Abrir PR" does.
  private async send(
    record: TaskRecord,
    outbox: TaskAction,
    text: string,
    worktree: Worktree,
    target: MultiplexerSession,
    now: number,
  ): Promise<void> {
    if (this.requesting.has(worktree.path)) return;
    this.requesting.add(worktree.path);
    try {
      const headSha = await this.vcs.headSha(worktree.path);
      // A record changed meanwhile (Retomar, Limpar) is not typed for.
      if (!(await this.unchanged(record))) return;
      const summary = await this.summaryOf(worktree, target);
      if (!isSessionIdle(summary, target, now)) return;
      // Right before typing, so a key typed meanwhile still counts.
      if (this.terminals.hasDraft(target.name)) return;
      await this.launcher.sendText(target.name, text);
      const sentAt = sentAtFor(summary, now);
      await this.replace(record, sentRecord(record, outbox, headSha, sentAt));
    } finally {
      this.requesting.delete(worktree.path);
    }
  }

  // "Rodar de novo": reruns the failed jobs of each run an infrastructure
  // stop names, then watches the CI again.
  async rerun(worktreeId: string): Promise<void> {
    const record = await this.recordOf(this.locate(worktreeId).worktree);
    const stop = record?.stop;
    const runIds = (stop?.kind === 'infra' && stop.runIds) || [];
    if (!record || runIds.length === 0) {
      throw new Error('Nada para rodar de novo');
    }
    await Promise.all(runIds.map(id => this.prs.rerun(record.repoPath, id)));
    // The reruns take a while: a record removed or changed meanwhile stays so.
    await this.tasks.saveIfUnchanged(record, {
      ...record,
      phase: 'ci',
      stop: null,
    });
  }

  // "Retomar": drops the stop and the action whose turn fly waits for (a
  // review sent counts as done), resets the CI counter, and watches the open
  // PR again, else goes back to work. A queued action stays: its comments are
  // already counted as seen.
  async resume(worktreeId: string): Promise<void> {
    const {worktree} = this.locate(worktreeId);
    if (this.requesting.has(worktree.path)) throw new Error(BUSY);
    const record = await this.recordOf(worktree);
    if (!record) return;
    const open = this.queue.pullRequestFor(worktreeId)?.state === 'open';
    await this.tasks.save({
      ...record,
      phase: open ? 'ci' : 'working',
      stop: null,
      pending: null,
      ciAttempts: 0,
      fixedSha: null,
      review:
        record.review?.state === 'sent'
          ? {...record.review, state: 'done'}
          : record.review,
    });
  }

  // Ruling: poll and tick save only over the record they read, so a record
  // removed (Limpar) or changed (Retomar) meanwhile is never brought back or
  // undone; the next poll or tick looks again.
  private async replace(read: TaskRecord, next: TaskRecord): Promise<void> {
    if (isDeepStrictEqual(next, read)) return;
    await this.tasks.saveIfUnchanged(read, next);
  }

  private async unchanged(read: TaskRecord): Promise<boolean> {
    return isDeepStrictEqual(await this.tasks.get(read.worktreePath), read);
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
      reviewSeenAt: null,
      createdAt: now,
    };
  }
}
