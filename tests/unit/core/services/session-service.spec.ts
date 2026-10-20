import {Workspace} from '../../../../src/core/domain/workspace';
import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {
  MultiplexerSession,
  SessionLauncher,
} from '../../../../src/core/interfaces/session-launcher';
import {SessionService} from '../../../../src/core/services/session-service';

const wt = (id: string, isMain = false) => ({
  id,
  repoId: id.split('/')[0] ?? id,
  path: `/r/${id}`,
  branch: null,
  head: 'h',
  isMain,
});
const workspace: Workspace = {
  root: '/r',
  repos: [],
  worktrees: [wt('talon', true), wt('talon/.worktrees/feat'), wt('talon-2')],
};
const mux = (over: Partial<MultiplexerSession>): MultiplexerSession => ({
  name: 'n',
  cwd: '/r/talon',
  createdAt: 1,
  attachedClients: 0,
  options: {},
  ...over,
});

describe('SessionService', () => {
  const list = vi.fn();
  const start = vi.fn();
  const kill = vi.fn();
  const launcher = {list, start, kill} as unknown as SessionLauncher;
  const hex = vi.fn();
  const uuid = vi.fn();
  const ids = {hex, uuid} as unknown as IdGenerator;
  let service: SessionService;

  beforeEach(() => {
    vi.resetAllMocks();
    hex.mockReturnValue('abc123');
    uuid.mockReturnValue('u1');
    service = new SessionService(launcher, ids);
    service.setWorkspace(workspace);
  });

  it('Should expose the current workspace', () => {
    expect(service.currentWorkspace()).toBe(workspace);
    service.setWorkspace(null);
    expect(service.currentWorkspace()).toBeNull();
  });

  it('Should prefer the explicit @fly_worktree over cwd', async () => {
    list.mockResolvedValue([
      mux({options: {'@fly_worktree': '/r/talon-2'}, cwd: '/r/talon'}),
    ]);
    const snap = await service.snapshot();
    expect(snap.sessions[0]?.worktreeId).toBe('talon-2');
  });

  it('Should map a cwd to the deepest worktree', async () => {
    list.mockResolvedValue([mux({cwd: '/r/talon/.worktrees/feat/src'})]);
    const snap = await service.snapshot();
    expect(snap.sessions[0]?.worktreeId).toBe('talon/.worktrees/feat');
  });

  it('Should map a cwd equal to a worktree path', async () => {
    list.mockResolvedValue([mux({cwd: '/r/talon'})]);
    const snap = await service.snapshot();
    expect(snap.sessions[0]?.worktreeId).toBe('talon');
  });

  it('Should not match a sibling that shares a name prefix', async () => {
    list.mockResolvedValue([mux({cwd: '/r/talon-3/x'})]);
    expect((await service.snapshot()).sessions).toEqual([]);
  });

  it('Should leave out unknown cwds', async () => {
    list.mockResolvedValue([mux({cwd: '/elsewhere'})]);
    expect(await service.snapshot()).toEqual({
      tmux: 'ok',
      message: null,
      sessions: [],
    });
  });

  it('Should return no sessions without a workspace', async () => {
    service.setWorkspace(null);
    list.mockResolvedValue([mux({})]);
    expect((await service.snapshot()).sessions).toEqual([]);
  });

  it('Should fill origin, task and sort by createdAt then name', async () => {
    list.mockResolvedValue([
      mux({name: 'b', createdAt: 2}),
      mux({name: 'z', createdAt: 1, attachedClients: 2}),
      mux({
        name: 'a',
        createdAt: 1,
        options: {'@fly_session_id': 'x', '@fly_task': 'do it'},
      }),
    ]);
    const {sessions} = await service.snapshot();
    expect(sessions).toEqual([
      {
        name: 'a',
        worktreeId: 'talon',
        createdAt: 1,
        attachedClients: 0,
        origin: 'fly',
        task: 'do it',
      },
      {
        name: 'z',
        worktreeId: 'talon',
        createdAt: 1,
        attachedClients: 2,
        origin: 'external',
        task: null,
      },
      {
        name: 'b',
        worktreeId: 'talon',
        createdAt: 2,
        attachedClients: 0,
        origin: 'external',
        task: null,
      },
    ]);
  });

  it('Should report tmux missing on ENOENT', async () => {
    list.mockRejectedValue(Object.assign(new Error('spawn'), {code: 'ENOENT'}));
    expect(await service.snapshot()).toEqual({
      tmux: 'missing',
      message: 'tmux não encontrado — instale com: brew install tmux',
      sessions: [],
    });
  });

  it('Should report tmux error with the message', async () => {
    list.mockRejectedValue(new Error('boom'));
    expect(await service.snapshot()).toEqual({
      tmux: 'error',
      message: 'boom',
      sessions: [],
    });
  });

  it('Should stringify non-Error rejections', async () => {
    list.mockRejectedValue('bad');
    expect(await service.snapshot()).toEqual({
      tmux: 'error',
      message: 'bad',
      sessions: [],
    });
  });

  it('Should start a claude session in the worktree', async () => {
    start.mockResolvedValue(undefined);
    const name = await service.start('talon/.worktrees/feat');
    expect(name).toBe('talon-feat-abc123');
    expect(start).toHaveBeenCalledWith({
      name: 'talon-feat-abc123',
      cwd: '/r/talon/.worktrees/feat',
      command: 'claude --dangerously-skip-permissions --session-id u1; exit',
      options: {
        '@fly_session_id': 'u1',
        '@fly_worktree': '/r/talon/.worktrees/feat',
      },
    });
  });

  it('Should fail to start without a workspace', async () => {
    service.setWorkspace(null);
    await expect(service.start('talon')).rejects.toThrow(
      'Nenhuma pasta aberta',
    );
  });

  it('Should fail to start an unknown worktree', async () => {
    await expect(service.start('nope')).rejects.toThrow(
      'Worktree não encontrado',
    );
  });

  it('Should map a missing tmux on start to the install hint', async () => {
    start.mockRejectedValue(
      Object.assign(new Error('spawn tmux ENOENT'), {code: 'ENOENT'}),
    );
    await expect(service.start('talon')).rejects.toThrow(
      'tmux não encontrado — instale com: brew install tmux',
    );
  });

  it('Should pass any other start failure through unchanged', async () => {
    const error = new Error('duplicate session');
    start.mockRejectedValue(error);
    await expect(service.start('talon')).rejects.toBe(error);
  });

  it('Should delegate kill to the launcher', async () => {
    kill.mockResolvedValue(undefined);
    await service.kill('x');
    expect(kill).toHaveBeenCalledWith('x');
  });
});
