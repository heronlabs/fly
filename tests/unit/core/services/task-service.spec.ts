import {NewTaskInput} from '../../../../src/core/domain/task';
import {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {Workspace} from '../../../../src/core/domain/workspace';
import {FileStore} from '../../../../src/core/interfaces/file-store';
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
import {SessionService} from '../../../../src/core/services/session-service';
import {TaskService} from '../../../../src/core/services/task-service';

const wt = (path: string, isMain = false) => ({
  id: path.slice(1),
  repoId: 'talon',
  path,
  branch: null,
  head: 'h',
  isMain,
});
const mainPath = '/r/talon';
const workspace: Workspace = {
  root: '/r',
  repos: [{id: 'talon', name: 'talon', group: '', path: mainPath}],
  worktrees: [wt(mainPath, true), wt('/r/talon/.worktrees/old')],
};
const withNew = (...paths: string[]): Workspace => ({
  ...workspace,
  worktrees: [...workspace.worktrees, ...paths.map(p => wt(p))],
});
const baseline = JSON.stringify([mainPath, '/r/talon/.worktrees/old']);
const summary = (worktreePath: string | null): TranscriptSummary => ({
  phase: 'mid-turn',
  asking: false,
  openTools: 0,
  lastEventAt: null,
  wakeupAt: null,
  looping: false,
  lastTurnEndAt: null,
  backgroundAgents: 0,
  backgroundShells: [],
  launchCwd: mainPath,
  worktreePath,
  receipt: null,
});
const pending = (
  name: string,
  createdAt: number,
  over: MultiplexerSession['options'] = {},
): MultiplexerSession => ({
  name,
  cwd: mainPath,
  createdAt,
  attachedClients: 0,
  options: {
    '@fly_task_repo': mainPath,
    '@fly_task_baseline': baseline,
    ...over,
  },
});

describe('TaskService', () => {
  const list = vi.fn();
  const start = vi.fn();
  const setOption = vi.fn();
  const launcher = {list, start, setOption} as unknown as SessionLauncher;
  const hex = vi.fn();
  const uuid = vi.fn();
  const ids = {hex, uuid} as unknown as IdGenerator;
  const currentWorkspace = vi.fn();
  const sessions = {currentWorkspace} as unknown as SessionService;
  const forSession = vi.fn();
  const transcripts = {forSession} as unknown as TranscriptSource;
  const validBranchName = vi.fn();
  const branchExists = vi.fn();
  const defaultBranch = vi.fn();
  const fetch = vi.fn();
  const addWorktree = vi.fn();
  const ensureIgnored = vi.fn();
  const vcs = {
    validBranchName,
    branchExists,
    defaultBranch,
    fetch,
    addWorktree,
    ensureIgnored,
  } as unknown as VcsGateway;
  const prDefaultBranch = vi.fn();
  const prs = {defaultBranch: prDefaultBranch} as unknown as PrGateway;
  const exists = vi.fn();
  const stat = vi.fn();
  const files = {exists, stat} as unknown as FileStore;
  const save = vi.fn();
  const tasks = {save} as unknown as TaskStore;
  const write = vi.fn();
  const copyIn = vi.fn();
  const taskFiles = {write, copyIn} as unknown as TaskFiles;
  const launch = vi.fn();
  const calls: string[] = [];
  let service: TaskService;

  const input = (over: Partial<NewTaskInput> = {}): NewTaskInput => ({
    repoId: 'talon',
    description: 'Faz X\ncom exemplo',
    branch: 'feat-x',
    model: null,
    attachments: [],
    ...over,
  });
  const ship = (text: string) =>
    service.create(input({description: `/supera:ship ${text}`}));

  beforeEach(() => {
    vi.resetAllMocks();
    hex.mockReturnValue('abc123');
    uuid.mockReturnValue('u1');
    currentWorkspace.mockReturnValue(workspace);
    setOption.mockResolvedValue(undefined);
    forSession.mockResolvedValue(null);
    calls.length = 0;
    const track = (
      name: string,
      fn: ReturnType<typeof vi.fn>,
      value: unknown,
    ) =>
      fn.mockImplementation(async () => {
        calls.push(name);
        return value;
      });
    track('validBranchName', validBranchName, true);
    track('branchExists', branchExists, false);
    track('exists', exists, false);
    track('defaultBranch', defaultBranch, 'main');
    track('fetch', fetch, undefined);
    track('addWorktree', addWorktree, undefined);
    track('ensureIgnored', ensureIgnored, undefined);
    track('copyIn', copyIn, '/u/tasks/u1/attachments/spec.md');
    track('write', write, '/u/tasks/u1/prompt.md');
    track('launch', launch, 'sess-1');
    track('save', save, undefined);
    stat.mockResolvedValue({size: 10});
    (sessions as unknown as {launch: typeof launch}).launch = launch;
    service = new TaskService(
      sessions,
      launcher,
      ids,
      transcripts,
      vcs,
      prs,
      files,
      tasks,
      taskFiles,
    );
  });

  describe('create', () => {
    it('Should start a ship session with the prompt in the pane environment', async () => {
      const name = await ship("  fix it's\n  $(x)  ");
      expect(name).toBe('talon-abc123');
      expect(start).toHaveBeenCalledWith({
        name: 'talon-abc123',
        cwd: mainPath,
        command:
          'claude --dangerously-skip-permissions --session-id u1 "$FLY_PROMPT"; exit',
        env: {FLY_PROMPT: "/supera:ship fix it's $(x)"},
        options: {
          '@fly_session_id': 'u1',
          '@fly_task': "fix it's\n  $(x)",
          '@fly_task_repo': mainPath,
          '@fly_task_baseline': baseline,
        },
      });
    });

    it("Should record only the repo's own worktrees as the baseline", async () => {
      const kite = '/r/kite';
      currentWorkspace.mockReturnValue({
        ...workspace,
        repos: [
          ...workspace.repos,
          {id: 'kite', name: 'kite', group: '', path: kite},
        ],
        worktrees: [
          ...workspace.worktrees,
          {...wt(kite, true), repoId: 'kite'},
          {...wt('/r/kite/.worktrees/k'), repoId: 'kite'},
        ],
      });
      await ship('x');
      expect(start.mock.calls[0]?.[0].options['@fly_task_baseline']).toBe(
        baseline,
      );
    });

    it('Should turn control characters in the prompt into spaces', async () => {
      await ship('x\x03rm -rf ~ #');
      expect(start.mock.calls[0]?.[0].env).toEqual({
        FLY_PROMPT: '/supera:ship x rm -rf ~ #',
      });
    });

    it('Should accept 2000 characters counted as code points', async () => {
      const description = '🚀'.repeat(2000);
      await ship(` ${description} `);
      expect(start.mock.calls[0]?.[0].env).toEqual({
        FLY_PROMPT: `/supera:ship ${description}`,
      });
    });

    it('Should reject a description over 2000 characters', async () => {
      await expect(ship('a'.repeat(2001))).rejects.toThrow(
        'Descrição muito longa (máx. 2000 caracteres)',
      );
      expect(start).not.toHaveBeenCalled();
    });

    it('Should store only the first 200 characters as the task label', async () => {
      await ship(`${'a'.repeat(199)}🚀${'b'.repeat(50)}`);
      const label = start.mock.calls[0]?.[0].options['@fly_task'];
      expect(label).toBe(`${'a'.repeat(199)}🚀`);
      expect(() => encodeURIComponent(label)).not.toThrow();
    });

    it('Should map a missing tmux to the install hint', async () => {
      start.mockRejectedValue(
        Object.assign(new Error('spawn tmux ENOENT'), {code: 'ENOENT'}),
      );
      await expect(ship('x')).rejects.toThrow(
        'tmux não encontrado — instale com: brew install tmux',
      );
    });

    it('Should pass any other start failure through unchanged', async () => {
      const error = new Error('duplicate session');
      start.mockRejectedValue(error);
      await expect(ship('x')).rejects.toBe(error);
    });

    it('Should fail without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await expect(ship('x')).rejects.toThrow('Nenhuma pasta aberta');
    });

    it('Should fail for an unknown repo', async () => {
      await expect(service.create(input({repoId: 'nope'}))).rejects.toThrow(
        'Repositório não encontrado',
      );
    });

    it('Should fail for a blank description', async () => {
      await expect(
        service.create(input({description: ' \n '})),
      ).rejects.toThrow('Descreva a tarefa');
      expect(start).not.toHaveBeenCalled();
    });
  });

  describe('create on the worktree flow', () => {
    const path = '/r/talon/.worktrees/feat-x';

    it('Should create the worktree from the fetched default branch and start claude in it', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1234);
      const name = await service.create(
        input({attachments: ['/d/spec.md'], model: 'opus'}),
      );
      vi.useRealTimers();
      expect(name).toBe('sess-1');
      expect(calls).toEqual([
        'validBranchName',
        'branchExists',
        'exists',
        'defaultBranch',
        'fetch',
        'addWorktree',
        'ensureIgnored',
        'copyIn',
        'write',
        'launch',
        'save',
      ]);
      expect(validBranchName).toHaveBeenCalledWith(mainPath, 'feat-x');
      expect(branchExists).toHaveBeenCalledWith(mainPath, 'feat-x');
      expect(exists).toHaveBeenCalledWith(path);
      expect(defaultBranch).toHaveBeenCalledWith(mainPath);
      expect(fetch).toHaveBeenCalledWith(mainPath, 'main');
      expect(addWorktree).toHaveBeenCalledWith({
        repoPath: mainPath,
        path,
        branch: 'feat-x',
        base: 'origin/main',
      });
      expect(ensureIgnored).toHaveBeenCalledWith(mainPath, '.worktrees');
      expect(copyIn).toHaveBeenCalledWith('u1', '/d/spec.md');
      expect(write).toHaveBeenCalledWith(
        'u1',
        'prompt.md',
        'Faz X\ncom exemplo\n\nArquivos anexados:\n- /u/tasks/u1/attachments/spec.md',
      );
      expect(launch).toHaveBeenCalledWith('talon/.worktrees/feat-x', path, {
        promptFile: '/u/tasks/u1/prompt.md',
        model: 'opus',
        task: 'Faz X\ncom exemplo',
      });
      expect(save).toHaveBeenCalledWith({
        id: 'u1',
        repoPath: mainPath,
        worktreePath: path,
        branch: 'feat-x',
        base: 'main',
        model: 'opus',
        promptFile: '/u/tasks/u1/prompt.md',
        prNumber: null,
        phase: 'working',
        ciAttempts: 0,
        fixedSha: null,
        reviewSeenAt: null,
        review: null,
        outbox: null,
        pending: null,
        stop: null,
        createdAt: 1234,
      });
      expect(start).not.toHaveBeenCalled();
    });

    it('Should write a bare prompt without attachments, cleaned and trimmed', async () => {
      await service.create(input({description: '  a\u0007 $(x) "q"\r\n  '}));
      expect(copyIn).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith('u1', 'prompt.md', 'a $(x) "q"');
    });

    it('Should list every attachment copy in order', async () => {
      copyIn.mockResolvedValueOnce('/p/a').mockResolvedValueOnce('/p/b');
      await service.create(input({attachments: ['/d/a', '/d/b']}));
      expect(write.mock.calls[0]?.[2]).toBe(
        'Faz X\ncom exemplo\n\nArquivos anexados:\n- /p/a\n- /p/b',
      );
    });

    it('Should label the session with the first 200 code points', async () => {
      await service.create(input({description: `${'a'.repeat(199)}🚀bbb`}));
      expect(launch.mock.calls[0]?.[2].task).toBe(`${'a'.repeat(199)}🚀`);
    });

    it('Should fall back to gh for the default branch', async () => {
      defaultBranch.mockResolvedValue(null);
      prDefaultBranch.mockResolvedValue('trunk');
      await service.create(input());
      expect(prDefaultBranch).toHaveBeenCalledWith(mainPath);
      expect(fetch).toHaveBeenCalledWith(mainPath, 'trunk');
      expect(addWorktree.mock.calls[0]?.[0].base).toBe('origin/trunk');
      expect(save.mock.calls[0]?.[0].base).toBe('trunk');
    });

    it('Should not ask gh when git knows the default branch', async () => {
      await service.create(input());
      expect(prDefaultBranch).not.toHaveBeenCalled();
    });

    it('Should accept exactly the maximum prompt and attachment size', async () => {
      stat.mockResolvedValue({size: 20 * 1024 * 1024});
      await service.create(
        input({description: 'a'.repeat(100_000), attachments: ['/d/a']}),
      );
      expect(addWorktree).toHaveBeenCalled();
    });

    const rejected: [string, Partial<NewTaskInput>, () => void, string][] = [
      [
        'an invalid branch name',
        {},
        () => validBranchName.mockResolvedValue(false),
        'Nome de branch inválido',
      ],
      [
        'an existing branch',
        {},
        () => branchExists.mockResolvedValue(true),
        'O branch feat-x já existe',
      ],
      [
        'an existing folder',
        {},
        () => exists.mockResolvedValue(true),
        `Já existe uma pasta em ${path}`,
      ],
      ['an unknown model', {model: 'gpt'}, () => undefined, 'Modelo inválido'],
      [
        'a prompt over the limit',
        {description: 'a'.repeat(100_001)},
        () => undefined,
        'Prompt muito longo (máx. 100000 caracteres)',
      ],
      [
        'an attachment over the limit',
        {attachments: ['/d/ok.md', '/d/big.bin']},
        () =>
          stat.mockImplementation(async (p: string) => ({
            size: p === '/d/big.bin' ? 20 * 1024 * 1024 + 1 : 1,
          })),
        'Arquivo maior que 20 MB: big.bin',
      ],
      [
        'a blank description',
        {description: ' \n '},
        () => undefined,
        'Descreva a tarefa',
      ],
    ];
    it.each(rejected)(
      'Should reject %s before anything is created',
      async (_label, over, arrange, message) => {
        arrange();
        await expect(service.create(input(over))).rejects.toThrow(message);
        expect(fetch).not.toHaveBeenCalled();
        expect(defaultBranch).not.toHaveBeenCalled();
        expect(addWorktree).not.toHaveBeenCalled();
        expect(ensureIgnored).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(copyIn).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
      },
    );

    it.each(['opus', 'sonnet', 'haiku', null])(
      'Should accept the model %s',
      async model => {
        await service.create(input({model}));
        expect(launch.mock.calls[0]?.[2].model).toBe(model);
      },
    );

    it('Should stop at a failed fetch without a worktree', async () => {
      fetch.mockRejectedValue(new Error('git fetch falhou: offline'));
      await expect(service.create(input())).rejects.toThrow(
        'git fetch falhou: offline',
      );
      expect(addWorktree).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should leave the worktree and show the error when the prompt cannot be written', async () => {
      write.mockRejectedValue(new Error('disco cheio'));
      await expect(service.create(input())).rejects.toThrow('disco cheio');
      expect(addWorktree).toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should leave the worktree and show the error when the session cannot start', async () => {
      launch.mockRejectedValue(new Error('tmux caiu'));
      await expect(service.create(input())).rejects.toThrow('tmux caiu');
      expect(addWorktree).toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should keep the ship path for a /supera:ship prompt', async () => {
      const name = await service.create(
        input({description: '/supera:ship faz x'}),
      );
      expect(name).toBe('talon-abc123');
      expect(start).toHaveBeenCalledWith({
        name: 'talon-abc123',
        cwd: mainPath,
        command:
          'claude --dangerously-skip-permissions --session-id u1 "$FLY_PROMPT"; exit',
        env: {FLY_PROMPT: '/supera:ship faz x'},
        options: {
          '@fly_session_id': 'u1',
          '@fly_task': 'faz x',
          '@fly_task_repo': mainPath,
          '@fly_task_baseline': baseline,
        },
      });
      expect(calls).toEqual([]);
      expect(validBranchName).not.toHaveBeenCalled();
      expect(stat).not.toHaveBeenCalled();
    });
  });

  describe('bind', () => {
    const x = '/r/talon/.worktrees/x';
    const y = '/r/talon/.worktrees/y';
    // Each session's transcript names the worktree keyed by its session id.
    const transcriptsName = (entered: Record<string, string>) =>
      forSession.mockImplementation(async ({sessionId}: {sessionId: string}) =>
        summary(entered[sessionId] ?? null),
      );

    it('Should bind each task to the worktree its own transcript entered, whatever the creation order', async () => {
      currentWorkspace.mockReturnValue(withNew(x, y));
      list.mockResolvedValue([
        pending('b', 2, {'@fly_session_id': 'sb'}),
        pending('a', 1, {'@fly_session_id': 'sa'}),
      ]);
      transcriptsName({sa: y, sb: x});
      await service.bind();
      expect(setOption.mock.calls).toEqual([
        ['a', '@fly_worktree', y],
        ['b', '@fly_worktree', x],
      ]);
    });

    it("Should read the transcript from the repo root with the task's session id", async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'u1'})]);
      await service.bind();
      expect(forSession).toHaveBeenCalledTimes(1);
      expect(forSession).toHaveBeenCalledWith({
        launchCwd: mainPath,
        sessionId: 'u1',
      });
    });

    it('Should not guess when two tasks of a repo are pending and neither transcript names a worktree', async () => {
      currentWorkspace.mockReturnValue(withNew(x, y));
      list.mockResolvedValue([
        pending('a', 1, {'@fly_session_id': 'sa'}),
        pending('b', 2, {'@fly_session_id': 'sb'}),
      ]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should not guess while another task of the repo is pending, even with one new worktree', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('n2', 2), pending('n1', 1)]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should fall back to the only new worktree when a single task is pending without evidence', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'sa'})]);
      await service.bind();
      expect(setOption).toHaveBeenCalledTimes(1);
      expect(setOption).toHaveBeenCalledWith('a', '@fly_worktree', x);
    });

    it('Should fall back without reading a transcript when the task has no session id', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('a', 1)]);
      await service.bind();
      expect(forSession).not.toHaveBeenCalled();
      expect(setOption).toHaveBeenCalledWith('a', '@fly_worktree', x);
    });

    it('Should not fall back when a single task is pending and two worktrees are new', async () => {
      currentWorkspace.mockReturnValue(withNew(x, y));
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'sa'})]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should not fall back in the pass where another task of the repo bound by transcript', async () => {
      currentWorkspace.mockReturnValue(withNew(x, y));
      list.mockResolvedValue([
        pending('a', 1, {'@fly_session_id': 'sa'}),
        pending('b', 2, {'@fly_session_id': 'sb'}),
      ]);
      transcriptsName({sa: x});
      await service.bind();
      expect(setOption.mock.calls).toEqual([['a', '@fly_worktree', x]]);
    });

    it('Should count pending tasks per repo for the fallback', async () => {
      const kite = '/r/kite';
      const kiteNew = '/r/kite/.worktrees/k';
      currentWorkspace.mockReturnValue({
        ...withNew(x),
        repos: [
          ...workspace.repos,
          {id: 'kite', name: 'kite', group: '', path: kite},
        ],
        worktrees: [
          ...withNew(x).worktrees,
          {...wt(kite, true), repoId: 'kite'},
          {...wt(kiteNew), repoId: 'kite'},
        ],
      });
      list.mockResolvedValue([
        pending('a', 1),
        pending('k', 2, {
          '@fly_task_repo': kite,
          '@fly_task_baseline': JSON.stringify([kite]),
        }),
      ]);
      await service.bind();
      expect(setOption.mock.calls).toEqual([
        ['a', '@fly_worktree', x],
        ['k', '@fly_worktree', kiteNew],
      ]);
    });

    it('Should bind to the evidence worktree even when it was in the baseline', async () => {
      const old = '/r/talon/.worktrees/old';
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'sa'})]);
      transcriptsName({sa: old});
      await service.bind();
      expect(setOption).toHaveBeenCalledWith('a', '@fly_worktree', old);
    });

    it('Should not bind evidence that names a worktree another session already holds', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('done', 1, {'@fly_worktree': x}),
        pending('a', 2, {'@fly_session_id': 'sa'}),
      ]);
      transcriptsName({sa: x});
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should not fall back when the transcript names a worktree that cannot be bound yet', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'sa'})]);
      transcriptsName({sa: '/r/talon/.worktrees/later'});
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should give a worktree two transcripts name to the older session', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('n2', 2, {'@fly_session_id': 's2'}),
        pending('n1', 1, {'@fly_session_id': 's1'}),
      ]);
      transcriptsName({s1: x, s2: x});
      await service.bind();
      expect(setOption.mock.calls).toEqual([['n1', '@fly_worktree', x]]);
    });

    it('Should break createdAt ties by name', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('q', 1, {'@fly_session_id': 'sq'}),
        pending('p', 1, {'@fly_session_id': 'sp'}),
      ]);
      transcriptsName({sp: x, sq: x});
      await service.bind();
      expect(setOption.mock.calls).toEqual([['p', '@fly_worktree', x]]);
    });

    it('Should treat a transcript read failure as no evidence', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([pending('a', 1, {'@fly_session_id': 'sa'})]);
      forSession.mockRejectedValue(new Error('EACCES'));
      await service.bind();
      expect(setOption).toHaveBeenCalledWith('a', '@fly_worktree', x);
    });

    it('Should ignore baseline and main worktrees', async () => {
      list.mockResolvedValue([pending('a', 1)]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should never reuse an already bound worktree', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('done', 1, {'@fly_worktree': x}),
        pending('a', 2),
      ]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should skip sessions whose repo is not in the workspace', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('a', 1, {'@fly_task_repo': '/other', '@fly_session_id': 'sa'}),
      ]);
      await service.bind();
      expect(forSession).not.toHaveBeenCalled();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should ignore sessions without a task repo', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        {...pending('a', 1), options: {'@fly_session_id': 'u'}},
      ]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should not count a task that is already bound toward the fallback', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('done', 1, {'@fly_worktree': '/r/talon/.worktrees/old'}),
        pending('a', 2),
      ]);
      await service.bind();
      expect(setOption.mock.calls).toEqual([['a', '@fly_worktree', x]]);
    });

    it.each([
      ['malformed JSON', '{nope'],
      ['a mix of a path and null', '["/r/talon/.worktrees/old", null]'],
      ['a non-array', '{"a":1}'],
      ['non-string entries', '[1,2]'],
      ['a missing baseline', undefined],
    ])(
      'Should not fall back for a session with %s baseline',
      async (_label, value) => {
        currentWorkspace.mockReturnValue(withNew(x));
        const session = pending('a', 1);
        if (value === undefined) delete session.options['@fly_task_baseline'];
        else session.options['@fly_task_baseline'] = value;
        list.mockResolvedValue([session]);
        await service.bind();
        expect(setOption).not.toHaveBeenCalled();
      },
    );

    it('Should still bind by transcript when the baseline is unreadable', async () => {
      currentWorkspace.mockReturnValue(withNew(x));
      list.mockResolvedValue([
        pending('a', 1, {
          '@fly_session_id': 'sa',
          '@fly_task_baseline': '{nope',
        }),
      ]);
      transcriptsName({sa: x});
      await service.bind();
      expect(setOption).toHaveBeenCalledWith('a', '@fly_worktree', x);
    });

    it('Should be a no-op without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await service.bind();
      expect(list).not.toHaveBeenCalled();
    });

    it('Should swallow a list rejection', async () => {
      list.mockRejectedValue(new Error('boom'));
      await expect(service.bind()).resolves.toBeUndefined();
      expect(setOption).not.toHaveBeenCalled();
    });
  });
});
