import {Injectable} from '@nestjs/common';

import {PullRequest, QueueSnapshot, WorktreeQueue} from '../domain/queue';
import {TaskRecord} from '../domain/task';
import {Activity, TranscriptSummary} from '../domain/transcript';
import {Workspace, Worktree} from '../domain/workspace';
import {PrGateway} from '../interfaces/pr-gateway';
import {MultiplexerSession} from '../interfaces/session-launcher';
import {TaskStore} from '../interfaces/task-store';
import {TranscriptSource} from '../interfaces/transcript-source';
import {classifyActivity, worktreeStatus} from './queue-rules';
import {
  errorMessage,
  isMissing,
  MappedSessions,
  SessionService,
} from './session-service';
import {isSessionIdle, newestFlySession} from './task-rules';

export const NO_OPEN_PR = 'Sem PR aberto para fazer merge';
export const GH_MISSING = 'gh não encontrado — instale com: brew install gh';

type GithubStatus = Pick<QueueSnapshot, 'github' | 'message'>;

// What one session contributes to its worktree.
type SessionRead = {
  worktreeId: string;
  session: MultiplexerSession;
  activity: Activity | null;
  // The session takes a new instruction (isSessionIdle).
  // Only a fly session reports it.
  idle?: boolean;
};

const hasBranch = (worktree: Worktree): boolean =>
  !worktree.isMain && !!worktree.branch;

// Only a repo with a branch worktree can have a PR the queue shows.
const polledRepoPaths = (workspace: Workspace): string[] => {
  const polled = new Set(
    workspace.worktrees.filter(hasBranch).map(w => w.repoId),
  );
  return workspace.repos.filter(r => polled.has(r.id)).map(r => r.path);
};

const githubStatus = (failures: unknown[]): GithubStatus => {
  if (failures.length === 0) return {github: 'ok', message: null};
  if (failures.some(isMissing)) return {github: 'missing', message: GH_MISSING};
  return {github: 'error', message: errorMessage(failures[0])};
};

@Injectable()
export class QueueService {
  // Keyed by repo path, so another folder's repo with the same id never inherits it.
  private pullRequests = new Map<string, PullRequest[]>();
  private github: GithubStatus = {github: 'ok', message: null};

  constructor(
    private readonly sessions: SessionService,
    private readonly transcripts: TranscriptSource,
    private readonly prs: PrGateway,
    private readonly tasks: TaskStore,
  ) {}

  // Every open workspace at once: a repo two of them share is listed once.
  async refreshPullRequests(workspaces: Workspace[]): Promise<void> {
    const polled = new Set(workspaces.flatMap(polledRepoPaths));
    const results = await Promise.allSettled(
      [...polled].map(async path => [path, await this.prs.list(path)] as const),
    );
    // A failed repo keeps its last list; repos no workspace holds drop out.
    const paths = new Set(workspaces.flatMap(w => w.repos.map(r => r.path)));
    const next = new Map(
      [...this.pullRequests].filter(([path]) => paths.has(path)),
    );
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === 'rejected') failures.push(result.reason);
      else next.set(...result.value);
    }
    this.pullRequests = next;
    this.github = githubStatus(failures);
  }

  async mergePullRequest(
    workspace: Workspace | null,
    worktreeId: string,
  ): Promise<void> {
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    if (!workspace || !worktree) throw new Error('Worktree não encontrado');
    const repo = workspace.repos.find(r => r.id === worktree.repoId);
    if (!repo) throw new Error('Worktree não encontrado');
    const pullRequest = this.pullRequestOf(workspace, worktree);
    if (pullRequest?.state !== 'open') throw new Error(NO_OPEN_PR);
    await this.prs.merge(repo.path, pullRequest.number);
    await this.refreshRepo(repo.path);
  }

  // One repo after fly changed its PRs, so the queue shows it at once; the
  // other repos keep their lists, and so does this one if gh fails (the next
  // refresh reports it).
  async refreshRepo(repoPath: string): Promise<void> {
    try {
      this.pullRequests.set(repoPath, await this.prs.list(repoPath));
    } catch {
      // keeps the last list
    }
  }

  async snapshot(
    workspace: Workspace | null,
    now = Date.now(),
  ): Promise<QueueSnapshot> {
    if (!workspace) return {...this.github, worktrees: []};
    const {items} = await this.sessions.mapped(workspace);
    const reads = await this.readSessions(items, now);
    const records = await this.tasks.list();
    const worktrees = await Promise.all(
      workspace.worktrees.map(worktree =>
        this.queueOf(
          workspace,
          worktree,
          reads.filter(r => r.worktreeId === worktree.id),
          records,
        ),
      ),
    );
    return {...this.github, worktrees};
  }

  // The PR the queue shows for a worktree (see pullRequestOf).
  pullRequestFor(
    workspace: Workspace | null,
    worktreeId: string,
  ): PullRequest | null {
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    return workspace && worktree
      ? this.pullRequestOf(workspace, worktree)
      : null;
  }

  private readSessions(
    items: MappedSessions['items'],
    now: number,
  ): Promise<SessionRead[]> {
    const flyIds = items.flatMap(
      i => i.session.options['@fly_session_id'] ?? [],
    );
    const externalCwds = items
      .filter(i => !i.session.options['@fly_session_id'])
      .map(i => i.session.cwd);
    return Promise.all(
      items.map(async ({session, worktreeId}): Promise<SessionRead> => {
        const sessionId = session.options['@fly_session_id'];
        if (sessionId) {
          return {
            worktreeId,
            session,
            ...(await this.readFly(session, sessionId, now)),
          };
        }
        // Two external claudes in one project dir can't be told apart (D8a).
        const shared =
          externalCwds.filter(cwd => cwd === session.cwd).length > 1;
        const activity = shared
          ? // Stryker disable next-line StringLiteral: worktreeStatus reads any activity other than waiting, running or scheduled as unknown, so an empty string yields the same status
            'unknown'
          : await this.readExternal(session, flyIds, now);
        return {worktreeId, session, activity};
      }),
    );
  }

  // A failed read is no summary, which classifies as unknown.
  private async readFly(
    session: MultiplexerSession,
    sessionId: string,
    now: number,
  ): Promise<Omit<SessionRead, 'worktreeId' | 'session'>> {
    const {options} = session;
    const launchCwd = options['@fly_worktree'] ?? session.cwd;
    // A session started without a prompt has no transcript until the first one.
    const started = options['@fly_task'] === undefined;
    let summary: TranscriptSummary | null;
    try {
      summary = await this.transcripts.forSession({launchCwd, sessionId});
    } catch {
      return {activity: classifyActivity(null, now)};
    }
    const fresh = started && (summary === null || summary.phase === 'none');
    return {
      activity: fresh ? 'waiting' : classifyActivity(summary, now),
      idle: isSessionIdle(summary, session, now),
    };
  }

  // No transcript since the session started is a plain shell: no activity (P7).
  private async readExternal(
    session: MultiplexerSession,
    exclude: string[],
    now: number,
  ): Promise<Activity | null> {
    try {
      const found = await this.transcripts.forDirectory({
        cwd: session.cwd,
        since: session.createdAt * 1000,
        exclude,
        now,
      });
      if (found === null) return null;
      // Stryker disable next-line ConditionalExpression,StringLiteral,BlockStatement: classifyActivity('ambiguous') also yields 'unknown' (no phase, wakeupAt undefined), so the guard only makes the intent explicit.
      if (found === 'ambiguous') {
        // Stryker disable next-line StringLiteral: worktreeStatus reads any activity other than waiting, running or scheduled as unknown, so an empty string yields the same status
        return 'unknown';
      }
      return classifyActivity(found, now);
    } catch {
      // Stryker disable next-line StringLiteral: worktreeStatus reads any activity other than waiting, running or scheduled as unknown, so an empty string yields the same status
      return 'unknown';
    }
  }

  private async queueOf(
    workspace: Workspace,
    worktree: Worktree,
    reads: SessionRead[],
    records: TaskRecord[],
  ): Promise<WorktreeQueue> {
    const activities = reads.flatMap(r => r.activity ?? []);
    const pullRequest = this.pullRequestOf(workspace, worktree);
    // A record left by another branch at this path is stale: not this task's.
    const task =
      records.find(
        r => r.worktreePath === worktree.path && r.branch === worktree.branch,
      ) ?? null;
    return {
      worktreeId: worktree.id,
      status: worktreeStatus({activities, pullRequest, task}),
      pullRequest,
      task: task && {
        phase: task.phase,
        ciAttempts: task.ciAttempts,
        stop: task.stop,
        review: task.review,
      },
      // The session LifecycleService would talk to looks idle (P6, P8), and
      // no request or CI wait is under way for a PR the list does not show yet.
      canOpenPr:
        hasBranch(worktree) &&
        pullRequest?.state !== 'open' &&
        !task?.pending &&
        task?.phase !== 'opening' &&
        !(task?.phase === 'ci' && pullRequest === null) &&
        newestFlySession(reads)?.idle === true,
    };
  }

  // The open PR of the branch, else its newest merged or closed one.
  private pullRequestOf(
    workspace: Workspace,
    worktree: Worktree,
  ): PullRequest | null {
    if (!hasBranch(worktree)) return null;
    const paths = new Set(
      workspace.repos.filter(r => r.id === worktree.repoId).map(r => r.path),
    );
    const listed = [...this.pullRequests]
      .filter(([path]) => paths.has(path))
      .flatMap(([, prs]) => prs);
    const own = listed
      .filter(pr => pr.branch === worktree.branch)
      .sort((a, b) => b.number - a.number);
    return own.find(pr => pr.state === 'open') ?? own[0] ?? null;
  }
}
