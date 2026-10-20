import {join} from 'node:path';

import {
  PullRequest,
  QueueSnapshot,
  WorktreeQueue,
} from '../../../../src/core/domain/queue';
import {
  ReceiptResult,
  TranscriptSummary,
} from '../../../../src/core/domain/transcript';
import {Workspace} from '../../../../src/core/domain/workspace';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {
  GH_AUTH_MESSAGE,
  PrGateway,
} from '../../../../src/core/interfaces/pr-gateway';
import {MultiplexerSession} from '../../../../src/core/interfaces/session-launcher';
import {TranscriptSource} from '../../../../src/core/interfaces/transcript-source';
import {
  GH_MISSING,
  QueueService,
} from '../../../../src/core/services/queue-service';
import {
  MappedSessions,
  SessionService,
} from '../../../../src/core/services/session-service';

const now = 1_800_000_000_000;

const repo = (id: string) => ({id, name: id, group: '', path: `/r/${id}`});
const wt = (
  id: string,
  repoId: string,
  branch: string | null,
  isMain = false,
) => ({id, repoId, path: `/r/${id}`, branch, head: 'h', isMain});
const workspace: Workspace = {
  root: '/r',
  repos: [repo('talon'), repo('nest'), repo('docs')],
  worktrees: [
    wt('talon', 'talon', 'main', true),
    wt('talon/.worktrees/feat', 'talon', 'feat'),
    wt('talon/.worktrees/fix', 'talon', 'fix'),
    wt('nest', 'nest', 'main', true),
    wt('nest/.worktrees/x', 'nest', 'x'),
    wt('docs', 'docs', 'main', true),
    wt('docs/.worktrees/detached', 'docs', null),
  ],
};
const withoutTalon: Workspace = {
  ...workspace,
  repos: workspace.repos.filter(r => r.id !== 'talon'),
  worktrees: workspace.worktrees.filter(w => w.repoId !== 'talon'),
};

const summary = (over: Partial<TranscriptSummary> = {}): TranscriptSummary => ({
  phase: 'turn-ended',
  asking: false,
  openTools: 0,
  lastEventAt: now - 1000,
  wakeupAt: null,
  looping: false,
  lastTurnEndAt: now - 1000,
  backgroundAgents: 0,
  backgroundShells: [],
  launchCwd: null,
  worktreePath: null,
  receipt: null,
  ...over,
});
const running = summary({phase: 'mid-turn'});
const waiting = summary();
const receipt = (text: string): ReceiptResult => ({
  kind: 'valid',
  receipt: {summary: text, filesChanged: [], verification: {}},
});

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  url: 'https://github.com/o/r/pull/1',
  branch: 'feat',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  review: 'approved',
  checks: 'passing',
  ...over,
});

const item = (
  worktreeId: string,
  over: Partial<MultiplexerSession>,
): MappedSessions['items'][number] => ({
  worktreeId,
  session: {
    name: 'n',
    cwd: `/r/${worktreeId}`,
    createdAt: 1,
    attachedClients: 0,
    options: {},
    ...over,
  },
});
const fly = (worktreeId: string, sessionId: string) =>
  item(worktreeId, {
    options: {
      '@fly_session_id': sessionId,
      '@fly_worktree': `/r/${worktreeId}`,
    },
  });
const task = (worktreeId: string, sessionId: string) =>
  item(worktreeId, {
    options: {
      '@fly_session_id': sessionId,
      '@fly_task_repo': `/r/${worktreeId}`,
      '@fly_worktree': `/r/${worktreeId}`,
    },
  });
const external = (worktreeId: string, cwd = `/r/${worktreeId}`) =>
  item(worktreeId, {cwd});

const queueOf = (snap: QueueSnapshot, id: string): WorktreeQueue | undefined =>
  snap.worktrees.find(w => w.worktreeId === id);
const statusOf = (snap: QueueSnapshot, id: string) => queueOf(snap, id)?.status;
const enoent = () =>
  Object.assign(new Error('spawn gh ENOENT'), {code: 'ENOENT'});

describe('QueueService', () => {
  const currentWorkspace = vi.fn();
  const mapped = vi.fn();
  const sessions = {currentWorkspace, mapped} as unknown as SessionService;
  const forSession = vi.fn();
  const forDirectory = vi.fn();
  const transcripts = {forSession, forDirectory} as unknown as TranscriptSource;
  const list = vi.fn();
  const prs = {list} as unknown as PrGateway;
  const exists = vi.fn();
  const files = {exists} as unknown as FileStore;
  let service: QueueService;

  const sessionsAre = (items: MappedSessions['items']) =>
    mapped.mockResolvedValue({tmux: 'ok', message: null, items});
  const pullRequestsAre = (byRepo: Record<string, PullRequest[] | Error>) =>
    list.mockImplementation((path: string) => {
      const listed = byRepo[path] ?? [];
      return listed instanceof Error
        ? Promise.reject(listed)
        : Promise.resolve(listed);
    });

  beforeEach(() => {
    vi.resetAllMocks();
    currentWorkspace.mockReturnValue(workspace);
    sessionsAre([]);
    list.mockResolvedValue([]);
    exists.mockResolvedValue(false);
    forSession.mockResolvedValue(null);
    forDirectory.mockResolvedValue(null);
    service = new QueueService(sessions, transcripts, prs, files);
  });

  describe('refreshPullRequests', () => {
    it('Should do nothing without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await service.refreshPullRequests();
      expect(list).not.toHaveBeenCalled();
    });

    it('Should list only repos with a branch worktree, then report ok', async () => {
      await service.refreshPullRequests();
      expect(list.mock.calls).toEqual([['/r/talon'], ['/r/nest']]);
      const snap = await service.snapshot(now);
      expect(snap.github).toBe('ok');
      expect(snap.message).toBeNull();
    });

    it('Should report gh missing on ENOENT, even after another failure', async () => {
      pullRequestsAre({'/r/talon': new Error('boom'), '/r/nest': enoent()});
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect(snap.github).toBe('missing');
      expect(snap.message).toBe(
        'gh não encontrado — instale com: brew install gh',
      );
      expect(snap.message).toBe(GH_MISSING);
    });

    it('Should report a logged-out gh as an error with its message', async () => {
      pullRequestsAre({'/r/nest': new Error(GH_AUTH_MESSAGE)});
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect(snap.github).toBe('error');
      expect(snap.message).toBe('gh não autenticado — rode: gh auth login');
    });

    it("Should report the first failure's message", async () => {
      pullRequestsAre({
        '/r/talon': new Error('first'),
        '/r/nest': new Error('second'),
      });
      await service.refreshPullRequests();
      expect((await service.snapshot(now)).message).toBe('first');
    });

    it("Should keep a failed repo's previous list and replace a listed one", async () => {
      pullRequestsAre({
        '/r/talon': [pr({branch: 'feat', number: 4})],
        '/r/nest': [pr({branch: 'x', number: 7})],
      });
      await service.refreshPullRequests();
      pullRequestsAre({'/r/talon': new Error('boom'), '/r/nest': []});
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect(snap.github).toBe('error');
      expect(queueOf(snap, 'talon/.worktrees/feat')?.pullRequest?.number).toBe(
        4,
      );
      expect(queueOf(snap, 'nest/.worktrees/x')?.pullRequest).toBeNull();
    });

    it('Should recover to ok once every repo lists again', async () => {
      pullRequestsAre({'/r/talon': enoent()});
      await service.refreshPullRequests();
      pullRequestsAre({});
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect([snap.github, snap.message]).toEqual(['ok', null]);
    });

    it('Should drop the PRs of a repo removed from the workspace', async () => {
      pullRequestsAre({'/r/talon': [pr({branch: 'feat', number: 4})]});
      await service.refreshPullRequests();
      currentWorkspace.mockReturnValue(withoutTalon);
      await service.refreshPullRequests();
      expect(list).toHaveBeenLastCalledWith('/r/nest');
      currentWorkspace.mockReturnValue(workspace);
      const snap = await service.snapshot(now);
      expect(queueOf(snap, 'talon/.worktrees/feat')?.pullRequest).toBeNull();
    });
  });

  describe('snapshot', () => {
    it('Should return no worktrees without a workspace, keeping the gh status', async () => {
      pullRequestsAre({'/r/talon': enoent()});
      await service.refreshPullRequests();
      currentWorkspace.mockReturnValue(null);
      expect(await service.snapshot(now)).toEqual({
        github: 'missing',
        message: GH_MISSING,
        worktrees: [],
      });
      expect(mapped).not.toHaveBeenCalled();
    });

    it('Should list every worktree in workspace order, idle without activity', async () => {
      expect(await service.snapshot(now)).toEqual({
        github: 'ok',
        message: null,
        worktrees: workspace.worktrees.map(w => ({
          worktreeId: w.id,
          status: 'idle',
          pullRequest: null,
          receipt: null,
        })),
      });
    });

    it('Should read a task session from its repo and a started one from its worktree', async () => {
      sessionsAre([
        item('talon/.worktrees/feat', {
          cwd: '/r/talon',
          options: {
            '@fly_session_id': 's1',
            '@fly_task_repo': '/r/talon',
            '@fly_worktree': '/r/talon/.worktrees/feat',
          },
        }),
        item('talon/.worktrees/fix', {
          cwd: '/r/talon/.worktrees/fix/src',
          options: {
            '@fly_session_id': 's2',
            '@fly_worktree': '/r/talon/.worktrees/fix',
          },
        }),
      ]);
      forSession.mockResolvedValue(running);
      const snap = await service.snapshot(now);
      expect(forSession.mock.calls).toEqual([
        [{launchCwd: '/r/talon', sessionId: 's1'}],
        [{launchCwd: '/r/talon/.worktrees/fix', sessionId: 's2'}],
      ]);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('engineer');
      expect(statusOf(snap, 'talon/.worktrees/fix')).toBe('engineer');
      expect(forDirectory).not.toHaveBeenCalled();
    });

    it('Should read a fly session with no worktree option from its cwd', async () => {
      sessionsAre([
        item('nest', {cwd: '/r/nest', options: {'@fly_session_id': 's3'}}),
      ]);
      forSession.mockResolvedValue(waiting);
      const snap = await service.snapshot(now);
      expect(forSession).toHaveBeenCalledWith({
        launchCwd: '/r/nest',
        sessionId: 's3',
      });
      expect(statusOf(snap, 'nest')).toBe('waiting');
    });

    it('Should look up an external session since its creation, excluding fly ids', async () => {
      sessionsAre([
        fly('talon', 's1'),
        item('talon/.worktrees/feat', {createdAt: 1_700_000_000}),
        fly('nest', 's2'),
      ]);
      forDirectory.mockResolvedValue(summary({asking: true}));
      const snap = await service.snapshot(now);
      expect(forDirectory).toHaveBeenCalledExactlyOnceWith({
        cwd: '/r/talon/.worktrees/feat',
        since: 1_700_000_000_000,
        exclude: ['s1', 's2'],
        now,
      });
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('waiting');
    });

    it('Should read two external sessions in one cwd as unknown, without looking', async () => {
      sessionsAre([
        external('nest/.worktrees/x'),
        external('nest/.worktrees/x'),
        // A fly session sharing a cwd does not make the external one shared.
        fly('talon', 's1'),
        external('talon'),
      ]);
      forSession.mockResolvedValue(waiting);
      const snap = await service.snapshot(now);
      expect(forDirectory).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({cwd: '/r/talon'}),
      );
      expect(statusOf(snap, 'nest/.worktrees/x')).toBe('unknown');
      expect(statusOf(snap, 'talon')).toBe('waiting');
    });

    it('Should still count plan.md for shared externals and failed reads', async () => {
      sessionsAre([
        external('talon/.worktrees/feat'),
        external('talon/.worktrees/feat'),
        external('nest/.worktrees/x'),
      ]);
      forDirectory.mockRejectedValue(new Error('EACCES'));
      exists.mockResolvedValue(true);
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('engineer');
      expect(statusOf(snap, 'nest/.worktrees/x')).toBe('engineer');
      expect(forDirectory).toHaveBeenCalledTimes(1);
    });

    it('Should read an ambiguous directory as unknown and no transcript as idle', async () => {
      sessionsAre([
        external('talon/.worktrees/feat'),
        external('talon/.worktrees/fix'),
      ]);
      forDirectory.mockImplementation(({cwd}: {cwd: string}) =>
        Promise.resolve(
          cwd === '/r/talon/.worktrees/feat' ? 'ambiguous' : null,
        ),
      );
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('unknown');
      expect(statusOf(snap, 'talon/.worktrees/fix')).toBe('idle');
    });

    it('Should read a session whose transcript read rejects as unknown', async () => {
      sessionsAre([fly('talon/.worktrees/feat', 's1'), external('nest')]);
      forSession.mockRejectedValue(new Error('EACCES'));
      forDirectory.mockRejectedValue(new Error('EACCES'));
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('unknown');
      expect(statusOf(snap, 'nest')).toBe('unknown');
      expect(queueOf(snap, 'talon/.worktrees/feat')?.receipt).toBeNull();
    });

    it('Should read a started session without a transcript yet as waiting', async () => {
      sessionsAre([fly('talon/.worktrees/feat', 's1')]);
      forSession.mockResolvedValue(null);
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('waiting');
    });

    it('Should read a started session with phase none as waiting', async () => {
      sessionsAre([fly('talon/.worktrees/feat', 's1')]);
      forSession.mockResolvedValue(summary({phase: 'none'}));
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('waiting');
    });

    it('Should keep a started session waiting even with a plan.md', async () => {
      sessionsAre([fly('talon/.worktrees/feat', 's1')]);
      forSession.mockResolvedValue(null);
      exists.mockResolvedValue(true);
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('waiting');
      expect(exists).not.toHaveBeenCalled();
    });

    it('Should read a task session without a transcript yet as unknown', async () => {
      sessionsAre([task('talon/.worktrees/feat', 's1')]);
      forSession.mockResolvedValue(null);
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('unknown');
    });

    it('Should prefer the open PR, then the newest merged, ignoring closed', async () => {
      pullRequestsAre({
        '/r/talon': [
          pr({branch: 'feat', number: 3, state: 'merged'}),
          pr({branch: 'feat', number: 4}),
          pr({branch: 'fix', number: 2, state: 'merged'}),
          pr({branch: 'fix', number: 5, state: 'merged'}),
          pr({branch: 'fix', number: 3, state: 'merged'}),
          pr({branch: 'fix', number: 9, state: 'closed'}),
          pr({branch: 'main', number: 11}),
        ],
        '/r/nest': [pr({branch: 'x', number: 7, state: 'closed'})],
      });
      await service.refreshPullRequests();
      sessionsAre([fly('talon', 's1')]);
      forSession.mockResolvedValue(running);
      const snap = await service.snapshot(now);
      expect(queueOf(snap, 'talon/.worktrees/feat')).toEqual({
        worktreeId: 'talon/.worktrees/feat',
        status: 'ready',
        pullRequest: pr({branch: 'feat', number: 4}),
        receipt: null,
      });
      expect(queueOf(snap, 'talon/.worktrees/fix')?.pullRequest?.number).toBe(
        5,
      );
      expect(statusOf(snap, 'talon/.worktrees/fix')).toBe('merged');
      expect(queueOf(snap, 'nest/.worktrees/x')?.pullRequest).toBeNull();
      expect(statusOf(snap, 'nest/.worktrees/x')).toBe('idle');
      expect(queueOf(snap, 'talon')?.pullRequest).toBeNull();
      expect(statusOf(snap, 'talon')).toBe('engineer');
    });

    it("Should not show another repo's PR on a branch of the same name", async () => {
      pullRequestsAre({
        '/r/talon': [],
        '/r/nest': [pr({branch: 'feat', number: 8})],
      });
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect(queueOf(snap, 'talon/.worktrees/feat')?.pullRequest).toBeNull();
    });

    it('Should check plan.md only for unknown, reading unknown with a plan as engineer', async () => {
      sessionsAre([
        external('talon/.worktrees/feat'),
        fly('talon/.worktrees/fix', 's1'),
        task('nest/.worktrees/x', 's2'),
      ]);
      forDirectory.mockResolvedValue('ambiguous');
      forSession.mockImplementation(({sessionId}: {sessionId: string}) =>
        Promise.resolve(sessionId === 's1' ? waiting : null),
      );
      exists.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/r/talon/')),
      );
      const snap = await service.snapshot(now);
      expect(exists.mock.calls).toEqual([
        [join('/r/talon/.worktrees/feat', '.supera', 'plan.md')],
        [join('/r/nest/.worktrees/x', '.supera', 'plan.md')],
      ]);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('engineer');
      expect(statusOf(snap, 'talon/.worktrees/fix')).toBe('waiting');
      expect(statusOf(snap, 'nest/.worktrees/x')).toBe('unknown');
    });

    it("Should put the first fly session's receipt on its worktree", async () => {
      sessionsAre([
        external('talon/.worktrees/feat'),
        fly('talon/.worktrees/feat', 's1'),
        fly('talon/.worktrees/feat', 's2'),
        fly('talon/.worktrees/feat', 's3'),
      ]);
      forDirectory.mockResolvedValue(summary({receipt: receipt('external')}));
      const receipts: Record<string, ReceiptResult | null> = {
        s1: null,
        s2: receipt('second'),
        s3: receipt('third'),
      };
      forSession.mockImplementation(({sessionId}: {sessionId: string}) =>
        Promise.resolve(summary({receipt: receipts[sessionId] ?? null})),
      );
      const snap = await service.snapshot(now);
      expect(queueOf(snap, 'talon/.worktrees/feat')?.receipt).toEqual(
        receipt('second'),
      );
      expect(queueOf(snap, 'talon/.worktrees/fix')?.receipt).toBeNull();
    });

    it('Should take statuses from PRs alone when tmux is missing', async () => {
      mapped.mockResolvedValue({
        tmux: 'missing',
        message: 'tmux não encontrado — instale com: brew install tmux',
        items: [],
      });
      pullRequestsAre({'/r/talon': [pr({branch: 'feat', checks: 'failing'})]});
      await service.refreshPullRequests();
      const snap = await service.snapshot(now);
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('failed');
      expect(statusOf(snap, 'talon/.worktrees/fix')).toBe('idle');
      expect(forSession).not.toHaveBeenCalled();
      expect(forDirectory).not.toHaveBeenCalled();
    });

    it('Should classify against the current time by default', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(now);
      sessionsAre([
        fly('talon/.worktrees/feat', 's1'),
        external('talon/.worktrees/fix'),
      ]);
      // Stalled only when measured from `now`.
      forSession.mockResolvedValue(
        summary({phase: 'mid-turn', lastEventAt: now - 11 * 60_000}),
      );
      const snap = await service.snapshot();
      expect(forDirectory).toHaveBeenCalledWith(expect.objectContaining({now}));
      expect(statusOf(snap, 'talon/.worktrees/feat')).toBe('unknown');
    });
  });
});
