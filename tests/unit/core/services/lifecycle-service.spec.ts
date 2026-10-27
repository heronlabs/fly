import {isDeepStrictEqual} from 'node:util';

import {PR_TEMPLATE} from '../../../../src/core/domain/pr-template';
import {
  CheckRun,
  PullRequest,
  ReviewComment,
} from '../../../../src/core/domain/queue';
import {TaskRecord, TaskStop} from '../../../../src/core/domain/task';
import {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {Workspace, Worktree} from '../../../../src/core/domain/workspace';
import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {PrGateway} from '../../../../src/core/interfaces/pr-gateway';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../../../src/core/interfaces/session-launcher';
import {TaskFiles} from '../../../../src/core/interfaces/task-files';
import {TaskStore} from '../../../../src/core/interfaces/task-store';
import {TranscriptSource} from '../../../../src/core/interfaces/transcript-source';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {CleanupService} from '../../../../src/core/services/cleanup-service';
import {LifecycleService} from '../../../../src/core/services/lifecycle-service';
import {QueueService} from '../../../../src/core/services/queue-service';
import {
  MappedSessions,
  SessionService,
} from '../../../../src/core/services/session-service';
import {
  logExcerpt,
  prRequest,
  reviewFile,
} from '../../../../src/core/services/task-rules';
import {TerminalService} from '../../../../src/core/services/terminal-service';

const WT = 'talon/.worktrees/feat-x';
const PATH = '/r/talon/.worktrees/feat-x';
const OTHER = 'talon/.worktrees/feat-y';
const OTHER_PATH = '/r/talon/.worktrees/feat-y';
const DIR = '/data/tasks/t1';
const OPEN =
  'fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em /data/tasks/t1/pr-request.md';

const worktree = (
  id: string,
  branch: string | null,
  over: Partial<Worktree> = {},
): Worktree => ({
  id,
  repoId: 'talon',
  path: `/r/${id}`,
  branch,
  head: 'h',
  isMain: false,
  ...over,
});
const workspace: Workspace = {
  root: '/r',
  repos: [{id: 'talon', name: 'talon', group: '', path: '/r/talon'}],
  worktrees: [
    worktree('talon', 'main', {isMain: true}),
    worktree(WT, 'feat-x'),
    worktree(OTHER, 'feat-y'),
    worktree('talon/.worktrees/detached', null),
    worktree('ghost/.worktrees/y', 'y', {repoId: 'ghost'}),
  ],
};

const summary = (over: Partial<TranscriptSummary> = {}): TranscriptSummary => ({
  phase: 'turn-ended',
  asking: false,
  openTools: 0,
  lastEventAt: 500,
  wakeupAt: null,
  looping: false,
  lastTurnEndAt: 500,
  backgroundAgents: 0,
  backgroundShells: [],
  launchCwd: PATH,
  ...over,
});

const item = (
  worktreeId: string,
  name: string,
  createdAt: number,
  sessionId?: string,
): MappedSessions['items'][number] => ({
  worktreeId,
  session: {
    name,
    cwd: `/r/${worktreeId}`,
    createdAt,
    attachedClients: 0,
    options:
      sessionId === undefined
        ? {}
        : {'@fly_session_id': sessionId, '@fly_worktree': `/r/${worktreeId}`},
  } satisfies MultiplexerSession,
});

const record = (over: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 't1',
  repoPath: '/r/talon',
  worktreePath: PATH,
  branch: 'feat-x',
  base: 'main',
  model: 'opus',
  promptFile: `${DIR}/prompt.md`,
  prNumber: null,
  phase: 'working',
  ciAttempts: 0,
  fixedSha: null,
  reviewSeenAt: null,
  review: null,
  outbox: null,
  pending: null,
  stop: null,
  createdAt: 1,
  ...over,
});
const opening = record({
  phase: 'opening',
  pending: {kind: 'open', sentAt: 1000, headSha: 'abc'},
});

const openPr = (state: PullRequest['state']) => ({state}) as PullRequest;

const SHA = 'abc1234fedcba9876543210fedcba9876543210f';
const pull = (over: Partial<PullRequest> = {}): PullRequest => ({
  number: 42,
  url: 'https://github.com/o/r/pull/42',
  branch: 'feat-x',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  review: 'none',
  checks: 'pending',
  title: 'feat: x',
  checkRuns: [],
  headSha: SHA,
  behind: false,
  ...over,
});
const FIX = `fly: a CI do PR #42 falhou (tentativa 1 de 3). Logs: ${DIR}/ci-70-abc1234.log. Corrija, rode as verificações locais e commite (Conventional Commits, sem push).`;
const REVIEW = `fly: há comentários de review novos no PR #42 em ${DIR}/review-42-1700000000000.md. Avalie cada um, corrija o que fizer sentido e commite (Conventional Commits, sem push).`;

describe('LifecycleService', () => {
  const currentWorkspace = vi.fn();
  const mapped = vi.fn();
  const sessions = {currentWorkspace, mapped} as unknown as SessionService;
  const forSession = vi.fn();
  const transcripts = {forSession} as unknown as TranscriptSource;
  const sendText = vi.fn();
  const launcher = {sendText} as unknown as SessionLauncher;
  const hasDraft = vi.fn();
  const terminals = {hasDraft} as unknown as TerminalService;
  const vcsDefault = vi.fn();
  const status = vi.fn();
  const aheadCount = vi.fn();
  const headSha = vi.fn();
  const push = vi.fn();
  const vcs = {
    defaultBranch: vcsDefault,
    status,
    aheadCount,
    headSha,
    push,
  } as unknown as VcsGateway;
  const prDefault = vi.fn();
  const create = vi.fn();
  const failedLog = vi.fn();
  const rerun = vi.fn();
  const reviewComments = vi.fn();
  const prs = {
    defaultBranch: prDefault,
    create,
    failedLog,
    rerun,
    reviewComments,
  } as unknown as PrGateway;
  const pullRequestFor = vi.fn();
  const refreshPullRequests = vi.fn();
  const mergePullRequest = vi.fn();
  const queue = {
    pullRequestFor,
    refreshPullRequests,
    mergePullRequest,
  } as unknown as QueueService;
  const clean = vi.fn();
  const cleanup = {clean} as unknown as CleanupService;
  const get = vi.fn();
  const list = vi.fn();
  const save = vi.fn();
  const saveIfUnchanged = vi.fn();
  const tasks = {get, list, save, saveIfUnchanged} as unknown as TaskStore;
  const dir = vi.fn();
  const write = vi.fn();
  const read = vi.fn();
  const taskFiles = {dir, write, read} as unknown as TaskFiles;
  const uuid = vi.fn();
  const ids = {uuid} as unknown as IdGenerator;
  let service: LifecycleService;

  const sessionsAre = (items: MappedSessions['items']) =>
    mapped.mockResolvedValue({tmux: 'ok', message: null, items});
  // tasks.json as a map by worktree path, read and written through the mocks.
  const store = new Map<string, TaskRecord>();
  const holds = (...records: TaskRecord[]) => {
    store.clear();
    for (const r of records) store.set(r.worktreePath, structuredClone(r));
    list.mockImplementation(async () =>
      [...store.values()].map(r => structuredClone(r)),
    );
    get.mockImplementation(async (path: string) =>
      structuredClone(store.get(path) ?? null),
    );
    save.mockImplementation(
      async (r: TaskRecord) =>
        void store.set(r.worktreePath, structuredClone(r)),
    );
    // The store's compare-and-save writes through save, so tests read one
    // kind of write.
    saveIfUnchanged.mockImplementation(
      async (before: TaskRecord, after: TaskRecord) => {
        if (!isDeepStrictEqual(store.get(before.worktreePath), before)) {
          return false;
        }
        await save(after);
        return true;
      },
    );
  };
  const saved = () => save.mock.calls.map(([r]) => r as TaskRecord);
  const calls: string[] = [];
  const track = (name: string, fn: ReturnType<typeof vi.fn>, value: unknown) =>
    fn.mockImplementation(() => {
      calls.push(name);
      return Promise.resolve(value);
    });

  beforeEach(() => {
    vi.resetAllMocks();
    calls.length = 0;
    currentWorkspace.mockReturnValue(workspace);
    sessionsAre([item(WT, 'fly-feat', 5, 's1')]);
    forSession.mockResolvedValue(summary());
    sendText.mockResolvedValue(undefined);
    hasDraft.mockReturnValue(false);
    vcsDefault.mockResolvedValue('main');
    status.mockResolvedValue({});
    aheadCount.mockResolvedValue(2);
    headSha.mockResolvedValue('abc');
    push.mockResolvedValue(undefined);
    create.mockResolvedValue({
      number: 42,
      url: 'https://github.com/o/r/pull/42',
    });
    pullRequestFor.mockReturnValue(null);
    refreshPullRequests.mockResolvedValue(undefined);
    get.mockResolvedValue(record());
    list.mockResolvedValue([]);
    save.mockResolvedValue(undefined);
    dir.mockImplementation((id: string) => `/data/tasks/${id}`);
    write.mockImplementation((id: string, name: string) =>
      Promise.resolve(`/data/tasks/${id}/${name}`),
    );
    read.mockResolvedValue(null);
    uuid.mockReturnValue('u2');
    service = new LifecycleService(
      sessions,
      transcripts,
      launcher,
      terminals,
      vcs,
      prs,
      queue,
      tasks,
      taskFiles,
      ids,
      cleanup,
    );
  });

  describe('openPullRequest', () => {
    const refused = async (message: string, worktreeId = WT) => {
      await expect(service.openPullRequest(worktreeId, 1000)).rejects.toThrow(
        message,
      );
      expect(sendText).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    };

    it('Should refuse without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await refused('Worktree não encontrado');
    });

    it.each([
      ['an unknown worktree', 'nope'],
      ['the main worktree', 'talon'],
      ['a worktree without a branch', 'talon/.worktrees/detached'],
      ['a worktree whose repo is gone', 'ghost/.worktrees/y'],
    ])('Should refuse %s', async (_name, worktreeId) => {
      await refused('Worktree não encontrado', worktreeId);
      expect(mapped).not.toHaveBeenCalled();
    });

    it('Should refuse when the worktree already has an open PR', async () => {
      pullRequestFor.mockReturnValue(openPr('open'));
      await refused('Já existe um PR aberto');
      expect(pullRequestFor).toHaveBeenCalledWith(WT);
      expect(mapped).not.toHaveBeenCalled();
    });

    it.each<[string, MappedSessions['items']]>([
      ['no session', []],
      ['only an external session', [item(WT, 'ext', 9)]],
      ['a fly session on another worktree', [item(OTHER, 'fly-y', 9, 's9')]],
    ])('Should refuse with %s', async (_name, items) => {
      sessionsAre(items);
      await refused('Nenhuma sessão do fly aberta neste worktree');
      expect(forSession).not.toHaveBeenCalled();
    });

    it('Should refuse when tmux cannot be listed', async () => {
      mapped.mockResolvedValue({tmux: 'missing', message: 'x', items: []});
      await refused('Nenhuma sessão do fly aberta neste worktree');
    });

    it.each<[string, () => void]>([
      [
        'mid-turn',
        () => forSession.mockResolvedValue(summary({phase: 'mid-turn'})),
      ],
      [
        'with no turn yet',
        () => forSession.mockResolvedValue(summary({phase: 'none'})),
      ],
      ['without a transcript', () => forSession.mockResolvedValue(null)],
      [
        'asking a question',
        () => forSession.mockResolvedValue(summary({asking: true})),
      ],
      [
        'running a background agent',
        () => forSession.mockResolvedValue(summary({backgroundAgents: 1})),
      ],
      ['still owing fly a turn', () => get.mockResolvedValue(opening)],
    ])('Should refuse a session %s as busy', async (_name, arrange) => {
      arrange();
      hasDraft.mockReturnValue(true);
      await refused('A sessão está ocupada; aguarde o turno terminar');
    });

    it('Should treat a promptless session without a transcript as idle once started', async () => {
      forSession.mockResolvedValue(null);
      sessionsAre([item(WT, 'fly-feat', 5, 's1')]);

      await service.openPullRequest(WT, 10_000);

      expect(sendText).toHaveBeenCalledWith('fly-feat', OPEN);
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        pending: {sentAt: 10_000},
      });
    });

    it('Should not take a turn that ended after the request was timed for its own', async () => {
      forSession.mockResolvedValue(summary({lastTurnEndAt: 1200}));
      await service.openPullRequest(WT, 1000);
      const sent = save.mock.calls[0]?.[0] as TaskRecord;
      expect(sent.pending?.sentAt).toBe(1200);

      holds(sent);
      save.mockClear();
      await service.tick(1500);
      expect(status).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should propagate a transcript that cannot be read', async () => {
      forSession.mockRejectedValue(new Error('EACCES'));
      await refused('EACCES');
    });

    it('Should refuse a session with unsent text', async () => {
      hasDraft.mockReturnValue(true);
      await refused('Há texto digitado e não enviado na sessão');
    });

    it('Should ask the idle session to commit and write the PR', async () => {
      sessionsAre([
        item(WT, 'fly-old', 1, 's0'),
        item(WT, 'ext', 9),
        item(WT, 'fly-new', 2, 's1'),
      ]);
      track('write', write, `${DIR}/pr-request.md`);
      track('headSha', headSha, 'abc');
      track('sendText', sendText, undefined);
      track('save', save, undefined);
      read.mockResolvedValue('Faz X\ncom exemplo');
      get.mockResolvedValue(
        record({phase: 'stopped', stop: {kind: 'open', message: 'antes'}}),
      );

      await service.openPullRequest(WT, 1000);

      expect(forSession).toHaveBeenCalledExactlyOnceWith({
        launchCwd: PATH,
        sessionId: 's1',
      });
      expect(hasDraft).toHaveBeenCalledExactlyOnceWith('fly-new');
      expect(get).toHaveBeenCalledWith(PATH);
      expect(read).toHaveBeenCalledExactlyOnceWith('t1', 'prompt.md');
      expect(write.mock.calls).toEqual([
        [
          't1',
          'pr-request.md',
          prRequest({
            template: PR_TEMPLATE,
            prompt: 'Faz X\ncom exemplo',
            outFile: `${DIR}/pr.json`,
          }),
        ],
        ['t1', 'pr.json', ''],
      ]);
      expect(headSha).toHaveBeenCalledWith(PATH);
      expect(sendText).toHaveBeenCalledExactlyOnceWith('fly-new', OPEN);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        record({
          phase: 'opening',
          stop: null,
          pending: {kind: 'open', sentAt: 1000, headSha: 'abc'},
        }),
      );
      expect(calls).toEqual(['write', 'write', 'headSha', 'sendText', 'save']);
      expect(vcsDefault).not.toHaveBeenCalled();
      expect(uuid).not.toHaveBeenCalled();
    });

    it('Should open a PR beside a merged one, starting its CI loop over', async () => {
      pullRequestFor.mockReturnValue(openPr('merged'));
      const merged = record({
        phase: 'ci',
        prNumber: 7,
        ciAttempts: 3,
        fixedSha: 'old',
        reviewSeenAt: 900,
        review: {count: 2, state: 'done'},
        outbox: {kind: 'review', text: 'antes', headSha: 'old'},
      });
      get.mockResolvedValue(merged);

      await service.openPullRequest(WT, 1000);

      expect(sendText).toHaveBeenCalledWith('fly-feat', OPEN);
      expect(save).toHaveBeenCalledExactlyOnceWith({
        ...merged,
        prNumber: null,
        phase: 'opening',
        stop: null,
        pending: {kind: 'open', sentAt: 1000, headSha: 'abc'},
        ciAttempts: 0,
        fixedSha: null,
        review: null,
        outbox: null,
      });
    });

    it('Should refuse an overlapping open of the same worktree, then free it', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      sendText.mockImplementationOnce(() => gate);

      const first = service.openPullRequest(WT, 1000);
      await expect(service.openPullRequest(WT, 1000)).rejects.toThrow(
        'A sessão está ocupada; aguarde o turno terminar',
      );
      release();
      await first;
      expect(sendText).toHaveBeenCalledTimes(1);

      await service.openPullRequest(WT, 1000);
      expect(sendText).toHaveBeenCalledTimes(2);
    });

    it.each<[string, () => void]>([
      [
        'typing fails',
        () => sendText.mockRejectedValueOnce(new Error('tmux falhou')),
      ],
      ['there is a draft', () => hasDraft.mockReturnValueOnce(true)],
    ])(
      'Should free the worktree after a request where %s',
      async (_n, arrange) => {
        arrange();
        await expect(service.openPullRequest(WT, 1000)).rejects.toThrow();
        await service.openPullRequest(WT, 1000);
        expect(save).toHaveBeenCalledTimes(1);
      },
    );

    it('Should not take a pr.json left by an earlier request', async () => {
      const disk = new Map<string, string>([
        ['t1/pr.json', '{"title": "feat: old", "body": "old"}'],
      ]);
      write.mockImplementation((id: string, name: string, text: string) => {
        disk.set(`${id}/${name}`, text);
        calls.push(`write ${name}`);
        return Promise.resolve(`/data/tasks/${id}/${name}`);
      });
      read.mockImplementation((id: string, name: string) =>
        Promise.resolve(disk.get(`${id}/${name}`) ?? null),
      );
      track('sendText', sendText, undefined);

      await service.openPullRequest(WT, 1000);
      expect(calls).toEqual([
        'write pr-request.md',
        'write pr.json',
        'sendText',
      ]);
      holds(save.mock.calls[0]?.[0] as TaskRecord);
      save.mockClear();
      forSession.mockResolvedValue(summary({lastTurnEndAt: 1500}));
      aheadCount.mockResolvedValue(1);

      await service.tick(1500);

      expect(push).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          phase: 'stopped',
          stop: {
            kind: 'open',
            message: 'A sessão não escreveu o título e o corpo do PR',
          },
        }),
      );
    });

    it('Should create the record when absent, with the default branch and no prompt', async () => {
      get.mockResolvedValue(null);
      vcsDefault.mockResolvedValue(null);
      prDefault.mockResolvedValue('trunk');
      read.mockResolvedValue('stale prompt');

      await service.openPullRequest(WT, 1000);

      expect(vcsDefault).toHaveBeenCalledWith('/r/talon');
      expect(prDefault).toHaveBeenCalledWith('/r/talon');
      expect(read).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith(
        'u2',
        'pr-request.md',
        prRequest({
          template: PR_TEMPLATE,
          prompt: null,
          outFile: '/data/tasks/u2/pr.json',
        }),
      );
      expect(sendText).toHaveBeenCalledWith(
        'fly-feat',
        'fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em /data/tasks/u2/pr-request.md',
      );
      expect(save).toHaveBeenCalledExactlyOnceWith({
        id: 'u2',
        repoPath: '/r/talon',
        worktreePath: PATH,
        branch: 'feat-x',
        base: 'trunk',
        model: null,
        promptFile: null,
        prNumber: null,
        phase: 'opening',
        ciAttempts: 0,
        fixedSha: null,
        reviewSeenAt: null,
        review: null,
        outbox: null,
        pending: {kind: 'open', sentAt: 1000, headSha: 'abc'},
        stop: null,
        createdAt: 1000,
      });
    });

    it('Should replace a record another branch left at the same path', async () => {
      get.mockResolvedValue(
        record({branch: 'old', base: 'dev', pending: opening.pending}),
      );

      await service.openPullRequest(WT, 1000);

      expect(save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: 'u2',
          branch: 'feat-x',
          base: 'main',
          promptFile: null,
          model: null,
        }),
      );
    });

    it('Should not record anything when typing fails', async () => {
      sendText.mockRejectedValue(new Error('tmux falhou'));
      await expect(service.openPullRequest(WT, 1000)).rejects.toThrow(
        'tmux falhou',
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('Should propagate a default branch that cannot be found', async () => {
      get.mockResolvedValue(null);
      vcsDefault.mockResolvedValue(null);
      prDefault.mockRejectedValue(
        new Error('Não foi possível descobrir o branch padrão'),
      );
      await refused('Não foi possível descobrir o branch padrão');
    });

    it('Should stamp the current time by default', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1234);
      get.mockResolvedValue(null);
      await service.openPullRequest(WT);
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        createdAt: 1234,
        pending: {sentAt: 1234},
      });
    });
  });

  describe('tick', () => {
    const stopped = (stop: TaskStop, base: TaskRecord = opening) => ({
      ...base,
      phase: 'stopped',
      stop,
      pending: null,
    });
    const turnEnded = (at = 1500) =>
      forSession.mockResolvedValue(summary({lastTurnEndAt: at}));
    const prJson = (title: string, body = 'corpo') =>
      read.mockImplementation((_id: string, name: string) =>
        Promise.resolve(
          name === 'pr.json' ? JSON.stringify({title, body}) : null,
        ),
      );

    beforeEach(() => {
      holds(opening);
      turnEnded();
      prJson('feat: add x');
    });

    it('Should do nothing without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await service.tick(1500);
      expect(list).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should not list sessions with nothing pending or queued', async () => {
      list.mockResolvedValue([
        record(),
        record({
          worktreePath: OTHER_PATH,
          branch: 'feat-y',
          phase: 'ci',
          prNumber: 7,
        }),
      ]);
      await service.tick(1500);
      expect(mapped).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should wait while tmux cannot be listed', async () => {
      mapped.mockResolvedValue({tmux: 'error', message: 'x', items: []});
      await service.tick(1500);
      expect(save).not.toHaveBeenCalled();
    });

    it.each([
      ['whose worktree is gone', record({...opening, worktreePath: '/r/x'})],
      [
        'whose worktree moved to another branch',
        record({...opening, branch: 'old'}),
      ],
    ])('Should skip a record %s', async (_name, task) => {
      list.mockResolvedValue([task]);
      await service.tick(1500);
      expect(forSession).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should stop when the session is gone', async () => {
      sessionsAre([item(WT, 'ext', 9), item(OTHER, 'fly-y', 9, 's9')]);
      await service.tick(1500);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({
          kind: 'session',
          message: 'A sessão do worktree foi encerrada',
        }),
      );
      expect(status).not.toHaveBeenCalled();
    });

    it.each<[string, () => void]>([
      ['ended before the instruction', () => turnEnded(900)],
      ['ended when the instruction was sent', () => turnEnded(1000)],
      [
        'never ended',
        () => forSession.mockResolvedValue(summary({lastTurnEndAt: null})),
      ],
      ['has no transcript', () => forSession.mockResolvedValue(null)],
    ])('Should wait while the turn %s', async (_name, arrange) => {
      arrange();
      await service.tick(1500);
      expect(status).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should reject, saving nothing, when the transcript cannot be read', async () => {
      forSession.mockRejectedValue(new Error('EACCES'));
      await expect(service.tick(1500)).rejects.toThrow('EACCES');
      expect(save).not.toHaveBeenCalled();
    });

    it('Should settle a request with no send time on any ended turn', async () => {
      holds({...opening, pending: {kind: 'open', headSha: 'abc'}});
      turnEnded(1);
      await service.tick(1500);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({phase: 'ci', prNumber: 42}),
      );
    });

    it('Should read the newest fly session of the worktree', async () => {
      sessionsAre([item(WT, 'fly-old', 1, 's0'), item(WT, 'fly-new', 2, 's1')]);
      await service.tick(1500);
      expect(forSession).toHaveBeenCalledExactlyOnceWith({
        launchCwd: PATH,
        sessionId: 's1',
      });
    });

    it('Should stop on uncommitted changes, listing them', async () => {
      status.mockResolvedValue({'src/a.ts': 'M', 'b.md': 'A'});
      await service.tick(1500);
      expect(status).toHaveBeenCalledWith(PATH);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({
          kind: 'open',
          message: 'Ficaram mudanças sem commit: src/a.ts, b.md',
        }),
      );
      expect(aheadCount).not.toHaveBeenCalled();
    });

    it('Should stop when the branch has nothing ahead of its base', async () => {
      aheadCount.mockResolvedValue(0);
      await service.tick(1500);
      expect(aheadCount).toHaveBeenCalledWith(PATH, 'origin/main');
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({
          kind: 'open',
          message: 'Nada para abrir: o branch não tem commits à frente de main',
        }),
      );
      expect(read).not.toHaveBeenCalled();
    });

    it.each<[string, string | null]>([
      ['missing', null],
      ['not JSON', '{title'],
      ['without a body', '{"title": "feat: x"}'],
    ])('Should stop when pr.json is %s', async (_name, raw) => {
      read.mockResolvedValue(raw);
      await service.tick(1500);
      expect(read).toHaveBeenCalledWith('t1', 'pr.json');
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({
          kind: 'open',
          message: 'A sessão não escreveu o título e o corpo do PR',
        }),
      );
      expect(push).not.toHaveBeenCalled();
    });

    it.each(['Update stuff', `feat: ${'a'.repeat(67)}`])(
      'Should stop on the title %j',
      async title => {
        prJson(title);
        await service.tick(1500);
        expect(save).toHaveBeenCalledExactlyOnceWith(
          stopped({
            kind: 'open',
            message: `Título fora do padrão Conventional Commits: ${title}`,
          }),
        );
        expect(push).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['git push falhou: rejected', 'git push falhou: rejected'],
      [
        'git não respondeu em 60 s',
        'git push falhou: git não respondeu em 60 s',
      ],
    ])('Should stop when the push fails with %j', async (error, message) => {
      push.mockRejectedValue(new Error(error));
      await service.tick(1500);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({kind: 'open', message}),
      );
      expect(write).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['gh pr create falhou: no commits', 'gh pr create falhou: no commits'],
      [
        'gh não respondeu em 60 s',
        'gh pr create falhou: gh não respondeu em 60 s',
      ],
    ])(
      'Should stop when gh pr create fails with %j',
      async (error, message) => {
        create.mockRejectedValue(new Error(error));
        await service.tick(1500);
        expect(save).toHaveBeenCalledExactlyOnceWith(
          stopped({kind: 'open', message}),
        );
      },
    );

    it('Should push, write the body, create the PR and watch its CI', async () => {
      track('push', push, undefined);
      track('write', write, `${DIR}/pr-body.md`);
      track('create', create, {number: 42, url: 'u'});
      track('refresh', refreshPullRequests, undefined);
      track('save', save, undefined);
      prJson('feat(ui)!: add x', '## Description\n\nX');

      await service.tick(1500);

      expect(push).toHaveBeenCalledWith(PATH, 'feat-x');
      expect(write).toHaveBeenCalledWith(
        't1',
        'pr-body.md',
        '## Description\n\nX',
      );
      expect(create).toHaveBeenCalledWith({
        cwd: PATH,
        title: 'feat(ui)!: add x',
        bodyFile: `${DIR}/pr-body.md`,
        base: 'main',
        head: 'feat-x',
      });
      expect(save).toHaveBeenCalledExactlyOnceWith({
        ...opening,
        prNumber: 42,
        phase: 'ci',
        pending: null,
        reviewSeenAt: 1500,
      });
      expect(calls).toEqual(['push', 'write', 'create', 'refresh', 'save']);
    });

    it('Should save the watch even when the PR list refresh fails', async () => {
      refreshPullRequests.mockRejectedValue(new Error('gh'));
      prJson('feat(ui)!: add x', 'X');

      await service.tick(1500);

      expect(refreshPullRequests).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledExactlyOnceWith({
        ...opening,
        prNumber: 42,
        phase: 'ci',
        pending: null,
        reviewSeenAt: 1500,
      });
    });

    it('Should stamp the current time by default', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(2000);
      await service.tick();
      expect(save.mock.calls[0]?.[0]).toMatchObject({reviewSeenAt: 2000});
    });

    it.each<[string, () => void]>([
      [
        'git status',
        () => status.mockRejectedValue(new Error('git falhou: lock')),
      ],
      [
        'the ahead count',
        () => aheadCount.mockRejectedValue(new Error('git falhou: lock')),
      ],
      [
        'reading pr.json',
        () => read.mockRejectedValue(new Error('git falhou: lock')),
      ],
      [
        'writing pr-body.md',
        () => write.mockRejectedValue(new Error('git falhou: lock')),
      ],
      [
        'saving the PR number',
        () => save.mockRejectedValueOnce(new Error('git falhou: lock')),
      ],
    ])(
      'Should stop with the message when %s fails after the turn',
      async (_name, arrange) => {
        arrange();
        await service.tick(1500);
        expect(save).toHaveBeenLastCalledWith(
          stopped({kind: 'open', message: 'git falhou: lock'}),
        );
      },
    );

    it('Should stop when the ahead count throws on a missing base ref', async () => {
      aheadCount.mockRejectedValue(
        new Error("git falhou: fatal: bad revision 'origin/main..HEAD'"),
      );
      await service.tick(1500);
      expect(save).toHaveBeenCalledExactlyOnceWith(
        stopped({
          kind: 'open',
          message: "git falhou: fatal: bad revision 'origin/main..HEAD'",
        }),
      );
      expect(read).not.toHaveBeenCalled();
    });

    it('Should finish the other records before rejecting with the first failure', async () => {
      const other = {
        ...opening,
        id: 't2',
        worktreePath: OTHER_PATH,
        branch: 'feat-y',
      };
      holds(opening, other);
      sessionsAre([item(WT, 'fly-x', 1, 's1'), item(OTHER, 'fly-y', 1, 's2')]);
      forSession.mockImplementation(({sessionId}: {sessionId: string}) =>
        sessionId === 's1'
          ? Promise.reject(new Error('EACCES'))
          : Promise.resolve(summary({lastTurnEndAt: 1500})),
      );

      await expect(service.tick(1500)).rejects.toThrow('EACCES');

      expect(save).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({id: 't2', phase: 'ci', prNumber: 42}),
      );
    });

    it('Should not settle a request twice when ticks overlap', async () => {
      const first = service.tick(1500);
      await service.tick(1500);
      await first;
      expect(push).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('Should tick again after a tick that rejected', async () => {
      forSession.mockRejectedValueOnce(new Error('EACCES'));
      await expect(service.tick(1500)).rejects.toThrow('EACCES');
      await service.tick(1500);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('Should not bring back a record removed while the PR was created', async () => {
      create.mockImplementation(async () => {
        store.delete(PATH);
        return {number: 42, url: 'u'};
      });
      await service.tick(1500);
      expect(save).not.toHaveBeenCalled();
      expect(store.has(PATH)).toBe(false);
    });

    it('Should not undo a record changed while the PR was created', async () => {
      const resumed = record({phase: 'working'});
      create.mockImplementation(async () => {
        store.set(PATH, resumed);
        return {number: 42, url: 'u'};
      });
      await service.tick(1500);
      expect(save).not.toHaveBeenCalled();
      expect(store.get(PATH)).toEqual(resumed);
    });

    it('Should not stop a record removed before its stop is saved', async () => {
      aheadCount.mockImplementation(async () => {
        store.delete(PATH);
        return 0;
      });
      await service.tick(1500);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    const SEEN = 1_600_000_000_000;
    const RAW =
      'test\tRun pnpm test\t2026-10-20T12:00:00.0000000Z ##[error]falhou\n';
    const watching = record({prNumber: 42, phase: 'ci', reviewSeenAt: SEEN});
    const run = (over: Partial<CheckRun> = {}): CheckRun => ({
      name: 'test',
      state: 'failing',
      url: 'https://github.com/o/r/actions/runs/7/job/70',
      kind: 'run',
      conclusion: 'FAILURE',
      runId: '7',
      jobId: '70',
      ...over,
    });
    const context = (name: string): CheckRun => ({
      name,
      state: 'failing',
      url: 'https://ci.example/1',
      kind: 'status',
      conclusion: null,
      runId: null,
      jobId: null,
    });
    const prIs = (over: Partial<PullRequest> = {}) =>
      pullRequestFor.mockReturnValue(pull(over));
    const failing = (...checkRuns: CheckRun[]) =>
      prIs({checks: 'failing', checkRuns});
    const stopOf = (
      stop: TaskStop,
      base: TaskRecord = watching,
    ): TaskRecord => ({
      ...base,
      phase: 'stopped',
      stop,
      pending: null,
    });
    const comment = (over: Partial<ReviewComment>): ReviewComment => ({
      id: '1',
      author: 'ana',
      body: 'Renomeie.',
      path: null,
      line: null,
      url: 'https://github.com/o/r/pull/42#c1',
      createdAt: SEEN + 1,
      ...over,
    });

    beforeEach(() => {
      holds(watching);
      prIs();
      failedLog.mockResolvedValue(null);
      reviewComments.mockResolvedValue([]);
    });

    it('Should do nothing without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await service.poll(5000);
      expect(list).not.toHaveBeenCalled();
    });

    it.each([
      ['whose worktree is gone', record({...watching, worktreePath: '/r/x'})],
      [
        'whose worktree moved to another branch',
        record({...watching, branch: 'old'}),
      ],
    ])('Should skip a record %s', async (_name, task) => {
      holds(task);
      await service.poll(5000);
      expect(pullRequestFor).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should save nothing when nothing changed', async () => {
      await service.poll(5000);
      expect(pullRequestFor).toHaveBeenCalledWith(WT);
      expect(reviewComments).toHaveBeenCalledWith('/r/talon', 42);
      expect(get).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    describe('failing checks', () => {
      it('Should queue a fix with the excerpt of the failed job', async () => {
        failing(
          run(),
          run({name: 'lint', conclusion: 'CANCELLED', jobId: '71'}),
        );
        failedLog.mockResolvedValue(RAW);

        await service.poll(5000);

        expect(failedLog).toHaveBeenCalledExactlyOnceWith('/r/talon', '70');
        expect(write).toHaveBeenCalledExactlyOnceWith(
          't1',
          'ci-70-abc1234.log',
          logExcerpt(RAW),
        );
        expect(saved()).toEqual([
          {...watching, outbox: {kind: 'fix', text: FIX, headSha: SHA}},
        ]);
        expect(reviewComments).not.toHaveBeenCalled();
      });

      it('Should name every failed job with a log, skipping one without', async () => {
        failing(
          run({jobId: '70'}),
          run({name: 'build', jobId: '71'}),
          run({name: 'e2e', jobId: '72'}),
        );
        failedLog.mockImplementation(async (_repo: string, job: string) =>
          job === '71' ? null : RAW,
        );

        await service.poll(5000);

        expect(saved()[0]?.outbox?.text).toBe(
          `fly: a CI do PR #42 falhou (tentativa 1 de 3). Logs: ${DIR}/ci-70-abc1234.log, ${DIR}/ci-72-abc1234.log. Corrija, rode as verificações locais e commite (Conventional Commits, sem push).`,
        );
      });

      it('Should count the attempt the fix will be', async () => {
        holds({...watching, ciAttempts: 2, fixedSha: 'old'});
        failing(run());
        failedLog.mockResolvedValue(RAW);
        await service.poll(5000);
        expect(saved()[0]?.outbox?.text).toContain('(tentativa 3 de 3)');
      });

      it.each<[string, CheckRun[], string, string[]]>([
        [
          'only a cancelled run',
          [run({conclusion: 'CANCELLED'})],
          'test',
          ['7'],
        ],
        ['a failed run with no log', [run()], 'test', ['7']],
        [
          'only a failed status check',
          [context('ci/jenkins')],
          'ci/jenkins',
          [],
        ],
        [
          'a failed check of another app, with no job',
          [
            run({
              name: 'sonar',
              url: 'https://sonar/1',
              runId: null,
              jobId: null,
            }),
          ],
          'sonar',
          [],
        ],
        [
          'a status check whatever it reports',
          [{...context('ci/x'), conclusion: 'FAILURE', jobId: '9'}],
          'ci/x',
          [],
        ],
        [
          'several runs',
          [
            run({name: 'a', conclusion: 'TIMED_OUT'}),
            run({name: 'b', conclusion: 'STARTUP_FAILURE', jobId: '71'}),
            run({name: 'c', runId: '8', jobId: '80'}),
            run({
              name: 'ok',
              state: 'passing',
              conclusion: 'SUCCESS',
              runId: '9',
              jobId: '90',
            }),
            context('d'),
          ],
          'a, b, c, d',
          ['7', '8'],
        ],
      ])(
        'Should stop on infrastructure with %s',
        async (_name, checkRuns, names, runIds) => {
          failing(...checkRuns);
          await service.poll(5000);
          expect(saved()).toEqual([
            stopOf({
              kind: 'infra',
              message: `Falha de infraestrutura na CI: ${names}`,
              runIds,
            }),
          ]);
          expect(write).not.toHaveBeenCalled();
        },
      );

      it('Should not ask gh for the log of a run it cannot fix', async () => {
        failing(run({conclusion: 'CANCELLED'}), run({jobId: null}), {
          ...context('x'),
          conclusion: 'FAILURE',
          jobId: '9',
        });
        await service.poll(5000);
        expect(failedLog).not.toHaveBeenCalled();
      });

      it('Should stop after the third attempt', async () => {
        holds({...watching, ciAttempts: 3, fixedSha: 'old'});
        failing(run());
        failedLog.mockResolvedValue(RAW);

        await service.poll(5000);

        expect(saved()).toEqual([
          stopOf(
            {kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'},
            {...watching, ciAttempts: 3, fixedSha: 'old'},
          ),
        ]);
        expect(write).not.toHaveBeenCalled();
      });

      it.each<[string, Partial<PullRequest>, Partial<TaskRecord>]>([
        ['the head a fix was sent for', {}, {fixedSha: SHA}],
        ['a PR with no head', {headSha: null}, {fixedSha: 'old'}],
        [
          'a stop',
          {},
          {phase: 'stopped', stop: {kind: 'ci', message: 'parei'}},
        ],
      ])('Should not fix %s', async (_name, pr, over) => {
        holds({...watching, ...over});
        prIs({checks: 'failing', checkRuns: [run()], ...pr});
        failedLog.mockResolvedValue(RAW);
        await service.poll(5000);
        expect(failedLog).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it.each<[string, () => void]>([
        ['rejects', () => failedLog.mockRejectedValue(new Error('timeout'))],
        [
          'rejects for one of the jobs',
          () =>
            failedLog
              .mockResolvedValueOnce(RAW)
              .mockRejectedValueOnce(new Error('timeout')),
        ],
      ])(
        'Should retry on the next poll when the log fetch %s',
        async (_name, arrange) => {
          failing(run(), run({name: 'b', jobId: '71'}));
          arrange();

          await service.poll(5000);
          expect(write).not.toHaveBeenCalled();
          expect(save).not.toHaveBeenCalled();

          failedLog.mockReset().mockResolvedValue(RAW);
          await service.poll(5000);
          expect(saved()[0]?.outbox?.kind).toBe('fix');
        },
      );
    });

    describe('green checks', () => {
      it.each<TaskStop>([
        {kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'},
        {
          kind: 'infra',
          message: 'Falha de infraestrutura na CI: x',
          runIds: [],
        },
      ])('Should clear a $kind stop and the attempts', async stop => {
        holds(stopOf(stop, {...watching, ciAttempts: 3, fixedSha: 'old'}));
        prIs({checks: 'passing'});
        await service.poll(5000);
        expect(saved()).toEqual([watching]);
      });

      it('Should reset the attempts of a record without a stop', async () => {
        holds({...watching, ciAttempts: 2, fixedSha: 'old'});
        prIs({checks: 'passing'});
        await service.poll(5000);
        expect(saved()).toEqual([watching]);
      });

      it.each<TaskStop>([
        {kind: 'open', message: 'antes'},
        {kind: 'session', message: 'A sessão do worktree foi encerrada'},
        {kind: 'review', message: 'Ficaram mudanças sem commit: a.ts'},
      ])('Should keep a $kind stop', async stop => {
        holds(stopOf(stop));
        prIs({checks: 'passing'});
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(reviewComments).not.toHaveBeenCalled();
      });

      it('Should keep a CI stop while the checks still fail', async () => {
        holds(stopOf({kind: 'infra', message: 'x', runIds: ['7']}));
        prIs({checks: 'failing', checkRuns: [run()], mergeable: 'conflicting'});
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
      });
    });

    describe('conflict and behind', () => {
      const conflict = {
        kind: 'conflict',
        message: 'Conflito com main',
      } as const;
      const behind = {kind: 'behind', message: 'Branch atrás de main'} as const;

      it.each<[string, Partial<PullRequest>, TaskStop]>([
        ['a conflict', {mergeable: 'conflicting'}, conflict],
        ['a branch behind its base', {behind: true}, behind],
        [
          'a conflict over behind',
          {mergeable: 'conflicting', behind: true},
          conflict,
        ],
      ])('Should stop on %s, then clear it', async (_name, pr, stop) => {
        prIs({checks: 'failing', checkRuns: [run()], ...pr});
        failedLog.mockResolvedValue(RAW);

        await service.poll(5000);
        expect(saved()).toEqual([stopOf(stop)]);
        expect(failedLog).not.toHaveBeenCalled();
        expect(reviewComments).not.toHaveBeenCalled();

        prIs();
        await service.poll(5000);
        expect(saved()[1]).toEqual(watching);
      });

      it.each<[string, TaskStop, Partial<PullRequest>, TaskStop]>([
        [
          'behind with a conflict',
          behind,
          {mergeable: 'conflicting'},
          conflict,
        ],
        ['a conflict with behind', conflict, {behind: true}, behind],
        [
          'a CI stop gone green with behind',
          {kind: 'ci', message: 'x'},
          {checks: 'passing', behind: true},
          behind,
        ],
      ])('Should replace %s', async (_name, from, pr, to) => {
        holds(stopOf(from));
        prIs(pr);
        await service.poll(5000);
        expect(saved()).toEqual([stopOf(to)]);
      });

      it('Should name the record base', async () => {
        holds({...watching, base: 'dev'});
        prIs({mergeable: 'conflicting'});
        await service.poll(5000);
        expect(saved()[0]?.stop?.message).toBe('Conflito com dev');
      });
    });

    describe('adoption and closed PRs', () => {
      const unwatched = record({reviewSeenAt: null});

      it.each<[string, Partial<TaskRecord>]>([
        ['a working record', {}],
        [
          'a stopped open',
          {phase: 'stopped', stop: {kind: 'open', message: 'falhou'}},
        ],
        [
          'a dead session',
          {
            phase: 'stopped',
            stop: {
              kind: 'session',
              message: 'A sessão do worktree foi encerrada',
            },
          },
        ],
      ])('Should adopt the open PR of %s', async (_name, over) => {
        holds({...unwatched, ...over});
        await service.poll(5000);
        expect(saved()).toEqual([
          {
            ...unwatched,
            prNumber: 42,
            phase: 'ci',
            reviewSeenAt: 5000,
            stop: null,
            pending: null,
          },
        ]);
      });

      it('Should watch the CI of a PR it adopts', async () => {
        holds(unwatched);
        failing(run());
        failedLog.mockResolvedValue(RAW);
        await service.poll(5000);
        expect(saved()[0]).toMatchObject({prNumber: 42, outbox: {kind: 'fix'}});
      });

      it.each<[string, TaskRecord, PullRequest | null]>([
        ['without an open PR', unwatched, pull({state: 'merged'})],
        ['without any PR', unwatched, null],
        ['while its open request is pending', opening, pull()],
        [
          'stopped by the CI loop',
          {...unwatched, phase: 'stopped', stop: {kind: 'ci', message: 'x'}},
          pull(),
        ],
      ])('Should not adopt a record %s', async (_name, task, pr) => {
        holds(task);
        pullRequestFor.mockReturnValue(pr);
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(reviewComments).not.toHaveBeenCalled();
      });

      it('Should bring "Abrir PR" back when the PR closed unmerged', async () => {
        holds({
          ...stopOf({kind: 'ci', message: 'x'}),
          ciAttempts: 2,
          fixedSha: 'old',
          review: {count: 1, state: 'done'},
          outbox: {kind: 'review', text: 'r', headSha: SHA},
        });
        prIs({state: 'closed'});
        await service.poll(5000);
        expect(saved()).toEqual([
          {...watching, phase: 'working', prNumber: null},
        ]);
      });

      it.each<[string, Partial<TaskRecord>, PullRequest['state']]>([
        [
          'a closed PR while an action is pending',
          {phase: 'fixing', pending: {kind: 'fix', sentAt: 1, headSha: 'abc'}},
          'closed',
        ],
        ['a merged PR', {}, 'merged'],
      ])('Should leave alone %s', async (_name, over, state) => {
        holds({...watching, ...over});
        prIs({state, checks: 'failing', checkRuns: [run()]});
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(failedLog).not.toHaveBeenCalled();
      });

      it('Should leave a record whose PR is not listed', async () => {
        pullRequestFor.mockReturnValue(null);
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
      });

      it('Should stamp the current time by default', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(2000);
        holds(unwatched);
        await service.poll();
        expect(saved()[0]?.reviewSeenAt).toBe(2000);
      });
    });

    describe('mergeability not known yet', () => {
      it.each<TaskStop>([
        {kind: 'conflict', message: 'Conflito com main'},
        {kind: 'behind', message: 'Branch atrás de main'},
      ])('Should keep a $kind stop', async stop => {
        holds(stopOf(stop));
        prIs({mergeable: 'unknown', checks: 'failing', checkRuns: [run()]});
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(failedLog).not.toHaveBeenCalled();
      });

      it('Should queue nothing and set no stop', async () => {
        prIs({
          mergeable: 'unknown',
          behind: true,
          checks: 'failing',
          checkRuns: [run()],
        });
        reviewComments.mockResolvedValue([comment({})]);
        await service.poll(5000);
        expect(failedLog).not.toHaveBeenCalled();
        expect(reviewComments).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('Should still adopt the PR', async () => {
        holds(record({reviewSeenAt: null}));
        prIs({mergeable: 'unknown'});
        await service.poll(5000);
        expect(saved()).toEqual([
          record({prNumber: 42, phase: 'ci', reviewSeenAt: 5000}),
        ]);
      });
    });

    it('Should wait for every check of the head before fixing', async () => {
      failedLog.mockResolvedValue(RAW);
      reviewComments.mockResolvedValue([comment({})]);
      failing(run(), run({name: 'e2e', state: 'pending', jobId: '71'}));

      await service.poll(5000);
      expect(failedLog).not.toHaveBeenCalled();
      expect(reviewComments).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();

      failing(run(), run({name: 'e2e', jobId: '71'}));
      await service.poll(5000);
      expect(failedLog.mock.calls).toEqual([
        ['/r/talon', '70'],
        ['/r/talon', '71'],
      ]);
      expect(saved()).toHaveLength(1);
      expect(saved()[0]?.outbox?.text).toContain(
        `Logs: ${DIR}/ci-70-abc1234.log, ${DIR}/ci-71-abc1234.log.`,
      );
    });

    describe('a newer PR on the branch', () => {
      it.each<[string, Partial<TaskRecord>]>([
        ['watching', {}],
        [
          'stopped',
          {
            phase: 'stopped',
            stop: {kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'},
          },
        ],
        [
          'with a queued action',
          {outbox: {kind: 'fix', text: FIX, headSha: SHA}},
        ],
      ])('Should adopt it over the record %s', async (_name, over) => {
        holds({
          ...watching,
          ciAttempts: 3,
          fixedSha: 'old',
          review: {count: 1, state: 'done'},
          ...over,
        });
        prIs({number: 50});

        await service.poll(5000);

        expect(saved()).toEqual([
          {...watching, prNumber: 50, reviewSeenAt: 5000},
        ]);
      });

      it('Should wait for an action pending on the old one', async () => {
        holds({
          ...watching,
          phase: 'fixing',
          pending: {kind: 'fix', sentAt: 1, headSha: 'abc'},
        });
        prIs({number: 50});
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
      });
    });

    it('Should keep the stop of a record with no PR when the branch PR is closed', async () => {
      holds(
        record({phase: 'stopped', stop: {kind: 'open', message: 'falhou'}}),
      );
      prIs({state: 'closed'});
      await service.poll(5000);
      expect(save).not.toHaveBeenCalled();
    });

    it.each<[string, Partial<TaskRecord>]>([
      [
        'an action is pending',
        {phase: 'fixing', pending: {kind: 'fix', sentAt: 1, headSha: 'abc'}},
      ],
      ['an action is queued', {outbox: {kind: 'fix', text: FIX, headSha: SHA}}],
    ])('Should not read gh while %s', async (_name, over) => {
      holds({...watching, ...over});
      prIs({checks: 'failing', checkRuns: [run()], mergeable: 'conflicting'});
      await service.poll(5000);
      expect(failedLog).not.toHaveBeenCalled();
      expect(reviewComments).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    describe('review comments', () => {
      it('Should queue the new comments with text in a file', async () => {
        const ana = comment({
          path: 'src/a.ts',
          line: 3,
          createdAt: 1_700_000_000_000,
        });
        reviewComments.mockResolvedValue([
          comment({body: '  \n', createdAt: SEEN + 5}),
          comment({author: 'old', createdAt: SEEN - 1}),
          comment({author: 'seen', createdAt: SEEN}),
          ana,
        ]);

        await service.poll(5000);

        expect(write).toHaveBeenCalledExactlyOnceWith(
          't1',
          'review-42-1700000000000.md',
          reviewFile([ana]),
        );
        expect(reviewFile([ana])).toContain('### ana — src/a.ts:3');
        expect(saved()).toEqual([
          {
            ...watching,
            outbox: {kind: 'review', text: REVIEW, headSha: SHA},
            reviewSeenAt: 1_700_000_000_000,
            review: {count: 1, state: 'queued'},
          },
        ]);
      });

      it('Should count every new comment and name the file by the newest', async () => {
        const first = comment({id: 'a', createdAt: 1_700_000_000_000});
        const second = comment({id: 'b', createdAt: SEEN + 2});
        reviewComments.mockResolvedValue([first, second]);

        await service.poll(5000);

        expect(write).toHaveBeenCalledWith(
          't1',
          'review-42-1700000000000.md',
          reviewFile([first, second]),
        );
        expect(saved()[0]).toMatchObject({
          reviewSeenAt: 1_700_000_000_000,
          review: {count: 2, state: 'queued'},
        });
      });

      it('Should start counting from now when nothing was seen yet', async () => {
        holds({...watching, reviewSeenAt: null});
        await service.poll(5000);
        expect(reviewComments).not.toHaveBeenCalled();
        expect(saved()).toEqual([{...watching, reviewSeenAt: 5000}]);
      });

      it('Should keep the rest of the poll and retry when the comments cannot be read', async () => {
        holds({...watching, ciAttempts: 2, fixedSha: 'old'});
        prIs({checks: 'passing'});
        reviewComments.mockRejectedValueOnce(new Error('gh não respondeu'));

        await service.poll(5000);
        expect(saved()).toEqual([watching]);

        reviewComments.mockResolvedValue([comment({})]);
        await service.poll(5000);
        expect(saved()[1]?.outbox?.kind).toBe('review');
      });
    });

    describe('concurrent changes', () => {
      it('Should not bring back a record removed during the poll', async () => {
        failing(run());
        failedLog.mockImplementation(async () => {
          store.delete(PATH);
          return RAW;
        });
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(store.has(PATH)).toBe(false);
      });

      it('Should not overwrite a record changed during the poll', async () => {
        const resumed = {
          ...watching,
          review: {count: 1, state: 'done' as const},
        };
        failing(run());
        failedLog.mockImplementation(async () => {
          store.set(PATH, resumed);
          return RAW;
        });
        await service.poll(5000);
        expect(save).not.toHaveBeenCalled();
        expect(store.get(PATH)).toEqual(resumed);
      });
    });

    it('Should finish the other records before rejecting with the first failure', async () => {
      const other = {
        ...watching,
        id: 't2',
        worktreePath: OTHER_PATH,
        branch: 'feat-y',
      };
      holds(watching, other);
      reviewComments.mockResolvedValue([comment({})]);
      write.mockImplementation(async (id: string) => {
        if (id === 't1') throw new Error('ENOSPC');
        return 'f';
      });
      pullRequestFor.mockImplementation((id: string) =>
        id === WT ? pull() : pull({mergeable: 'conflicting'}),
      );

      await expect(service.poll(5000)).rejects.toThrow('ENOSPC');

      expect(saved()).toEqual([
        stopOf({kind: 'conflict', message: 'Conflito com main'}, other),
      ]);
    });
  });

  describe('tick with a queued fix or review', () => {
    const fixing = record({
      prNumber: 42,
      phase: 'ci',
      reviewSeenAt: 1000,
      ciAttempts: 1,
      outbox: {kind: 'fix', text: FIX, headSha: SHA},
    });
    const reviewing = record({
      prNumber: 42,
      phase: 'ci',
      reviewSeenAt: 1000,
      fixedSha: 'old',
      review: {count: 2, state: 'queued'},
      outbox: {kind: 'review', text: REVIEW, headSha: SHA},
    });

    beforeEach(() => {
      holds(fixing);
      headSha.mockResolvedValue('local1');
    });

    it.each<[string, () => void]>([
      [
        'mid-turn',
        () => forSession.mockResolvedValue(summary({phase: 'mid-turn'})),
      ],
      [
        'asking a question',
        () => forSession.mockResolvedValue(summary({asking: true})),
      ],
      [
        'running a background agent',
        () => forSession.mockResolvedValue(summary({backgroundAgents: 1})),
      ],
      ['holding a draft', () => hasDraft.mockReturnValue(true)],
      ['gone', () => sessionsAre([item(WT, 'ext', 9)])],
    ])(
      'Should keep the outbox while the session is %s',
      async (_n, arrange) => {
        arrange();
        await service.tick(1500);
        expect(sendText).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(store.get(PATH)).toEqual(fixing);
      },
    );

    it('Should type the fix once into the idle session', async () => {
      track('headSha', headSha, 'local1');
      track('forSession', forSession, summary());
      hasDraft.mockImplementation(() => {
        calls.push('hasDraft');
        return false;
      });
      track('sendText', sendText, undefined);

      await service.tick(1500);
      await service.tick(1600);

      expect(hasDraft).toHaveBeenCalledWith('fly-feat');
      expect(headSha).toHaveBeenCalledWith(PATH);
      expect(sendText).toHaveBeenCalledExactlyOnceWith('fly-feat', FIX);
      expect(saved()).toEqual([
        {
          ...fixing,
          outbox: null,
          pending: {kind: 'fix', sentAt: 1500, headSha: 'local1'},
          phase: 'fixing',
          ciAttempts: 2,
          fixedSha: SHA,
        },
      ]);
      // The second tick reads the transcript to wait for the turn.
      expect(calls).toEqual([
        'headSha',
        'forSession',
        'hasDraft',
        'sendText',
        'forSession',
      ]);
    });

    it.each<[string, () => void]>([
      [
        'the head',
        () =>
          headSha.mockImplementation(async () => {
            hasDraft.mockReturnValue(true);
            return 'local1';
          }),
      ],
      [
        'the record',
        () =>
          get.mockImplementation(async (path: string) => {
            hasDraft.mockReturnValue(true);
            return structuredClone(store.get(path) ?? null);
          }),
      ],
      [
        'the transcript',
        () =>
          forSession.mockImplementation(async () => {
            hasDraft.mockReturnValue(true);
            return summary();
          }),
      ],
    ])(
      'Should not type over a draft started while %s was read',
      async (_name, arrange) => {
        arrange();
        await service.tick(1500);
        expect(sendText).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      },
    );

    it('Should time the fix after a turn that ended late, so it is not taken for its own', async () => {
      forSession.mockResolvedValue(summary({lastTurnEndAt: 2000}));
      await service.tick(1500);
      expect(saved()[0]?.pending?.sentAt).toBe(2000);

      await service.tick(2500);
      expect(status).not.toHaveBeenCalled();
      expect(saved()).toHaveLength(1);
    });

    it('Should time the fix now for a promptless session with no transcript', async () => {
      forSession.mockResolvedValue(null);
      await service.tick(20_000);
      expect(saved()[0]?.pending?.sentAt).toBe(20_000);
    });

    it('Should type the review into the idle session', async () => {
      holds(reviewing);
      await service.tick(1500);
      expect(sendText).toHaveBeenCalledExactlyOnceWith('fly-feat', REVIEW);
      expect(saved()).toEqual([
        {
          ...reviewing,
          outbox: null,
          pending: {kind: 'review', sentAt: 1500, headSha: 'local1'},
          phase: 'reviewing',
          review: {count: 2, state: 'sent'},
        },
      ]);
    });

    it('Should leave records with nothing owed alone', async () => {
      holds(record({worktreePath: OTHER_PATH, branch: 'feat-y'}), fixing);
      sessionsAre([
        item(WT, 'fly-feat', 5, 's1'),
        item(OTHER, 'fly-y', 5, 's2'),
      ]);
      await service.tick(1500);
      expect(sendText).toHaveBeenCalledExactlyOnceWith('fly-feat', FIX);
      expect(saved()).toHaveLength(1);
    });

    it('Should not type for a record changed before typing', async () => {
      headSha.mockImplementation(async () => {
        store.set(PATH, {...fixing, outbox: null});
        return 'local1';
      });
      await service.tick(1500);
      expect(sendText).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should not bring back a record removed while typing', async () => {
      sendText.mockImplementation(async () => void store.delete(PATH));
      await service.tick(1500);
      expect(save).not.toHaveBeenCalled();
      expect(store.has(PATH)).toBe(false);
    });

    it('Should keep the outbox and free the worktree when typing fails', async () => {
      sendText.mockRejectedValueOnce(new Error('tmux falhou'));
      await expect(service.tick(1500)).rejects.toThrow('tmux falhou');
      expect(save).not.toHaveBeenCalled();

      await service.tick(1500);
      expect(sendText).toHaveBeenCalledTimes(2);
      expect(saved()).toHaveLength(1);
    });

    it('Should not type while "Abrir PR" holds the worktree', async () => {
      let release: () => void = () => undefined;
      sendText.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          }),
      );
      get.mockResolvedValueOnce(null);
      const opened = service.openPullRequest(WT, 1000);
      await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));

      await service.tick(1500);
      expect(sendText).toHaveBeenCalledTimes(1);

      release();
      await opened;
    });

    it('Should refuse "Abrir PR" while the fix is being typed', async () => {
      let release: () => void = () => undefined;
      sendText.mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          }),
      );
      const ticked = service.tick(1500);
      await vi.waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));

      await expect(service.openPullRequest(WT, 1500)).rejects.toThrow(
        'A sessão está ocupada; aguarde o turno terminar',
      );
      await expect(service.resume(WT)).rejects.toThrow(
        'A sessão está ocupada; aguarde o turno terminar',
      );

      release();
      await ticked;
      expect(saved()).toHaveLength(1);
    });

    describe('after the turn', () => {
      const sent = (base: TaskRecord, kind: 'fix' | 'review') => ({
        ...base,
        outbox: null,
        phase: kind === 'fix' ? ('fixing' as const) : ('reviewing' as const),
        pending: {kind, sentAt: 1000, headSha: 'local1'},
        review:
          kind === 'review' ? {count: 2, state: 'sent' as const} : base.review,
      });
      const fixSent = sent(fixing, 'fix');
      const reviewSent = sent(reviewing, 'review');

      beforeEach(() => {
        holds(fixSent);
        forSession.mockResolvedValue(summary({lastTurnEndAt: 1500}));
        headSha.mockResolvedValue('local2');
      });

      it('Should wait while the turn has not ended', async () => {
        forSession.mockResolvedValue(summary({lastTurnEndAt: 1000}));
        await service.tick(1600);
        expect(status).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      });

      it('Should stop when the session is gone', async () => {
        sessionsAre([]);
        await service.tick(1600);
        expect(saved()).toEqual([
          {
            ...fixSent,
            phase: 'stopped',
            stop: {
              kind: 'session',
              message: 'A sessão do worktree foi encerrada',
            },
            pending: null,
          },
        ]);
      });

      it.each<[string, TaskRecord, TaskRecord['review']]>([
        ['fix', fixSent, null],
        ['review', reviewSent, {count: 2, state: 'done'}],
      ])(
        'Should push the commits of a %s and watch the CI again',
        async (_kind, task, review) => {
          holds(task);
          track('status', status, {});
          track('headSha', headSha, 'local2');
          track('push', push, undefined);

          await service.tick(1600);

          expect(push).toHaveBeenCalledWith(PATH, 'feat-x');
          expect(calls).toEqual(['status', 'headSha', 'push']);
          expect(saved()).toEqual([
            {...task, phase: 'ci', pending: null, review},
          ]);
        },
      );

      it('Should stop when the fix turn made no commit', async () => {
        headSha.mockResolvedValue('local1');
        await service.tick(1600);
        expect(push).not.toHaveBeenCalled();
        expect(saved()).toEqual([
          {
            ...fixSent,
            phase: 'stopped',
            stop: {kind: 'ci', message: 'A sessão não commitou uma correção'},
            pending: null,
          },
        ]);
      });

      it('Should mark a review done when its turn made no commit', async () => {
        holds(reviewSent);
        headSha.mockResolvedValue('local1');
        await service.tick(1600);
        expect(push).not.toHaveBeenCalled();
        expect(saved()).toEqual([
          {
            ...reviewSent,
            phase: 'ci',
            pending: null,
            review: {count: 2, state: 'done'},
          },
        ]);
      });

      it('Should keep a missing review count missing', async () => {
        holds({...reviewSent, review: null});
        await service.tick(1600);
        expect(saved()[0]?.review).toBeNull();
      });

      it.each<[string, TaskRecord, TaskStop['kind']]>([
        ['fix', fixSent, 'ci'],
        ['review', reviewSent, 'review'],
      ])(
        'Should stop a %s that left changes uncommitted',
        async (_kind, task, kind) => {
          holds(task);
          status.mockResolvedValue({'src/a.ts': 'M', 'b.md': '?'});
          await service.tick(1600);
          expect(push).not.toHaveBeenCalled();
          expect(saved()).toEqual([
            {
              ...task,
              phase: 'stopped',
              stop: {
                kind,
                message: 'Ficaram mudanças sem commit: src/a.ts, b.md',
              },
              pending: null,
            },
          ]);
        },
      );

      it.each<[string, () => void, string]>([
        [
          'the push fails',
          () => push.mockRejectedValue(new Error('rejected')),
          'git push falhou: rejected',
        ],
        [
          'the head cannot be read',
          () => headSha.mockRejectedValue(new Error('git falhou: lock')),
          'git falhou: lock',
        ],
      ])('Should stop when %s', async (_name, arrange, message) => {
        arrange();
        await service.tick(1600);
        expect(saved()[0]?.stop).toEqual({kind: 'ci', message});
      });

      it('Should not undo a record changed during the push', async () => {
        const resumed = {...fixSent, phase: 'ci' as const, pending: null};
        push.mockImplementation(async () => void store.set(PATH, resumed));
        await service.tick(1600);
        expect(save).not.toHaveBeenCalled();
        expect(store.get(PATH)).toEqual(resumed);
      });
    });
  });

  describe('rerun', () => {
    const infra = record({
      prNumber: 42,
      phase: 'stopped',
      reviewSeenAt: 1000,
      stop: {
        kind: 'infra',
        message: 'Falha de infraestrutura na CI: a, b',
        runIds: ['7', '8'],
      },
    });

    beforeEach(() => {
      holds(infra);
      rerun.mockResolvedValue(undefined);
    });

    it('Should rerun every run of the infrastructure stop, then watch again', async () => {
      await service.rerun(WT);
      expect(rerun.mock.calls).toEqual([
        ['/r/talon', '7'],
        ['/r/talon', '8'],
      ]);
      expect(saved()).toEqual([{...infra, phase: 'ci', stop: null}]);
    });

    it.each<[string, TaskRecord | null]>([
      ['no record', null],
      ['no stop', record({prNumber: 42, phase: 'ci'})],
      [
        'a CI stop',
        {
          ...infra,
          stop: {kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'},
        },
      ],
      [
        'an infrastructure stop with no run',
        {...infra, stop: {kind: 'infra', message: 'x', runIds: []}},
      ],
      [
        'an infrastructure stop without run ids',
        {...infra, stop: {kind: 'infra', message: 'x'}},
      ],
      ['a record of another branch', {...infra, branch: 'old'}],
    ])('Should refuse with %s', async (_name, task) => {
      holds(...(task ? [task] : []));
      await expect(service.rerun(WT)).rejects.toThrow(
        'Nada para rodar de novo',
      );
      expect(rerun).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it.each<[string, () => void]>([
      ['removed', () => store.delete(PATH)],
      [
        'changed',
        () => store.set(PATH, {...infra, phase: 'working', stop: null}),
      ],
    ])(
      'Should not save over a record %s while the runs restarted',
      async (_name, change) => {
        rerun.mockImplementation(async () => change());
        await service.rerun(WT);
        expect(rerun).toHaveBeenCalledTimes(2);
        expect(save).not.toHaveBeenCalled();
      },
    );

    it('Should keep the stop when gh cannot rerun', async () => {
      rerun.mockRejectedValue(new Error('gh não respondeu em 30 s'));
      await expect(service.rerun(WT)).rejects.toThrow(
        'gh não respondeu em 30 s',
      );
      expect(save).not.toHaveBeenCalled();
    });

    it('Should refuse an unknown worktree', async () => {
      await expect(service.rerun('nope')).rejects.toThrow(
        'Worktree não encontrado',
      );
    });
  });

  describe('resume', () => {
    const stuck = record({
      prNumber: 42,
      phase: 'stopped',
      reviewSeenAt: 1000,
      ciAttempts: 3,
      fixedSha: SHA,
      review: {count: 1, state: 'sent'},
      pending: {kind: 'review', sentAt: 1, headSha: 'abc'},
      stop: {kind: 'ci', message: 'CI falhou 3 vezes; parei de corrigir'},
    });
    const resumed = {
      ...stuck,
      stop: null,
      pending: null,
      ciAttempts: 0,
      fixedSha: null,
      review: {count: 1, state: 'done' as const},
    };

    beforeEach(() => holds(stuck));

    it('Should go back to watching the open PR', async () => {
      pullRequestFor.mockReturnValue(pull());
      await service.resume(WT);
      expect(pullRequestFor).toHaveBeenCalledWith(WT);
      expect(saved()).toEqual([{...resumed, phase: 'ci'}]);
    });

    it.each<[string, PullRequest | null]>([
      ['no PR', null],
      ['a merged PR', pull({state: 'merged'})],
    ])('Should go back to work with %s', async (_name, pr) => {
      pullRequestFor.mockReturnValue(pr);
      await service.resume(WT);
      expect(saved()).toEqual([{...resumed, phase: 'working'}]);
    });

    it.each<[TaskRecord['review']]>([[null], [{count: 2, state: 'queued'}]])(
      'Should keep the review %j as it is',
      async review => {
        holds({...stuck, review});
        await service.resume(WT);
        expect(saved()[0]?.review).toEqual(review);
      },
    );

    it.each<[string, TaskRecord | null]>([
      ['no record', null],
      ['a record of another branch', {...stuck, branch: 'old'}],
    ])('Should do nothing with %s', async (_name, task) => {
      holds(...(task ? [task] : []));
      await service.resume(WT);
      expect(save).not.toHaveBeenCalled();
    });

    it('Should refuse an unknown worktree', async () => {
      await expect(service.resume('nope')).rejects.toThrow(
        'Worktree não encontrado',
      );
    });
  });
  describe('merge', () => {
    it('Should merge the PR and then clean up the worktree', async () => {
      const order: string[] = [];
      mergePullRequest.mockImplementation(async () => void order.push('merge'));
      clean.mockImplementation(async () => void order.push('clean'));

      await service.merge(WT);

      expect(order).toEqual(['merge', 'clean']);
      expect(mergePullRequest).toHaveBeenCalledExactlyOnceWith(WT);
      expect(clean).toHaveBeenCalledExactlyOnceWith(WT, {confirmed: true});
    });

    it('Should not clean up when the merge is rejected', async () => {
      mergePullRequest.mockRejectedValue(new Error('conflito'));

      await expect(service.merge(WT)).rejects.toThrow('conflito');
      expect(clean).not.toHaveBeenCalled();
    });

    it('Should reject with the cleanup failure after a successful merge', async () => {
      mergePullRequest.mockResolvedValue(undefined);
      clean.mockRejectedValue(new Error('Falha ao limpar: sujo'));

      await expect(service.merge(WT)).rejects.toThrow('Falha ao limpar: sujo');
    });
  });

  describe('clean', () => {
    it.each([true, false])(
      'Should hand the worktree and confirmed=%s to the cleanup',
      async confirmed => {
        clean.mockResolvedValue(undefined);

        await service.clean(WT, confirmed);

        expect(clean).toHaveBeenCalledExactlyOnceWith(WT, {confirmed});
      },
    );

    it('Should propagate a cleanup refusal', async () => {
      clean.mockRejectedValue(new Error('Worktree não encontrado'));

      await expect(service.clean(WT, true)).rejects.toThrow(
        'Worktree não encontrado',
      );
    });
  });
  describe('merge and clean hold the worktree', () => {
    const BUSY = 'A sessão está ocupada; aguarde o turno terminar';
    const gateway = () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      return {gate, release};
    };

    it.each<[string, () => Promise<void>]>([
      ['merge', () => service.merge(WT)],
      ['clean', () => service.clean(WT, true)],
    ])('Should refuse %s while a request is being typed', async (_n, act) => {
      const {gate, release} = gateway();
      sendText.mockImplementationOnce(() => gate);
      const opening = service.openPullRequest(WT, 1000);

      await expect(act()).rejects.toThrow(BUSY);
      expect(mergePullRequest).not.toHaveBeenCalled();
      expect(clean).not.toHaveBeenCalled();
      release();
      await opening;
    });

    it.each<[string, () => Promise<void>, ReturnType<typeof vi.fn>]>([
      ['merge', () => service.merge(WT), mergePullRequest],
      ['clean', () => service.clean(WT, true), clean],
    ])(
      'Should keep a request out while %s runs, and free the worktree after',
      async (_n, act, step) => {
        const {gate, release} = gateway();
        step.mockImplementation(() => gate);
        clean.mockImplementation(() => gate);
        const running = act();

        await expect(service.openPullRequest(WT, 1000)).rejects.toThrow(BUSY);
        release();
        await running;
        await service.openPullRequest(WT, 1000);
        expect(sendText).toHaveBeenCalledTimes(1);
      },
    );

    it('Should free the worktree after a rejected merge', async () => {
      mergePullRequest.mockRejectedValue(new Error('conflito'));
      await expect(service.merge(WT)).rejects.toThrow('conflito');

      await service.openPullRequest(WT, 1000);
      expect(sendText).toHaveBeenCalledTimes(1);
    });

    it.each<[string, () => Promise<void>]>([
      ['merge', () => service.merge('nope')],
      ['clean', () => service.clean('nope', true)],
      ['merge of the main worktree', () => service.merge('talon')],
    ])('Should refuse %s without a branch worktree', async (_n, act) => {
      await expect(act()).rejects.toThrow('Worktree não encontrado');
      expect(mergePullRequest).not.toHaveBeenCalled();
      expect(clean).not.toHaveBeenCalled();
    });
  });
});
