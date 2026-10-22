import {
  errorMessage,
  groupsOf,
  queueCounts,
  queueOf,
  statusesOf,
  useFlyStore,
} from '../../../src/application/ui/state/fly-store';
import type {WorktreeDiff} from '../../../src/core/domain/diff';
import type {QueueSnapshot, QueueStatus} from '../../../src/core/domain/queue';
import type {SessionsSnapshot} from '../../../src/core/domain/session';
import type {Workspace} from '../../../src/core/domain/workspace';

const workspace = (ids: string[] = ['a/x']): Workspace => ({
  root: '/r',
  repos: ids.map(id => ({id, name: id, group: '', path: `/r/${id}`})),
  worktrees: ids.map(id => ({
    id: `${id}#main`,
    repoId: id,
    path: `/r/${id}`,
    branch: 'main',
    head: 'abcdef123',
    isMain: true,
  })),
});

const initial = useFlyStore.getState();

beforeEach(() => {
  useFlyStore.setState(initial, true);
  vi.mocked(window.fly.sessions.list).mockResolvedValue({
    tmux: 'ok',
    message: null,
    sessions: [],
  });
  vi.mocked(window.fly.queue.list).mockResolvedValue({
    github: 'ok',
    message: null,
    worktrees: [],
  });
});

describe('fly store', () => {
  it('bootstrap opens the first recent root', async () => {
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      recentRoots: ['/r', '/q'],
      theme: 'dark',
      diffPanel: 'open',
    });
    vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace());
    await useFlyStore.getState().bootstrap();
    expect(window.fly.workspace.open).toHaveBeenCalledWith('/r');
    expect(useFlyStore.getState().config.theme).toBe('dark');
    expect(useFlyStore.getState().workspace?.root).toBe('/r');
  });

  it('bootstrap without recent roots opens nothing', async () => {
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      recentRoots: [],
      theme: 'system',
      diffPanel: 'open',
    });
    await useFlyStore.getState().bootstrap();
    expect(window.fly.workspace.open).not.toHaveBeenCalled();
    expect(useFlyStore.getState().workspace).toBeNull();
  });

  it('bootstrap reports a settings failure', async () => {
    vi.mocked(window.fly.settings.get).mockRejectedValue(new Error('boom'));
    await useFlyStore.getState().bootstrap();
    expect(useFlyStore.getState().error).toBe('boom');
  });

  it('pickAndOpen does nothing when the picker is cancelled', async () => {
    vi.mocked(window.fly.workspace.pickFolder).mockResolvedValue(null);
    await useFlyStore.getState().pickAndOpen();
    expect(window.fly.workspace.open).not.toHaveBeenCalled();
  });

  it('pickAndOpen opens the picked folder', async () => {
    vi.mocked(window.fly.workspace.pickFolder).mockResolvedValue('/r');
    vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace());
    await useFlyStore.getState().pickAndOpen();
    expect(useFlyStore.getState().workspace?.root).toBe('/r');
  });

  it('pickAndOpen reports a picker failure', async () => {
    vi.mocked(window.fly.workspace.pickFolder).mockRejectedValue(
      new Error('no'),
    );
    await useFlyStore.getState().pickAndOpen();
    expect(useFlyStore.getState().error).toBe('no');
  });

  it('openRoot sets the workspace and clears the error', async () => {
    useFlyStore.setState({error: 'old'});
    vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace());
    await useFlyStore.getState().openRoot('/r');
    const state = useFlyStore.getState();
    expect(state.workspace?.root).toBe('/r');
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });

  it('a rejected open sets the error and stops loading', async () => {
    vi.mocked(window.fly.workspace.open).mockRejectedValue(
      new Error(
        "Error invoking remote method 'workspace:open': Error: Nenhuma pasta aberta",
      ),
    );
    await useFlyStore.getState().openRoot('/x');
    const state = useFlyStore.getState();
    expect(state.error).toBe('Nenhuma pasta aberta');
    expect(state.loading).toBe(false);
  });

  it('refresh applies the refreshed workspace', async () => {
    vi.mocked(window.fly.workspace.refresh).mockResolvedValue(workspace());
    await useFlyStore.getState().refresh();
    expect(useFlyStore.getState().workspace?.root).toBe('/r');
  });

  it('a rejected refresh sets the error', async () => {
    vi.mocked(window.fly.workspace.refresh).mockRejectedValue('falhou');
    await useFlyStore.getState().refresh();
    expect(useFlyStore.getState().error).toBe('falhou');
  });

  it('select stores the worktree id', () => {
    useFlyStore.getState().select('a/x#main');
    expect(useFlyStore.getState().selectedWorktreeId).toBe('a/x#main');
  });

  it('setTheme persists and stores the config', async () => {
    vi.mocked(window.fly.settings.set).mockResolvedValue({
      recentRoots: [],
      theme: 'light',
      diffPanel: 'open',
    });
    await useFlyStore.getState().setTheme('light');
    expect(window.fly.settings.set).toHaveBeenCalledWith({theme: 'light'});
    expect(useFlyStore.getState().config.theme).toBe('light');
  });

  it('a rejected setTheme sets the error', async () => {
    vi.mocked(window.fly.settings.set).mockRejectedValue(new Error('disco'));
    await useFlyStore.getState().setTheme('dark');
    expect(useFlyStore.getState().error).toBe('disco');
  });

  it('applyWorkspace keeps the selection when it still exists', () => {
    useFlyStore.setState({selectedWorktreeId: 'a/x#main'});
    useFlyStore.getState().applyWorkspace(workspace());
    expect(useFlyStore.getState().selectedWorktreeId).toBe('a/x#main');
  });

  it('applyWorkspace clears the selection when it vanished', () => {
    useFlyStore.setState({selectedWorktreeId: 'gone#main'});
    useFlyStore.getState().applyWorkspace(workspace());
    expect(useFlyStore.getState().selectedWorktreeId).toBeNull();
  });
});

describe('groupsOf', () => {
  it('orders the empty group first, then alphabetically, main worktree first', () => {
    const ws: Workspace = {
      root: '/r',
      repos: [
        {id: 'z/a', name: 'a', group: 'z', path: '/r/z/a'},
        {id: 'b/a', name: 'a', group: 'b', path: '/r/b/a'},
        {id: 'solo', name: 'solo', group: '', path: '/r/solo'},
      ],
      worktrees: [
        {
          id: 'w2',
          repoId: 'solo',
          path: '/w2',
          branch: 'f',
          head: 'h',
          isMain: false,
        },
        {
          id: 'w1',
          repoId: 'solo',
          path: '/w1',
          branch: 'main',
          head: 'h',
          isMain: true,
        },
      ],
    };
    const groups = groupsOf(ws);
    expect(groups.map(g => g.group)).toEqual(['', 'b', 'z']);
    expect(groups[0]?.repos[0]?.worktrees.map(w => w.id)).toEqual(['w1', 'w2']);
    expect(groups[1]?.repos[0]?.worktrees).toEqual([]);
  });
});

describe('errorMessage', () => {
  it('strips the IPC prefix and the Error: marker', () => {
    expect(
      errorMessage(
        new Error(
          "Error invoking remote method 'a:b': Error: Nenhuma pasta aberta",
        ),
      ),
    ).toBe('Nenhuma pasta aberta');
  });
  it('keeps plain messages and stringifies non-errors', () => {
    expect(errorMessage(new Error('x'))).toBe('x');
    expect(errorMessage(42)).toBe('42');
  });
  describe('sessions', () => {
    const snapshot = (
      sessions: {name: string; worktreeId: string}[],
    ): SessionsSnapshot => ({
      tmux: 'ok',
      message: null,
      sessions: sessions.map(session => ({
        ...session,
        createdAt: 1,
        attachedClients: 0,
        origin: 'fly',
        task: null,
      })),
    });

    it('Should store the snapshot on loadSessions', async () => {
      const loaded = snapshot([{name: 'a-1', worktreeId: 'a#main'}]);
      vi.mocked(window.fly.sessions.list).mockResolvedValue(loaded);
      await useFlyStore.getState().loadSessions();
      expect(useFlyStore.getState().sessions).toEqual(loaded);
    });

    it('Should report a loadSessions failure', async () => {
      vi.mocked(window.fly.sessions.list).mockRejectedValue(new Error('tmux'));
      await useFlyStore.getState().loadSessions();
      expect(useFlyStore.getState().error).toBe('tmux');
    });

    it('Should load sessions after openRoot', async () => {
      vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace());
      await useFlyStore.getState().openRoot('/r');
      expect(window.fly.sessions.list).toHaveBeenCalledTimes(1);
    });

    it('Should drop an active session that vanished', () => {
      useFlyStore.setState({activeSessionName: 'gone'});
      useFlyStore.getState().applySessions(snapshot([]));
      expect(useFlyStore.getState().activeSessionName).toBeNull();
    });

    it('Should keep an active session that still exists', () => {
      useFlyStore.setState({activeSessionName: 'a-1'});
      useFlyStore
        .getState()
        .applySessions(snapshot([{name: 'a-1', worktreeId: 'a'}]));
      expect(useFlyStore.getState().activeSessionName).toBe('a-1');
    });

    it('Should follow the active session to its new worktree', () => {
      useFlyStore.setState({
        selectedWorktreeId: 'talon',
        activeSessionName: 'talon-abc',
        sessions: snapshot([{name: 'talon-abc', worktreeId: 'talon'}]),
      });
      useFlyStore
        .getState()
        .applySessions(
          snapshot([{name: 'talon-abc', worktreeId: 'talon/.worktrees/feat'}]),
        );
      expect(useFlyStore.getState().selectedWorktreeId).toBe(
        'talon/.worktrees/feat',
      );
    });

    it('Should not follow when another worktree is selected', () => {
      useFlyStore.setState({
        selectedWorktreeId: 'other',
        activeSessionName: 'talon-abc',
        sessions: snapshot([{name: 'talon-abc', worktreeId: 'talon'}]),
      });
      useFlyStore
        .getState()
        .applySessions(
          snapshot([{name: 'talon-abc', worktreeId: 'talon/.worktrees/feat'}]),
        );
      expect(useFlyStore.getState().selectedWorktreeId).toBe('other');
    });

    it('Should set the active session on startSession', async () => {
      vi.mocked(window.fly.sessions.start).mockResolvedValue('a-1');
      vi.mocked(window.fly.sessions.list).mockResolvedValue(
        snapshot([{name: 'a-1', worktreeId: 'a#main'}]),
      );
      await useFlyStore.getState().startSession('a#main');
      expect(window.fly.sessions.start).toHaveBeenCalledWith('a#main');
      expect(useFlyStore.getState().activeSessionName).toBe('a-1');
      expect(window.fly.sessions.list).toHaveBeenCalled();
    });

    it('Should report a startSession failure', async () => {
      vi.mocked(window.fly.sessions.start).mockRejectedValue(new Error('no'));
      await useFlyStore.getState().startSession('a#main');
      expect(useFlyStore.getState().error).toBe('no');
    });

    it('Should ignore a second startSession while one is in flight', async () => {
      let finish: (name: string) => void = () => undefined;
      vi.mocked(window.fly.sessions.start).mockReturnValueOnce(
        new Promise(resolve => {
          finish = resolve;
        }),
      );
      vi.mocked(window.fly.sessions.list).mockResolvedValue(
        snapshot([{name: 'a-1', worktreeId: 'a#main'}]),
      );
      const first = useFlyStore.getState().startSession('a#main');
      await useFlyStore.getState().startSession('a#main');
      expect(window.fly.sessions.start).toHaveBeenCalledTimes(1);
      finish('a-1');
      await first;
      expect(useFlyStore.getState().activeSessionName).toBe('a-1');
    });

    it('Should allow a new startSession once the previous one failed', async () => {
      vi.mocked(window.fly.sessions.start)
        .mockRejectedValueOnce(new Error('no'))
        .mockResolvedValueOnce('a-2');
      await useFlyStore.getState().startSession('a#main');
      await useFlyStore.getState().startSession('a#main');
      expect(window.fly.sessions.start).toHaveBeenCalledTimes(2);
    });

    it('Should kill a session and reload', async () => {
      vi.mocked(window.fly.sessions.kill).mockResolvedValue(undefined);
      await useFlyStore.getState().killSession('a-1');
      expect(window.fly.sessions.kill).toHaveBeenCalledWith('a-1');
      expect(window.fly.sessions.list).toHaveBeenCalled();
    });

    it('Should report a killSession failure', async () => {
      vi.mocked(window.fly.sessions.kill).mockRejectedValue(new Error('no'));
      await useFlyStore.getState().killSession('a-1');
      expect(useFlyStore.getState().error).toBe('no');
    });

    it('Should select the main worktree on createTask', async () => {
      useFlyStore.setState({workspace: workspace(['a/x', 'b/y'])});
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      vi.mocked(window.fly.sessions.list).mockResolvedValue(
        snapshot([{name: 'task-1', worktreeId: 'b/y#main'}]),
      );
      const ok = await useFlyStore
        .getState()
        .createTask({repoId: 'b/y', description: 'fazer'});
      expect(ok).toBe(true);
      expect(window.fly.tasks.create).toHaveBeenCalledWith({
        repoId: 'b/y',
        description: 'fazer',
      });
      expect(useFlyStore.getState().selectedWorktreeId).toBe('b/y#main');
      expect(useFlyStore.getState().activeSessionName).toBe('task-1');
    });

    it('Should keep the selection when the repo has no main worktree', async () => {
      useFlyStore.setState({
        workspace: workspace(['a/x']),
        selectedWorktreeId: 'a/x#main',
      });
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      await useFlyStore
        .getState()
        .createTask({repoId: 'zzz', description: 'fazer'});
      expect(useFlyStore.getState().selectedWorktreeId).toBe('a/x#main');
    });

    it('Should keep the selection when no workspace is open', async () => {
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      const ok = await useFlyStore
        .getState()
        .createTask({repoId: 'a/x', description: 'fazer'});
      expect(ok).toBe(true);
      expect(useFlyStore.getState().selectedWorktreeId).toBeNull();
    });

    it('Should set error and return false when createTask rejects', async () => {
      vi.mocked(window.fly.tasks.create).mockRejectedValue(
        new Error('Descreva a tarefa'),
      );
      const ok = await useFlyStore
        .getState()
        .createTask({repoId: 'a/x', description: ''});
      expect(ok).toBe(false);
      expect(useFlyStore.getState().error).toBe('Descreva a tarefa');
    });

    it('Should set the active session explicitly', () => {
      useFlyStore.getState().setActiveSession('x');
      expect(useFlyStore.getState().activeSessionName).toBe('x');
    });
  });

  describe('queue', () => {
    const snapshotOf = (statuses: QueueStatus[]): QueueSnapshot => ({
      github: 'ok',
      message: null,
      worktrees: statuses.map((status, index) => ({
        worktreeId: `w${index}`,
        status,
        pullRequest: null,
        receipt: null,
      })),
    });

    it('Should start with an empty queue', () => {
      expect(useFlyStore.getState().queue).toEqual({
        github: 'ok',
        message: null,
        worktrees: [],
      });
    });

    it('Should store the listed queue', async () => {
      const snapshot = snapshotOf(['ready']);
      vi.mocked(window.fly.queue.list).mockResolvedValue(snapshot);
      await useFlyStore.getState().loadQueue();
      expect(useFlyStore.getState().queue).toBe(snapshot);
    });

    it('Should set error when loadQueue rejects', async () => {
      vi.mocked(window.fly.queue.list).mockRejectedValue(new Error('fila'));
      await useFlyStore.getState().loadQueue();
      expect(useFlyStore.getState().error).toBe('fila');
    });

    it('Should apply a pushed queue', () => {
      const snapshot = snapshotOf(['ci']);
      useFlyStore.getState().applyQueue(snapshot);
      expect(useFlyStore.getState().queue).toBe(snapshot);
    });

    it('Should load the queue when opening a root', async () => {
      const snapshot = snapshotOf(['failed']);
      vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace());
      vi.mocked(window.fly.queue.list).mockResolvedValue(snapshot);
      await useFlyStore.getState().openRoot('/r');
      expect(useFlyStore.getState().queue).toBe(snapshot);
    });

    it('Should count waiting and ready as ready, engineer as working', () => {
      const all: QueueStatus[] = [
        'idle',
        'engineer',
        'waiting',
        'ci',
        'failed',
        'ready',
        'merged',
        'unknown',
      ];
      expect(queueCounts(snapshotOf(all))).toEqual({
        ready: 2,
        working: 1,
        ci: 1,
        failed: 1,
      });
    });

    it('Should map worktree ids to statuses', () => {
      expect(statusesOf(snapshotOf(['ready', 'ci']))).toEqual({
        w0: 'ready',
        w1: 'ci',
      });
    });
  });

  describe('diff and merge', () => {
    const diffOf = (worktreeId: string, base = 'main'): WorktreeDiff => ({
      worktreeId,
      scope: 'live',
      base,
      diff: {files: [], truncated: false},
      error: null,
    });

    it('loadDiff stores the result', async () => {
      useFlyStore.setState({selectedWorktreeId: 'a/x#main'});
      const result = diffOf('a/x#main');
      vi.mocked(window.fly.diff.get).mockResolvedValue(result);
      await useFlyStore.getState().loadDiff('a/x#main', 'live');
      expect(window.fly.diff.get).toHaveBeenCalledWith('a/x#main', 'live');
      expect(useFlyStore.getState().diff).toBe(result);
    });

    it('loadDiff ignores a result for another worktree', async () => {
      useFlyStore.setState({selectedWorktreeId: 'a/x#main'});
      vi.mocked(window.fly.diff.get).mockResolvedValue(diffOf('b/y#main'));
      await useFlyStore.getState().loadDiff('b/y#main', 'live');
      expect(useFlyStore.getState().diff).toBeNull();
    });

    it('applyDiff keeps the same object for an identical result', () => {
      useFlyStore.setState({selectedWorktreeId: 'a/x#main'});
      useFlyStore.getState().applyDiff(diffOf('a/x#main'));
      const first = useFlyStore.getState().diff;
      useFlyStore.getState().applyDiff(diffOf('a/x#main'));
      expect(useFlyStore.getState().diff).toBe(first);
      useFlyStore.getState().applyDiff(diffOf('a/x#main', 'dev'));
      expect(useFlyStore.getState().diff).not.toBe(first);
      expect(useFlyStore.getState().diff?.base).toBe('dev');
    });

    it('loadDiff reports a rejection', async () => {
      vi.mocked(window.fly.diff.get).mockRejectedValue(new Error('boom'));
      await useFlyStore.getState().loadDiff('a/x#main', 'live');
      expect(useFlyStore.getState().error).toBe('boom');
    });

    it('select of a new id clears the diff, the same id keeps it', () => {
      useFlyStore.setState({
        selectedWorktreeId: 'a/x#main',
        diff: diffOf('a/x#main'),
      });
      useFlyStore.getState().select('a/x#main');
      expect(useFlyStore.getState().diff).not.toBeNull();
      useFlyStore.getState().select('b/y#main');
      expect(useFlyStore.getState().diff).toBeNull();
    });

    it('clearDiff drops the diff', () => {
      useFlyStore.setState({diff: diffOf('a/x#main')});
      useFlyStore.getState().clearDiff();
      expect(useFlyStore.getState().diff).toBeNull();
    });

    it('mergePullRequest sets merging around the call and reloads the queue', async () => {
      useFlyStore.setState({error: 'old'});
      let release: () => void = () => {};
      vi.mocked(window.fly.pullRequests.merge).mockReturnValue(
        new Promise<void>(resolve => {
          release = resolve;
        }),
      );
      const pending = useFlyStore.getState().mergePullRequest('a/x#main');
      expect(useFlyStore.getState().merging).toBe(true);
      expect(useFlyStore.getState().error).toBeNull();
      await useFlyStore.getState().mergePullRequest('a/x#main');
      expect(window.fly.pullRequests.merge).toHaveBeenCalledTimes(1);
      release();
      await pending;
      expect(window.fly.pullRequests.merge).toHaveBeenCalledWith('a/x#main');
      expect(useFlyStore.getState().merging).toBe(false);
      expect(window.fly.queue.list).toHaveBeenCalledTimes(1);
    });

    it('mergePullRequest reports a rejection and stops merging', async () => {
      vi.mocked(window.fly.pullRequests.merge).mockRejectedValue(
        new Error('conflito'),
      );
      await useFlyStore.getState().mergePullRequest('a/x#main');
      expect(useFlyStore.getState().error).toBe('conflito');
      expect(useFlyStore.getState().merging).toBe(false);
      expect(window.fly.queue.list).not.toHaveBeenCalled();
    });

    it('setDiffPanel persists and stores the config', async () => {
      vi.mocked(window.fly.settings.set).mockResolvedValue({
        recentRoots: [],
        theme: 'system',
        diffPanel: 'collapsed',
      });
      await useFlyStore.getState().setDiffPanel('collapsed');
      expect(window.fly.settings.set).toHaveBeenCalledWith({
        diffPanel: 'collapsed',
      });
      expect(useFlyStore.getState().config.diffPanel).toBe('collapsed');
    });

    it('setDiffPanel reports a failure', async () => {
      vi.mocked(window.fly.settings.set).mockRejectedValue(new Error('no'));
      await useFlyStore.getState().setDiffPanel('collapsed');
      expect(useFlyStore.getState().error).toBe('no');
    });

    it('queueOf finds by id and returns null otherwise', () => {
      const item = {
        worktreeId: 'a',
        status: 'idle' as QueueStatus,
        pullRequest: null,
        receipt: null,
      };
      const snapshot: QueueSnapshot = {
        github: 'ok',
        message: null,
        worktrees: [item],
      };
      expect(queueOf(snapshot, 'a')).toBe(item);
      expect(queueOf(snapshot, 'b')).toBeNull();
    });
  });
});
