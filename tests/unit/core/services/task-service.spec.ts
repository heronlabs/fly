import {Workspace} from '../../../../src/core/domain/workspace';
import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../../../src/core/interfaces/session-launcher';
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
  let service: TaskService;

  beforeEach(() => {
    vi.resetAllMocks();
    hex.mockReturnValue('abc123');
    uuid.mockReturnValue('u1');
    currentWorkspace.mockReturnValue(workspace);
    setOption.mockResolvedValue(undefined);
    service = new TaskService(sessions, launcher, ids);
  });

  describe('create', () => {
    it('Should start a ship session in the repo root with a quoted prompt', async () => {
      const name = await service.create({
        repoId: 'talon',
        description: "  fix it's\n  $(x)  ",
      });
      expect(name).toBe('talon-abc123');
      expect(start).toHaveBeenCalledWith({
        name: 'talon-abc123',
        cwd: mainPath,
        command:
          "claude --dangerously-skip-permissions --session-id u1 '/supera:ship fix it'\\''s $(x)'; exit",
        options: {
          '@fly_session_id': 'u1',
          '@fly_task': "fix it's\n  $(x)",
          '@fly_task_repo': mainPath,
          '@fly_task_baseline': baseline,
        },
      });
    });

    it('Should not type control characters into the shell', async () => {
      await service.create({repoId: 'talon', description: 'x\x03rm -rf ~ #'});
      expect(start.mock.calls[0]?.[0].command).toBe(
        "claude --dangerously-skip-permissions --session-id u1 '/supera:ship x rm -rf ~ #'; exit",
      );
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
    it('Should bind a pending session to a new worktree', async () => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
      list.mockResolvedValue([pending('a', 1)]);
      await service.bind();
      expect(setOption).toHaveBeenCalledTimes(1);
      expect(setOption).toHaveBeenCalledWith(
        'a',
        '@fly_worktree',
        '/r/talon/.worktrees/new',
      );
    });

    it('Should ignore baseline and main worktrees', async () => {
      list.mockResolvedValue([pending('a', 1)]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should give the older session the first path', async () => {
      currentWorkspace.mockReturnValue(
        withNew('/r/talon/.worktrees/z', '/r/talon/.worktrees/b'),
      );
      list.mockResolvedValue([pending('n2', 2), pending('n1', 1)]);
      await service.bind();
      expect(setOption.mock.calls).toEqual([
        ['n1', '@fly_worktree', '/r/talon/.worktrees/b'],
        ['n2', '@fly_worktree', '/r/talon/.worktrees/z'],
      ]);
    });

    it('Should break createdAt ties by name', async () => {
      currentWorkspace.mockReturnValue(
        withNew('/r/talon/.worktrees/b', '/r/talon/.worktrees/c'),
      );
      list.mockResolvedValue([pending('y', 1), pending('x', 1)]);
      await service.bind();
      expect(setOption.mock.calls).toEqual([
        ['x', '@fly_worktree', '/r/talon/.worktrees/b'],
        ['y', '@fly_worktree', '/r/talon/.worktrees/c'],
      ]);
    });

    it('Should bind only the older session when one worktree is new', async () => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
      list.mockResolvedValue([pending('n2', 2), pending('n1', 1)]);
      await service.bind();
      expect(setOption).toHaveBeenCalledTimes(1);
      expect(setOption).toHaveBeenCalledWith(
        'n1',
        '@fly_worktree',
        '/r/talon/.worktrees/new',
      );
    });

    it('Should never reuse an already bound worktree', async () => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
      list.mockResolvedValue([
        pending('done', 1, {'@fly_worktree': '/r/talon/.worktrees/new'}),
        pending('a', 2),
      ]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should skip sessions whose repo is not in the workspace', async () => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
      list.mockResolvedValue([pending('a', 1, {'@fly_task_repo': '/other'})]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
    });

    it('Should ignore sessions without a task repo', async () => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
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
    ])('Should skip a session with %s baseline', async (_label, value) => {
      currentWorkspace.mockReturnValue(withNew('/r/talon/.worktrees/new'));
      const session = pending('a', 1);
      if (value === undefined) delete session.options['@fly_task_baseline'];
      else session.options['@fly_task_baseline'] = value;
      list.mockResolvedValue([session]);
      await service.bind();
      expect(setOption).not.toHaveBeenCalled();
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
