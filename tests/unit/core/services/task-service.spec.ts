import {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {Workspace} from '../../../../src/core/domain/workspace';
import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../../../src/core/interfaces/session-launcher';
import {TranscriptSource} from '../../../../src/core/interfaces/transcript-source';
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
  let service: TaskService;

  beforeEach(() => {
    vi.resetAllMocks();
    hex.mockReturnValue('abc123');
    uuid.mockReturnValue('u1');
    currentWorkspace.mockReturnValue(workspace);
    setOption.mockResolvedValue(undefined);
    forSession.mockResolvedValue(null);
    service = new TaskService(sessions, launcher, ids, transcripts);
  });

  describe('create', () => {
    it('Should start a ship session with the prompt in the pane environment', async () => {
      const name = await service.create({
        repoId: 'talon',
        description: "  fix it's\n  $(x)  ",
      });
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

    it('Should turn control characters in the prompt into spaces', async () => {
      await service.create({repoId: 'talon', description: 'x\x03rm -rf ~ #'});
      expect(start.mock.calls[0]?.[0].env).toEqual({
        FLY_PROMPT: '/supera:ship x rm -rf ~ #',
      });
    });

    it('Should accept 2000 characters counted as code points', async () => {
      const description = '🚀'.repeat(2000);
      await service.create({repoId: 'talon', description: ` ${description} `});
      expect(start.mock.calls[0]?.[0].env).toEqual({
        FLY_PROMPT: `/supera:ship ${description}`,
      });
    });

    it('Should reject a description over 2000 characters', async () => {
      await expect(
        service.create({repoId: 'talon', description: 'a'.repeat(2001)}),
      ).rejects.toThrow('Descrição muito longa (máx. 2000 caracteres)');
      expect(start).not.toHaveBeenCalled();
    });

    it('Should store only the first 200 characters as the task label', async () => {
      await service.create({
        repoId: 'talon',
        description: `${'a'.repeat(199)}🚀${'b'.repeat(50)}`,
      });
      const label = start.mock.calls[0]?.[0].options['@fly_task'];
      expect(label).toBe(`${'a'.repeat(199)}🚀`);
      expect(() => encodeURIComponent(label)).not.toThrow();
    });

    it('Should map a missing tmux to the install hint', async () => {
      start.mockRejectedValue(
        Object.assign(new Error('spawn tmux ENOENT'), {code: 'ENOENT'}),
      );
      await expect(
        service.create({repoId: 'talon', description: 'x'}),
      ).rejects.toThrow('tmux não encontrado — instale com: brew install tmux');
    });

    it('Should pass any other start failure through unchanged', async () => {
      const error = new Error('duplicate session');
      start.mockRejectedValue(error);
      await expect(
        service.create({repoId: 'talon', description: 'x'}),
      ).rejects.toBe(error);
    });

    it('Should fail without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await expect(
        service.create({repoId: 'talon', description: 'x'}),
      ).rejects.toThrow('Nenhuma pasta aberta');
    });

    it('Should fail for an unknown repo', async () => {
      await expect(
        service.create({repoId: 'nope', description: 'x'}),
      ).rejects.toThrow('Repositório não encontrado');
    });

    it('Should fail for a blank description', async () => {
      await expect(
        service.create({repoId: 'talon', description: ' \n '}),
      ).rejects.toThrow('Descreva a tarefa');
      expect(start).not.toHaveBeenCalled();
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

    it.each([
      ['malformed JSON', '{nope'],
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
