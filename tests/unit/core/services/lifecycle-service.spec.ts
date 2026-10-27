import {PR_TEMPLATE} from '../../../../src/core/domain/pr-template';
import {PullRequest} from '../../../../src/core/domain/queue';
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
import {LifecycleService} from '../../../../src/core/services/lifecycle-service';
import {QueueService} from '../../../../src/core/services/queue-service';
import {
  MappedSessions,
  SessionService,
} from '../../../../src/core/services/session-service';
import {prRequest} from '../../../../src/core/services/task-rules';
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
  worktreePath: null,
  receipt: null,
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
  const prs = {defaultBranch: prDefault, create} as unknown as PrGateway;
  const pullRequestFor = vi.fn();
  const queue = {pullRequestFor} as unknown as QueueService;
  const get = vi.fn();
  const list = vi.fn();
  const save = vi.fn();
  const tasks = {get, list, save} as unknown as TaskStore;
  const dir = vi.fn();
  const write = vi.fn();
  const read = vi.fn();
  const taskFiles = {dir, write, read} as unknown as TaskFiles;
  const uuid = vi.fn();
  const ids = {uuid} as unknown as IdGenerator;
  let service: LifecycleService;

  const sessionsAre = (items: MappedSessions['items']) =>
    mapped.mockResolvedValue({tmux: 'ok', message: null, items});
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
      list.mockResolvedValue([save.mock.calls[0]?.[0]]);
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
      list.mockResolvedValue([opening]);
      turnEnded();
      prJson('feat: add x');
    });

    it('Should do nothing without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await service.tick(1500);
      expect(list).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should not list sessions without a pending open', async () => {
      list.mockResolvedValue([
        record(),
        record({
          worktreePath: OTHER_PATH,
          branch: 'feat-y',
          phase: 'fixing',
          pending: {kind: 'fix', sentAt: 1000, headSha: 'abc'},
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
      list.mockResolvedValue([
        {...opening, pending: {kind: 'open', headSha: 'abc'}},
      ]);
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
      expect(calls).toEqual(['push', 'write', 'create', 'save']);
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
      list.mockResolvedValue([opening, other]);
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
  });
});
