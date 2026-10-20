import {join} from 'node:path';

import {Injectable} from '@nestjs/common';

import {PullRequest, QueueSnapshot, WorktreeQueue} from '../domain/queue';
import {Activity, ReceiptResult} from '../domain/transcript';
import {Workspace, Worktree} from '../domain/workspace';
import {FileStore} from '../interfaces/file-store';
import {PrGateway} from '../interfaces/pr-gateway';
import {MultiplexerSession} from '../interfaces/session-launcher';
import {TranscriptSource} from '../interfaces/transcript-source';
import {classifyActivity, worktreeStatus} from './queue-rules';
import {
  errorMessage,
  isMissing,
  MappedSessions,
  SessionService,
} from './session-service';

export const GH_MISSING = 'gh não encontrado — instale com: brew install gh';

type GithubStatus = Pick<QueueSnapshot, 'github' | 'message'>;

// What one session contributes to its worktree.
type SessionRead = {
  worktreeId: string;
  activity: Activity | null;
  receipt: ReceiptResult | null;
};

const hasBranch = (worktree: Worktree): boolean =>
  !worktree.isMain && !!worktree.branch;

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
    private readonly files: FileStore,
  ) {}

  async refreshPullRequests(): Promise<void> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) return;
    const polled = new Set(
      workspace.worktrees.filter(hasBranch).map(w => w.repoId),
    );
    const repos = workspace.repos.filter(r => polled.has(r.id));
    const results = await Promise.allSettled(
      repos.map(async r => [r.path, await this.prs.list(r.path)] as const),
    );
    // A failed repo keeps its last list; repos gone from the workspace drop out.
    const next = new Map<string, PullRequest[]>();
    for (const repo of workspace.repos) {
      const previous = this.pullRequests.get(repo.path);
      if (previous) next.set(repo.path, previous);
    }
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === 'rejected') failures.push(result.reason);
      else next.set(...result.value);
    }
    this.pullRequests = next;
    this.github = githubStatus(failures);
  }

  async snapshot(now = Date.now()): Promise<QueueSnapshot> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) return {...this.github, worktrees: []};
    const {items} = await this.sessions.mapped();
    const reads = await this.readSessions(items, now);
    const worktrees = await Promise.all(
      workspace.worktrees.map(worktree =>
        this.queueOf(
          workspace,
          worktree,
          reads.filter(r => r.worktreeId === worktree.id),
        ),
      ),
    );
    return {...this.github, worktrees};
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
          return {worktreeId, ...(await this.readFly(session, sessionId, now))};
        }
        // Two external claudes in one project dir can't be told apart (D8a).
        const shared =
          externalCwds.filter(cwd => cwd === session.cwd).length > 1;
        const activity = shared
          ? 'unknown'
          : await this.readExternal(session, flyIds, now);
        return {worktreeId, activity, receipt: null};
      }),
    );
  }

  // A failed read is no summary, which classifies as unknown.
  private async readFly(
    session: MultiplexerSession,
    sessionId: string,
    now: number,
  ): Promise<Omit<SessionRead, 'worktreeId'>> {
    const {options} = session;
    const launchCwd =
      options['@fly_task_repo'] ?? options['@fly_worktree'] ?? session.cwd;
    const summary = await this.transcripts
      .forSession({launchCwd, sessionId})
      .catch(() => null);
    return {
      activity: classifyActivity(summary, now),
      receipt: summary?.receipt ?? null,
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
      return found === 'ambiguous' ? 'unknown' : classifyActivity(found, now);
    } catch {
      return 'unknown';
    }
  }

  private async queueOf(
    workspace: Workspace,
    worktree: Worktree,
    reads: SessionRead[],
  ): Promise<WorktreeQueue> {
    const activities = reads.flatMap(r => r.activity ?? []);
    const pullRequest = this.pullRequestOf(workspace, worktree);
    const hasPlan =
      activities.includes('unknown') &&
      (await this.files.exists(join(worktree.path, '.supera', 'plan.md')));
    return {
      worktreeId: worktree.id,
      status: worktreeStatus({activities, pullRequest, hasPlan}),
      pullRequest,
      receipt: reads.find(r => r.receipt)?.receipt ?? null,
    };
  }

  // The open PR of the branch, else its newest merged one.
  private pullRequestOf(
    workspace: Workspace,
    worktree: Worktree,
  ): PullRequest | null {
    if (!hasBranch(worktree)) return null;
    const listed = workspace.repos
      .filter(r => r.id === worktree.repoId)
      .flatMap(r => this.pullRequests.get(r.path) ?? []);
    const own = listed.filter(pr => pr.branch === worktree.branch);
    const merged = own
      .filter(pr => pr.state === 'merged')
      .sort((a, b) => b.number - a.number);
    return own.find(pr => pr.state === 'open') ?? merged[0] ?? null;
  }
}
