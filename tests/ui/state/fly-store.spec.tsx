import {
  changedDirs,
  errorMessage,
  type ExplorerTree,
  FILES_POLL_MS,
  groupsOf,
  type OpenFile,
  openFilesOf,
  pathAncestors,
  queueCounts,
  queueOf,
  SEARCH_DEBOUNCE_MS,
  statusesOf,
  useFlyStore,
} from '../../../src/application/ui/state/fly-store';
import type {WorktreeDiff} from '../../../src/core/domain/diff';
import type {FileContent, FilesPoll} from '../../../src/core/domain/files';
import type {QueueSnapshot, QueueStatus} from '../../../src/core/domain/queue';
import type {
  SearchMatch,
  SearchQuery,
  SearchResult,
} from '../../../src/core/domain/search';
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
      explorer: 'open',
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
      explorer: 'open',
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

  it('bootstrap opens a pending launch instead of the recent root', async () => {
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      recentRoots: ['/q'],
      theme: 'system',
      diffPanel: 'open',
      explorer: 'open',
    });
    vi.mocked(window.fly.launch.take).mockResolvedValue({
      root: '/r',
      worktreeId: 'b#main',
    });
    vi.mocked(window.fly.workspace.open).mockResolvedValue(
      workspace(['a', 'b']),
    );
    await useFlyStore.getState().bootstrap();
    expect(window.fly.workspace.open).toHaveBeenCalledTimes(1);
    expect(window.fly.workspace.open).toHaveBeenCalledWith('/r');
    expect(useFlyStore.getState().selectedWorktreeId).toBe('b#main');
  });

  it('takeLaunch is false without a pending launch', async () => {
    expect(await useFlyStore.getState().takeLaunch()).toBe(false);
    expect(window.fly.workspace.open).not.toHaveBeenCalled();
  });

  it('takeLaunch opens the root and keeps the selection without a worktree', async () => {
    useFlyStore.setState({selectedWorktreeId: 'a#main'});
    vi.mocked(window.fly.launch.take).mockResolvedValue({
      root: '/r',
      worktreeId: null,
    });
    vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace(['a']));
    expect(await useFlyStore.getState().takeLaunch()).toBe(true);
    expect(useFlyStore.getState().workspace?.root).toBe('/r');
    expect(useFlyStore.getState().selectedWorktreeId).toBe('a#main');
  });

  it('takeLaunch selects nothing when the root failed to open', async () => {
    useFlyStore.setState({workspace: workspace(['a'])});
    vi.mocked(window.fly.launch.take).mockResolvedValue({
      root: '/other',
      worktreeId: 'a#main',
    });
    vi.mocked(window.fly.workspace.open).mockRejectedValue(new Error('no'));
    expect(await useFlyStore.getState().takeLaunch()).toBe(true);
    expect(useFlyStore.getState().selectedWorktreeId).toBeNull();
    expect(useFlyStore.getState().error).toBe('no');
  });

  it('takeLaunch reports a failed take and opens nothing', async () => {
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      recentRoots: ['/q'],
      theme: 'system',
      diffPanel: 'open',
      explorer: 'open',
    });
    vi.mocked(window.fly.launch.take).mockRejectedValue(
      new Error(
        "Error invoking remote method 'launch:take': Error: Pasta não encontrada: /x",
      ),
    );
    await useFlyStore.getState().bootstrap();
    expect(useFlyStore.getState().error).toBe('Pasta não encontrada: /x');
    expect(window.fly.workspace.open).not.toHaveBeenCalled();
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
      explorer: 'open',
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

    const created = {
      repoId: 'b/y',
      description: 'fazer',
      branch: 'x',
      model: null,
      attachments: [],
    };
    const withTask = (): Workspace => {
      const base = workspace(['a/x', 'b/y']);
      return {
        ...base,
        worktrees: [
          ...base.worktrees,
          {
            id: 'b/y#x',
            repoId: 'b/y',
            path: '/r/b/y/.worktrees/x',
            branch: 'x',
            head: 'abcdef123',
            isMain: false,
          },
        ],
      };
    };

    it('Should select the new worktree on createTask', async () => {
      useFlyStore.setState({workspace: workspace(['a/x', 'b/y'])});
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      vi.mocked(window.fly.workspace.refresh).mockResolvedValue(withTask());
      vi.mocked(window.fly.sessions.list).mockResolvedValue(
        snapshot([{name: 'task-1', worktreeId: 'b/y#x'}]),
      );
      const ok = await useFlyStore.getState().createTask(created);
      expect(ok).toBe(true);
      expect(window.fly.tasks.create).toHaveBeenCalledWith(created);
      expect(window.fly.workspace.refresh).toHaveBeenCalled();
      expect(useFlyStore.getState().selectedWorktreeId).toBe('b/y#x');
      expect(useFlyStore.getState().activeSessionName).toBe('task-1');
    });

    it('Should select the main worktree for a ship session', async () => {
      useFlyStore.setState({workspace: workspace(['a/x', 'b/y'])});
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      vi.mocked(window.fly.workspace.refresh).mockResolvedValue(withTask());
      vi.mocked(window.fly.sessions.list).mockResolvedValue(
        snapshot([{name: 'task-1', worktreeId: 'b/y#main'}]),
      );
      await useFlyStore.getState().createTask(created);
      expect(useFlyStore.getState().selectedWorktreeId).toBe('b/y#main');
    });

    it('Should fall back to the main worktree when the session is not listed', async () => {
      useFlyStore.setState({workspace: workspace(['a/x', 'b/y'])});
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      vi.mocked(window.fly.workspace.refresh).mockResolvedValue(
        workspace(['a/x', 'b/y']),
      );
      await useFlyStore.getState().createTask(created);
      expect(useFlyStore.getState().selectedWorktreeId).toBe('b/y#main');
    });

    it('Should keep the selection when the repo has no main worktree', async () => {
      useFlyStore.setState({
        workspace: workspace(['a/x']),
        selectedWorktreeId: 'a/x#main',
      });
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      await useFlyStore.getState().createTask({
        repoId: 'zzz',
        description: 'fazer',
        branch: 'x',
        model: null,
        attachments: [],
      });
      expect(useFlyStore.getState().selectedWorktreeId).toBe('a/x#main');
    });

    it('Should keep the selection when no workspace is open', async () => {
      vi.mocked(window.fly.tasks.create).mockResolvedValue('task-1');
      const ok = await useFlyStore.getState().createTask({
        repoId: 'a/x',
        description: 'fazer',
        branch: 'x',
        model: null,
        attachments: [],
      });
      expect(ok).toBe(true);
      expect(useFlyStore.getState().selectedWorktreeId).toBeNull();
    });

    it('Should set error and return false when createTask rejects', async () => {
      vi.mocked(window.fly.tasks.create).mockRejectedValue(
        new Error('Descreva a tarefa'),
      );
      const ok = await useFlyStore.getState().createTask({
        repoId: 'a/x',
        description: '',
        branch: '',
        model: null,
        attachments: [],
      });
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
        task: null,
        canOpenPr: false,
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

    it('openPullRequest forwards to the main process and propagates a refusal', async () => {
      vi.mocked(window.fly.pullRequests.open).mockResolvedValueOnce(undefined);
      await useFlyStore.getState().openPullRequest('a/x#main');
      expect(window.fly.pullRequests.open).toHaveBeenCalledWith('a/x#main');
      vi.mocked(window.fly.pullRequests.open).mockRejectedValueOnce(
        new Error('ocupada'),
      );
      await expect(
        useFlyStore.getState().openPullRequest('a/x#main'),
      ).rejects.toThrow('ocupada');
    });

    it("openPullRequest drops Electron's IPC prefix from a refusal", async () => {
      vi.mocked(window.fly.pullRequests.open).mockRejectedValueOnce(
        new Error("Error invoking remote method 'pr:open': Error: ocupada"),
      );
      await expect(
        useFlyStore.getState().openPullRequest('a/x#main'),
      ).rejects.toThrow(/^ocupada$/);
    });

    it('mergePullRequest reloads the workspace and then the queue after a merge', async () => {
      const order: string[] = [];
      vi.mocked(window.fly.pullRequests.merge).mockResolvedValue(undefined);
      vi.mocked(window.fly.workspace.refresh).mockImplementation(async () => {
        order.push('refresh');
        return workspace();
      });
      vi.mocked(window.fly.queue.list).mockImplementation(async () => {
        order.push('queue');
        return {github: 'ok', message: null, worktrees: []};
      });
      await useFlyStore.getState().mergePullRequest('a/x#main');
      expect(order).toEqual(['refresh', 'queue']);
    });

    it.each([
      ['rerun', 'pr:rerun'],
      ['resume', 'pr:resume'],
    ] as const)(
      '%sPullRequest forwards, propagates a refusal and drops the IPC prefix',
      async (name, channel) => {
        const method = `${name}PullRequest` as const;
        const call = vi.mocked(window.fly.pullRequests[name]);
        call.mockResolvedValueOnce(undefined);
        await useFlyStore.getState()[method]('a/x#main');
        expect(call).toHaveBeenCalledWith('a/x#main');
        expect(window.fly.workspace.refresh).not.toHaveBeenCalled();
        call.mockRejectedValueOnce(
          new Error(
            `Error invoking remote method '${channel}': Error: ocupada`,
          ),
        );
        await expect(
          useFlyStore.getState()[method]('a/x#main'),
        ).rejects.toThrow(/^ocupada$/);
      },
    );

    it('cleanPullRequest forwards the flag and then reloads the workspace', async () => {
      vi.mocked(window.fly.pullRequests.clean).mockResolvedValue(undefined);
      vi.mocked(window.fly.workspace.refresh).mockResolvedValue(workspace());
      await useFlyStore.getState().cleanPullRequest('a/x#main', true);
      expect(window.fly.pullRequests.clean).toHaveBeenCalledWith(
        'a/x#main',
        true,
      );
      expect(window.fly.workspace.refresh).toHaveBeenCalledTimes(1);
    });

    it('cleanPullRequest propagates a refusal without the IPC prefix and does not reload', async () => {
      vi.mocked(window.fly.pullRequests.clean).mockRejectedValue(
        new Error(
          "Error invoking remote method 'pr:clean': Error: Falha ao limpar: x",
        ),
      );
      await expect(
        useFlyStore.getState().cleanPullRequest('a/x#main', false),
      ).rejects.toThrow(/^Falha ao limpar: x$/);
      expect(window.fly.workspace.refresh).not.toHaveBeenCalled();
    });

    it('setDiffPanel persists and stores the config', async () => {
      vi.mocked(window.fly.settings.set).mockResolvedValue({
        recentRoots: [],
        theme: 'system',
        diffPanel: 'collapsed',
        explorer: 'open',
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
        task: null,
        canOpenPr: false,
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

describe('files', () => {
  const W = 'a/x#main';
  const textOf = (
    path: string,
    mtimeMs = 1,
    text = 'x',
  ): Extract<FileContent, {kind: 'text'}> => ({
    kind: 'text',
    path,
    text,
    eol: 'lf',
    mtimeMs,
  });
  const tab = (path: string, over: Partial<OpenFile> = {}): OpenFile => ({
    worktreeId: W,
    path,
    content: textOf(path),
    dirty: false,
    diskState: 'same',
    revision: 0,
    ...over,
  });
  const pollOf = (over: Partial<FilesPoll> = {}): FilesPoll => ({
    flags: {},
    mtimes: {},
    error: null,
    ...over,
  });
  const fileOf = (path: string, worktreeId = W) =>
    useFlyStore
      .getState()
      .openFiles.find(
        file => file.worktreeId === worktreeId && file.path === path,
      );
  const treeOf = (worktreeId = W) => useFlyStore.getState().trees[worktreeId];

  it('polls files every 3 s', () => {
    expect(FILES_POLL_MS).toBe(3000);
  });

  it('starts with no file state', () => {
    const state = useFlyStore.getState();
    expect(state.openFiles).toEqual([]);
    expect(state.activeFile).toEqual({});
    expect(state.trees).toEqual({});
    expect(state.flags).toEqual({});
    expect(state.filesError).toEqual({});
    expect(state.diskMtimes).toEqual({});
    expect(state.saving).toBe(false);
  });

  describe('tabs', () => {
    it('openFile reads once and activates; a second openFile only activates', async () => {
      vi.mocked(window.fly.files.read).mockResolvedValue(textOf('a.ts'));
      await useFlyStore.getState().openFile(W, 'a.ts');
      expect(window.fly.files.read).toHaveBeenCalledWith(W, 'a.ts');
      expect(useFlyStore.getState().openFiles).toEqual([
        tab('a.ts', {revision: expect.any(Number)}),
      ]);
      expect(useFlyStore.getState().activeFile[W]).toBe('a.ts');
      useFlyStore.getState().activateFile(W, null);
      expect(useFlyStore.getState().activeFile[W]).toBeNull();
      await useFlyStore.getState().openFile(W, 'a.ts');
      expect(window.fly.files.read).toHaveBeenCalledTimes(1);
      expect(useFlyStore.getState().openFiles).toHaveLength(1);
      expect(useFlyStore.getState().activeFile[W]).toBe('a.ts');
    });

    it('openFile gives a file reopened after a close or a prune a new revision', async () => {
      vi.mocked(window.fly.files.read).mockResolvedValue(textOf('a.ts'));
      useFlyStore.setState({workspace: workspace()});
      await useFlyStore.getState().openFile(W, 'a.ts');
      const first = fileOf('a.ts')?.revision;
      useFlyStore.getState().closeFile(W, 'a.ts');
      await useFlyStore.getState().openFile(W, 'a.ts');
      const second = fileOf('a.ts')?.revision;
      useFlyStore.getState().applyWorkspace(workspace(['b/y']));
      expect(fileOf('a.ts')).toBeUndefined();
      await useFlyStore.getState().openFile(W, 'a.ts');
      const third = fileOf('a.ts')?.revision;
      expect(new Set([first, second, third]).size).toBe(3);
    });

    it('openFile does not duplicate a tab opened while reading', async () => {
      vi.mocked(window.fly.files.read).mockResolvedValue(textOf('a.ts'));
      await Promise.all([
        useFlyStore.getState().openFile(W, 'a.ts'),
        useFlyStore.getState().openFile(W, 'a.ts'),
      ]);
      expect(useFlyStore.getState().openFiles).toHaveLength(1);
    });

    it('openFile reports a rejection and opens no tab', async () => {
      vi.mocked(window.fly.files.read).mockRejectedValue(
        new Error('Não é um arquivo'),
      );
      await useFlyStore.getState().openFile(W, 'dir');
      expect(useFlyStore.getState().error).toBe('Não é um arquivo');
      expect(useFlyStore.getState().openFiles).toEqual([]);
      expect(useFlyStore.getState().activeFile[W]).toBeUndefined();
    });

    it('closeFile activates the next tab, then the previous, then null', () => {
      const other = tab('b', {worktreeId: 'b/y#main'});
      useFlyStore.setState({
        openFiles: [tab('a'), tab('b'), other, tab('c')],
        activeFile: {[W]: 'b', 'b/y#main': 'b'},
      });
      useFlyStore.getState().closeFile(W, 'b');
      expect(useFlyStore.getState().activeFile[W]).toBe('c');
      useFlyStore.getState().closeFile(W, 'c');
      expect(useFlyStore.getState().activeFile[W]).toBe('a');
      useFlyStore.getState().closeFile(W, 'a');
      expect(useFlyStore.getState().activeFile[W]).toBeNull();
      expect(useFlyStore.getState().openFiles).toEqual([other]);
      expect(useFlyStore.getState().activeFile['b/y#main']).toBe('b');
    });

    it('closeFile drops the polled mtime of the closed path', () => {
      useFlyStore.setState({
        openFiles: [tab('a'), tab('b')],
        diskMtimes: {[W]: {a: 1, b: null}, 'b/y#main': {a: 2}},
      });
      useFlyStore.getState().closeFile(W, 'a');
      expect(useFlyStore.getState().diskMtimes).toEqual({
        [W]: {b: null},
        'b/y#main': {a: 2},
      });
    });

    it('closeFile without polled mtimes leaves them alone', () => {
      const diskMtimes = {'b/y#main': {a: 2}};
      useFlyStore.setState({openFiles: [tab('a')], diskMtimes});
      useFlyStore.getState().closeFile(W, 'a');
      expect(useFlyStore.getState().diskMtimes).toBe(diskMtimes);
    });

    it('closeFile of an inactive tab keeps the active one', () => {
      useFlyStore.setState({
        openFiles: [tab('a'), tab('b')],
        activeFile: {[W]: 'a'},
      });
      useFlyStore.getState().closeFile(W, 'b');
      expect(useFlyStore.getState().activeFile[W]).toBe('a');
      expect(useFlyStore.getState().openFiles).toEqual([tab('a')]);
    });

    it('closeFile of an unknown tab changes nothing', () => {
      const openFiles = [tab('a')];
      useFlyStore.setState({openFiles, activeFile: {[W]: 'a'}});
      useFlyStore.getState().closeFile(W, 'zzz');
      expect(useFlyStore.getState().openFiles).toBe(openFiles);
      expect(useFlyStore.getState().activeFile[W]).toBe('a');
    });

    it('setDirty flips only the matching tab', () => {
      const other = tab('a', {worktreeId: 'b/y#main'});
      useFlyStore.setState({openFiles: [tab('a'), other]});
      useFlyStore.getState().setDirty(W, 'a', true);
      expect(fileOf('a')?.dirty).toBe(true);
      expect(fileOf('a', 'b/y#main')).toBe(other);
    });

    it('saveFile writes with the eol and mtime, stores the new mtime and clears dirty and the error', async () => {
      useFlyStore.setState({
        error: 'Arquivo mudou no disco; recarregue antes de salvar',
        openFiles: [
          tab('a.ts', {
            dirty: true,
            content: {...textOf('a.ts', 5), eol: 'crlf'},
          }),
        ],
      });
      vi.mocked(window.fly.files.write).mockResolvedValue({mtimeMs: 9});
      const ok = await useFlyStore.getState().saveFile(W, 'a.ts', 'novo');
      expect(ok).toBe(true);
      expect(window.fly.files.write).toHaveBeenCalledWith(
        W,
        'a.ts',
        'novo',
        'crlf',
        5,
      );
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {
          content: {
            kind: 'text',
            path: 'a.ts',
            text: 'novo',
            eol: 'crlf',
            mtimeMs: 9,
          },
        }),
      );
      expect(useFlyStore.getState().saving).toBe(false);
      expect(useFlyStore.getState().error).toBeNull();
    });

    it('saveFile sends the saved mtime even when the file is missing', async () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts', {dirty: true, diskState: 'missing'})],
      });
      vi.mocked(window.fly.files.write).mockResolvedValue({mtimeMs: 3});
      await useFlyStore.getState().saveFile(W, 'a.ts', 'de volta');
      expect(window.fly.files.write).toHaveBeenCalledWith(
        W,
        'a.ts',
        'de volta',
        'lf',
        1,
      );
      expect(fileOf('a.ts')?.diskState).toBe('same');
    });

    it('saveFile ignores a second call while saving', async () => {
      useFlyStore.setState({openFiles: [tab('a.ts', {dirty: true})]});
      let finish: (result: {mtimeMs: number}) => void = () => undefined;
      vi.mocked(window.fly.files.write).mockReturnValueOnce(
        new Promise(resolve => {
          finish = resolve;
        }),
      );
      const first = useFlyStore.getState().saveFile(W, 'a.ts', 'um');
      expect(useFlyStore.getState().saving).toBe(true);
      expect(await useFlyStore.getState().saveFile(W, 'a.ts', 'dois')).toBe(
        false,
      );
      expect(window.fly.files.write).toHaveBeenCalledTimes(1);
      finish({mtimeMs: 2});
      expect(await first).toBe(true);
      expect(useFlyStore.getState().saving).toBe(false);
    });

    it('saveFile reports an mtime conflict, marks the dirty tab changed and returns false', async () => {
      const other = tab('a.ts', {worktreeId: 'b/y#main'});
      useFlyStore.setState({openFiles: [tab('a.ts', {dirty: true}), other]});
      vi.mocked(window.fly.files.write).mockRejectedValue(
        new Error(
          "Error invoking remote method 'file:write': Error: Arquivo mudou no disco; recarregue antes de salvar",
        ),
      );
      const ok = await useFlyStore.getState().saveFile(W, 'a.ts', 'novo');
      expect(ok).toBe(false);
      expect(useFlyStore.getState().error).toBe(
        'Arquivo mudou no disco; recarregue antes de salvar',
      );
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {dirty: true, diskState: 'changed'}),
      );
      expect(fileOf('a.ts', 'b/y#main')).toBe(other);
      expect(useFlyStore.getState().saving).toBe(false);
    });

    it('saveFile reports another rejection and leaves the tab alone', async () => {
      const openFiles = [tab('a.ts', {dirty: true, diskState: 'missing'})];
      useFlyStore.setState({openFiles});
      vi.mocked(window.fly.files.write).mockRejectedValue(
        new Error('EACCES: permission denied'),
      );
      const ok = await useFlyStore.getState().saveFile(W, 'a.ts', 'novo');
      expect(ok).toBe(false);
      expect(useFlyStore.getState().error).toBe('EACCES: permission denied');
      expect(useFlyStore.getState().openFiles).toBe(openFiles);
      expect(useFlyStore.getState().saving).toBe(false);
    });

    it('saveFile of a non-text or unknown tab returns false without writing', async () => {
      useFlyStore.setState({
        openFiles: [
          tab('img.png', {content: {kind: 'binary', path: 'img.png'}}),
        ],
      });
      expect(await useFlyStore.getState().saveFile(W, 'img.png', 'x')).toBe(
        false,
      );
      expect(await useFlyStore.getState().saveFile(W, 'nope', 'x')).toBe(false);
      expect(window.fly.files.write).not.toHaveBeenCalled();
      expect(useFlyStore.getState().saving).toBe(false);
    });

    it('reloadFile replaces the content, clears dirty and bumps revision', async () => {
      vi.mocked(window.fly.files.read).mockResolvedValueOnce(textOf('a.ts'));
      await useFlyStore.getState().openFile(W, 'a.ts');
      const opened = fileOf('a.ts')?.revision as number;
      useFlyStore.getState().setDirty(W, 'a.ts', true);
      vi.mocked(window.fly.files.read).mockResolvedValue(
        textOf('a.ts', 7, 'disco'),
      );
      await useFlyStore.getState().reloadFile(W, 'a.ts');
      expect(window.fly.files.read).toHaveBeenLastCalledWith(W, 'a.ts');
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {
          content: textOf('a.ts', 7, 'disco'),
          revision: expect.any(Number),
        }),
      );
      const reloaded = fileOf('a.ts')?.revision as number;
      expect(reloaded).toBeGreaterThan(opened);
      await useFlyStore.getState().reloadFile(W, 'a.ts');
      expect(fileOf('a.ts')?.revision).toBeGreaterThan(reloaded);
    });

    it('reloadFile reports a rejection', async () => {
      useFlyStore.setState({openFiles: [tab('a.ts')]});
      vi.mocked(window.fly.files.read).mockRejectedValue(new Error('sumiu'));
      await useFlyStore.getState().reloadFile(W, 'a.ts');
      expect(useFlyStore.getState().error).toBe('sumiu');
      expect(fileOf('a.ts')).toEqual(tab('a.ts'));
    });

    it('keepFile adopts the disk mtime and the next save expects it', async () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts', {dirty: true, diskState: 'changed'})],
      });
      useFlyStore.getState().keepFile(W, 'a.ts', 7);
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {dirty: true, content: textOf('a.ts', 7)}),
      );
      vi.mocked(window.fly.files.write).mockResolvedValue({mtimeMs: 8});
      await useFlyStore.getState().saveFile(W, 'a.ts', 'meu');
      expect(window.fly.files.write).toHaveBeenCalledWith(
        W,
        'a.ts',
        'meu',
        'lf',
        7,
      );
    });

    it('keepFile with a null mtime keeps the previous mtime', () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts', {dirty: true, diskState: 'changed'})],
      });
      useFlyStore.getState().keepFile(W, 'a.ts', null);
      expect(fileOf('a.ts')).toEqual(tab('a.ts', {dirty: true}));
    });

    it('keepFile on a non-text tab only clears the disk state', () => {
      const content: FileContent = {kind: 'large', path: 'big', bytes: 2e6};
      useFlyStore.setState({
        openFiles: [tab('big', {content, diskState: 'changed'})],
      });
      useFlyStore.getState().keepFile(W, 'big', 4);
      expect(fileOf('big')).toEqual(tab('big', {content}));
    });
  });

  describe('tree', () => {
    const entries = [{name: 'a.ts', kind: 'file' as const}];

    it('listDir stores the entries of the directory', async () => {
      vi.mocked(window.fly.files.list).mockResolvedValue(entries);
      await useFlyStore.getState().listDir(W, '');
      expect(window.fly.files.list).toHaveBeenCalledWith(W, '');
      expect(treeOf()).toEqual({expanded: {}, entries: {'': entries}});
    });

    it('listDir keeps the same tree for an identical listing', async () => {
      vi.mocked(window.fly.files.list).mockResolvedValue(entries);
      await useFlyStore.getState().listDir(W, '');
      const first = treeOf();
      vi.mocked(window.fly.files.list).mockResolvedValue([{...entries[0]!}]);
      await useFlyStore.getState().listDir(W, '');
      expect(treeOf()).toBe(first);
    });

    it('listDir reports a rejection in filesError', async () => {
      vi.mocked(window.fly.files.list).mockRejectedValue(new Error('EACCES'));
      await useFlyStore.getState().listDir(W, 'src');
      expect(useFlyStore.getState().filesError[W]).toBe(
        'Erro ao listar: EACCES',
      );
      expect(useFlyStore.getState().error).toBeNull();
    });

    it('toggleDir lists on every expand, not on collapse', async () => {
      // An ignored new file has no flag, so only a new listing shows it.
      const more = [...entries, {name: 'novo.log', kind: 'file' as const}];
      vi.mocked(window.fly.files.list)
        .mockResolvedValueOnce(entries)
        .mockResolvedValueOnce(more);
      await useFlyStore.getState().toggleDir(W, 'src');
      expect(treeOf()).toEqual({
        expanded: {src: true},
        entries: {src: entries},
      });
      await useFlyStore.getState().toggleDir(W, 'src');
      expect(treeOf()?.expanded.src).toBe(false);
      expect(window.fly.files.list).toHaveBeenCalledTimes(1);
      await useFlyStore.getState().toggleDir(W, 'src');
      expect(treeOf()).toEqual({expanded: {src: true}, entries: {src: more}});
      expect(vi.mocked(window.fly.files.list).mock.calls).toEqual([
        [W, 'src'],
        [W, 'src'],
      ]);
    });

    it('collapseDirs collapses every dir of one worktree and keeps its entries', () => {
      const other: ExplorerTree = {expanded: {src: true}, entries: {}};
      useFlyStore.setState({
        trees: {
          [W]: {
            expanded: {src: true, 'src/core': true, docs: false},
            entries: {src: entries},
          },
          other,
        },
      });
      useFlyStore.getState().collapseDirs(W);
      expect(treeOf()).toEqual({
        expanded: {src: false, 'src/core': false, docs: false},
        entries: {src: entries},
      });
      expect(treeOf('other')).toBe(other);
    });

    it('collapseDirs keeps the same trees when nothing is expanded', () => {
      useFlyStore.setState({
        trees: {[W]: {expanded: {src: false}, entries: {}}},
      });
      const trees = useFlyStore.getState().trees;
      useFlyStore.getState().collapseDirs(W);
      useFlyStore.getState().collapseDirs('none');
      expect(useFlyStore.getState().trees).toBe(trees);
    });

    it('collapseDirs keeps collapsed dirs out of the next poll', () => {
      useFlyStore.setState({
        workspace: workspace(),
        trees: {[W]: {expanded: {src: true}, entries: {}}},
      });
      useFlyStore.getState().collapseDirs(W);
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({flags: {'src/a.ts': 'M', 'lib/b.ts': 'A'}}));
      expect(treeOf()?.expanded).toEqual({src: false, lib: true});
      expect(result.list).toEqual(['', 'lib']);
    });

    it('setExplorer persists and stores the config', async () => {
      vi.mocked(window.fly.settings.set).mockResolvedValue({
        recentRoots: [],
        theme: 'system',
        diffPanel: 'open',
        explorer: 'collapsed',
      });
      await useFlyStore.getState().setExplorer('collapsed');
      expect(window.fly.settings.set).toHaveBeenCalledWith({
        explorer: 'collapsed',
      });
      expect(useFlyStore.getState().config.explorer).toBe('collapsed');
    });

    it('setExplorer reports a failure', async () => {
      vi.mocked(window.fly.settings.set).mockRejectedValue(new Error('no'));
      await useFlyStore.getState().setExplorer('collapsed');
      expect(useFlyStore.getState().error).toBe('no');
    });
  });

  describe('applyPoll', () => {
    beforeEach(() => {
      useFlyStore.setState({workspace: workspace()});
    });

    it('stores the flags and keeps the same object for equal flags', () => {
      useFlyStore.getState().applyPoll(W, pollOf({flags: {'a.ts': 'M'}}));
      const first = useFlyStore.getState().flags[W];
      expect(first).toEqual({'a.ts': 'M'});
      useFlyStore.getState().applyPoll(W, pollOf({flags: {'a.ts': 'M'}}));
      expect(useFlyStore.getState().flags[W]).toBe(first);
      useFlyStore.getState().applyPoll(W, pollOf({flags: {'a.ts': 'A'}}));
      expect(useFlyStore.getState().flags[W]).toEqual({'a.ts': 'A'});
    });

    it('stores the error in filesError and clears it', () => {
      useFlyStore
        .getState()
        .applyPoll(W, pollOf({error: 'git falhou: not a repo'}));
      expect(useFlyStore.getState().filesError[W]).toBe(
        'git falhou: not a repo',
      );
      useFlyStore.getState().applyPoll(W, pollOf());
      expect(useFlyStore.getState().filesError[W]).toBeNull();
    });

    it('a changed flag set auto-expands untouched ancestors and lists every expanded dir', () => {
      const tree: ExplorerTree = {
        expanded: {docs: true, lib: false},
        entries: {},
      };
      useFlyStore.setState({trees: {[W]: tree}});
      const result = useFlyStore
        .getState()
        .applyPoll(
          W,
          pollOf({flags: {'src/core/a.ts': 'A', 'lib/b.ts': 'M', 'c.ts': 'M'}}),
        );
      expect(treeOf()?.expanded).toEqual({
        docs: true,
        lib: false,
        src: true,
        'src/core': true,
      });
      expect(result).toEqual({
        reload: [],
        list: ['', 'docs', 'src', 'src/core'],
      });
    });

    it('creates the tree of a worktree that has none', () => {
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({flags: {'src/a.ts': 'A'}}));
      expect(treeOf()).toEqual({expanded: {src: true}, entries: {}});
      expect(result.list).toEqual(['', 'src']);
    });

    it('an unchanged flag set lists nothing', () => {
      useFlyStore.getState().applyPoll(W, pollOf({flags: {'src/a.ts': 'A'}}));
      const tree = treeOf();
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({flags: {'src/a.ts': 'M'}}));
      expect(result.list).toEqual([]);
      expect(treeOf()).toBe(tree);
      expect(useFlyStore.getState().flags[W]).toEqual({'src/a.ts': 'M'});
    });

    it('an empty first poll lists nothing', () => {
      const result = useFlyStore.getState().applyPoll(W, pollOf());
      expect(result).toEqual({reload: [], list: []});
      expect(treeOf()).toBeUndefined();
    });

    it('a deleted path does not auto-expand its ancestors', () => {
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({flags: {'old/x.ts': 'D'}}));
      expect(treeOf()?.expanded.old).toBeUndefined();
      expect(result.list).toEqual(['']);
    });

    it('a clean tab with a new mtime is reloaded, a dirty one becomes changed, null becomes missing', () => {
      const other = tab('a', {worktreeId: 'b/y#main'});
      useFlyStore.setState({
        openFiles: [
          tab('a'),
          tab('b', {dirty: true}),
          tab('c'),
          tab('d', {content: textOf('d', 4)}),
          tab('e', {content: {kind: 'binary', path: 'e'}}),
          tab('f', {content: {kind: 'binary', path: 'f'}}),
          tab('g'),
          other,
        ],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(
          W,
          pollOf({mtimes: {a: 2, b: 2, c: null, d: 4, e: 9, f: null}}),
        );
      expect(result).toEqual({reload: ['a'], list: []});
      expect(fileOf('a')).toEqual(tab('a'));
      expect(fileOf('b')?.diskState).toBe('changed');
      expect(fileOf('c')?.diskState).toBe('missing');
      expect(fileOf('d')?.diskState).toBe('same');
      expect(fileOf('e')?.diskState).toBe('same');
      expect(fileOf('f')?.diskState).toBe('missing');
      expect(fileOf('g')?.diskState).toBe('same');
      expect(fileOf('a', 'b/y#main')).toBe(other);
    });

    it('ignores a stale mtime older than the clean tab saved mtime', () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts', {content: textOf('a.ts', 200)})],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {'a.ts': 100}}));
      expect(result.reload).toEqual([]);
      expect(fileOf('a.ts')?.diskState).toBe('same');
    });

    it('ignores a stale mtime older than the dirty tab saved mtime', () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts', {dirty: true, content: textOf('a.ts', 200)})],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {'a.ts': 100}}));
      expect(result.reload).toEqual([]);
      expect(fileOf('a.ts')?.diskState).toBe('same');
    });

    it('a missing tab whose file exists again with an equal or older mtime is same', () => {
      useFlyStore.setState({
        openFiles: [
          tab('p', {content: textOf('p', 5), diskState: 'missing'}),
          tab('q', {content: textOf('q', 5), diskState: 'missing'}),
        ],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {p: 5, q: 3}}));
      expect(result.reload).toEqual([]);
      expect(fileOf('p')).toEqual(tab('p', {content: textOf('p', 5)}));
      expect(fileOf('q')).toEqual(tab('q', {content: textOf('q', 5)}));
    });

    it('a missing clean tab with a newer mtime is reloaded back to same', async () => {
      useFlyStore.setState({
        openFiles: [tab('p', {content: textOf('p', 5), diskState: 'missing'})],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {p: 9}}));
      expect(result.reload).toEqual(['p']);
      vi.mocked(window.fly.files.read).mockResolvedValue(textOf('p', 9));
      await useFlyStore.getState().reloadFile(W, 'p');
      expect(fileOf('p')).toEqual(
        tab('p', {content: textOf('p', 9), revision: expect.any(Number)}),
      );
      expect(fileOf('p')?.revision).toBeGreaterThan(0);
    });

    it('a missing dirty tab with a newer mtime becomes changed', () => {
      useFlyStore.setState({
        openFiles: [
          tab('p', {
            content: textOf('p', 5),
            dirty: true,
            diskState: 'missing',
          }),
        ],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {p: 9}}));
      expect(result.reload).toEqual([]);
      expect(fileOf('p')?.diskState).toBe('changed');
    });

    it('a missing non-text tab whose file exists again is same', () => {
      const content: FileContent = {kind: 'binary', path: 'img.png'};
      useFlyStore.setState({
        openFiles: [tab('img.png', {content, diskState: 'missing'})],
      });
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({mtimes: {'img.png': 4}}));
      expect(result.reload).toEqual([]);
      expect(fileOf('img.png')).toEqual(tab('img.png', {content}));
    });

    it('stores the polled mtimes and keeps the same object for equal mtimes', () => {
      useFlyStore.getState().applyPoll(W, pollOf({mtimes: {a: 1, b: null}}));
      const first = useFlyStore.getState().diskMtimes[W];
      expect(first).toEqual({a: 1, b: null});
      useFlyStore.getState().applyPoll(W, pollOf({mtimes: {a: 1, b: null}}));
      expect(useFlyStore.getState().diskMtimes[W]).toBe(first);
      useFlyStore.getState().applyPoll(W, pollOf({mtimes: {a: 2}}));
      expect(useFlyStore.getState().diskMtimes[W]).toEqual({a: 2});
    });

    it('keeps the tabs array when no tab changed', () => {
      const openFiles = [tab('a'), tab('b', {diskState: 'missing'})];
      useFlyStore.setState({openFiles});
      useFlyStore.getState().applyPoll(W, pollOf({mtimes: {a: 1, b: null}}));
      expect(useFlyStore.getState().openFiles).toBe(openFiles);
    });

    it('ignores a worktree that is not in the workspace', () => {
      const openFiles = [tab('a', {worktreeId: 'gone'})];
      useFlyStore.setState({openFiles});
      const result = useFlyStore.getState().applyPoll(
        'gone',
        pollOf({
          flags: {'src/a.ts': 'M'},
          mtimes: {a: null},
          error: 'git falhou: x',
        }),
      );
      expect(result).toEqual({reload: [], list: []});
      const state = useFlyStore.getState();
      expect(state.openFiles).toBe(openFiles);
      expect(state.flags).toEqual({});
      expect(state.trees).toEqual({});
      expect(state.filesError).toEqual({});
      expect(state.diskMtimes).toEqual({});
    });

    it('ignores every worktree when no workspace is open', () => {
      useFlyStore.setState({workspace: null});
      const result = useFlyStore
        .getState()
        .applyPoll(W, pollOf({flags: {'a.ts': 'M'}}));
      expect(result).toEqual({reload: [], list: []});
      expect(useFlyStore.getState().flags).toEqual({});
    });
  });

  describe('pollFiles', () => {
    beforeEach(() => {
      useFlyStore.setState({workspace: workspace()});
    });

    it('polls the open paths of the worktree and runs the follow-ups', async () => {
      useFlyStore.setState({
        openFiles: [tab('a.ts'), tab('z', {worktreeId: 'b/y#main'})],
      });
      vi.mocked(window.fly.files.poll).mockResolvedValue(
        pollOf({flags: {'src/b.ts': 'A'}, mtimes: {'a.ts': 2}}),
      );
      vi.mocked(window.fly.files.read).mockResolvedValue(
        textOf('a.ts', 2, 'novo'),
      );
      vi.mocked(window.fly.files.list).mockResolvedValue([]);
      await useFlyStore.getState().pollFiles(W);
      expect(window.fly.files.poll).toHaveBeenCalledWith(W, ['a.ts']);
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {
          content: textOf('a.ts', 2, 'novo'),
          revision: expect.any(Number),
        }),
      );
      expect(fileOf('a.ts')?.revision).toBeGreaterThan(0);
      expect(vi.mocked(window.fly.files.list).mock.calls).toEqual([
        [W, ''],
        [W, 'src'],
      ]);
    });

    it('does not reload a tab that became dirty while reading', async () => {
      useFlyStore.setState({openFiles: [tab('a.ts')]});
      vi.mocked(window.fly.files.poll).mockResolvedValue(
        pollOf({mtimes: {'a.ts': 2}}),
      );
      let finish: (content: FileContent) => void = () => undefined;
      vi.mocked(window.fly.files.read).mockReturnValueOnce(
        new Promise(resolve => {
          finish = resolve;
        }),
      );
      const pending = useFlyStore.getState().pollFiles(W);
      await vi.waitFor(() => expect(window.fly.files.read).toHaveBeenCalled());
      useFlyStore.getState().setDirty(W, 'a.ts', true);
      finish(textOf('a.ts', 2, 'disco'));
      await pending;
      expect(fileOf('a.ts')).toEqual(
        tab('a.ts', {dirty: true, diskState: 'changed'}),
      );
    });

    it('reports a reload rejection', async () => {
      useFlyStore.setState({openFiles: [tab('a.ts')]});
      vi.mocked(window.fly.files.poll).mockResolvedValue(
        pollOf({mtimes: {'a.ts': 2}}),
      );
      vi.mocked(window.fly.files.read).mockRejectedValue(new Error('sumiu'));
      await useFlyStore.getState().pollFiles(W);
      expect(useFlyStore.getState().error).toBe('sumiu');
    });

    it('reports a poll rejection in filesError', async () => {
      vi.mocked(window.fly.files.poll).mockRejectedValue(
        new Error('Worktree não encontrado'),
      );
      await useFlyStore.getState().pollFiles(W);
      expect(useFlyStore.getState().filesError[W]).toBe(
        'Worktree não encontrado',
      );
    });
  });

  describe('workspace and selection', () => {
    const tree: ExplorerTree = {expanded: {}, entries: {'': []}};

    it('applyWorkspace drops the file state of a removed worktree', () => {
      useFlyStore.setState({
        openFiles: [tab('a'), tab('b', {worktreeId: 'gone', dirty: true})],
        activeFile: {[W]: 'a', gone: 'b'},
        trees: {[W]: tree, gone: tree},
        flags: {[W]: {a: 'M'}, gone: {b: 'A'}},
        filesError: {[W]: null, gone: 'x'},
        diskMtimes: {[W]: {a: 1}, gone: {b: null}},
      });
      useFlyStore.getState().applyWorkspace(workspace());
      const state = useFlyStore.getState();
      expect(state.diskMtimes).toEqual({[W]: {a: 1}});
      expect(state.openFiles).toEqual([tab('a')]);
      expect(state.activeFile).toEqual({[W]: 'a'});
      expect(state.trees).toEqual({[W]: tree});
      expect(state.flags).toEqual({[W]: {a: 'M'}});
      expect(state.filesError).toEqual({[W]: null});
    });

    it('applyWorkspace keeps the file state when nothing was dropped', () => {
      const before = {
        openFiles: [tab('a')],
        activeFile: {[W]: 'a'},
        trees: {[W]: tree},
        flags: {[W]: {}},
        filesError: {[W]: null},
        diskMtimes: {[W]: {a: 1}},
      };
      useFlyStore.setState(before);
      useFlyStore.getState().applyWorkspace(workspace());
      const state = useFlyStore.getState();
      expect(state.diskMtimes).toBe(before.diskMtimes);
      expect(state.openFiles).toBe(before.openFiles);
      expect(state.activeFile).toBe(before.activeFile);
      expect(state.trees).toBe(before.trees);
      expect(state.flags).toBe(before.flags);
      expect(state.filesError).toBe(before.filesError);
    });

    const V = 'b/y#main';
    const fileState = (ids: string[]) => ({
      openFiles: ids.map(id => tab('a', {worktreeId: id, dirty: true})),
      activeFile: Object.fromEntries(ids.map(id => [id, 'a'])),
      trees: Object.fromEntries(ids.map(id => [id, tree])),
      flags: Object.fromEntries(ids.map(id => [id, {a: 'M' as const}])),
      filesError: Object.fromEntries(ids.map(id => [id, null])),
      diskMtimes: Object.fromEntries(ids.map(id => [id, {a: 1}])),
    });
    // The repo is kept with the error and no worktrees, as WorkspaceService
    // returns it when `git worktree list` fails.
    const failed = (next: Workspace, repoId: string): Workspace => ({
      ...next,
      repos: next.repos.map(repo =>
        repo.id === repoId ? {...repo, error: 'git falhou: index.lock'} : repo,
      ),
      worktrees: next.worktrees.filter(w => w.repoId !== repoId),
    });
    const fileStateOf = () => {
      const {openFiles, activeFile, trees, flags, filesError, diskMtimes} =
        useFlyStore.getState();
      return {openFiles, activeFile, trees, flags, filesError, diskMtimes};
    };

    it('applyWorkspace keeps the file state of a repo whose discovery failed', () => {
      const before = fileState([W, V]);
      useFlyStore.setState({workspace: workspace(['a/x', 'b/y']), ...before});
      useFlyStore
        .getState()
        .applyWorkspace(failed(workspace(['a/x', 'b/y']), 'a/x'));
      expect(fileStateOf()).toEqual(before);
      expect(useFlyStore.getState().openFiles).toBe(before.openFiles);
    });

    it('applyWorkspace prunes a gone worktree of a repo listed without error', () => {
      const previous = workspace(['a/x']);
      const feature = 'a/x#feat';
      useFlyStore.setState({
        workspace: {
          ...previous,
          worktrees: [
            ...previous.worktrees,
            {...previous.worktrees[0]!, id: feature, isMain: false},
          ],
        },
        ...fileState([W, feature]),
      });
      useFlyStore.getState().applyWorkspace(workspace(['a/x']));
      expect(fileStateOf()).toEqual(fileState([W]));
    });

    it('applyWorkspace prunes the worktrees of a repo that vanished, even beside a failed one', () => {
      useFlyStore.setState({
        workspace: workspace(['a/x', 'b/y']),
        ...fileState([W, V]),
      });
      useFlyStore.getState().applyWorkspace(failed(workspace(['a/x']), 'a/x'));
      expect(fileStateOf()).toEqual(fileState([W]));
    });

    it('select keeps the tabs of every worktree', () => {
      const openFiles = [tab('a'), tab('b', {worktreeId: 'b/y#main'})];
      const activeFile = {[W]: 'a', 'b/y#main': 'b'};
      useFlyStore.setState({openFiles, activeFile, selectedWorktreeId: W});
      useFlyStore.getState().select('b/y#main');
      expect(useFlyStore.getState().openFiles).toBe(openFiles);
      expect(useFlyStore.getState().activeFile).toBe(activeFile);
    });
  });

  describe('helpers', () => {
    it('pathAncestors lists the directories above a path, root excluded', () => {
      expect(pathAncestors('')).toEqual([]);
      expect(pathAncestors('a.ts')).toEqual([]);
      expect(pathAncestors('a/b/c.ts')).toEqual(['a', 'a/b']);
    });

    it('changedDirs collects every ancestor of a flagged path, deletions included', () => {
      expect(
        changedDirs({'a/b/c.ts': 'M', 'd/e.ts': 'D', 'f.ts': 'A'}),
      ).toEqual(new Set(['a', 'a/b', 'd']));
      expect(changedDirs({})).toEqual(new Set());
    });

    it('openFilesOf keeps the tabs of one worktree in order', () => {
      const tabs = [tab('b'), tab('x', {worktreeId: 'b/y#main'}), tab('a')];
      useFlyStore.setState({openFiles: tabs});
      expect(
        openFilesOf(useFlyStore.getState(), W).map(file => file.path),
      ).toEqual(['b', 'a']);
    });
  });
});

describe('search', () => {
  const W = 'a/x#main';
  const query = (text: string): SearchQuery => ({
    text,
    caseSensitive: false,
    wholeWord: false,
    regex: false,
  });
  const resultOf = (total: number): SearchResult => ({
    files: [],
    total,
    truncated: false,
  });
  const match: SearchMatch = {
    line: 4,
    range: [1, 3],
    preview: 'x foo',
    highlights: [[2, 5]],
  };
  const searchOf = () => useFlyStore.getState().searches[W];
  const deferred = <T,>() => {
    let resolve: (value: T) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return {promise, resolve, reject};
  };

  it('debounces typing by 300 ms and starts with no search state', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(useFlyStore.getState().searches).toEqual({});
    expect(useFlyStore.getState().reveal).toBeNull();
  });

  it('searchFiles marks the worktree searching, then stores the result', async () => {
    const pending = deferred<SearchResult>();
    vi.mocked(window.fly.files.search).mockReturnValue(pending.promise);
    const q = query('foo');
    const done = useFlyStore.getState().searchFiles(W, q);
    expect(window.fly.files.search).toHaveBeenCalledExactlyOnceWith(W, q);
    expect(searchOf()).toEqual({
      query: q,
      result: null,
      error: null,
      searching: true,
    });
    pending.resolve(resultOf(2));
    await done;
    expect(searchOf()).toEqual({
      query: q,
      result: resultOf(2),
      error: null,
      searching: false,
    });
  });

  it('searchFiles keeps the previous result on screen while the next runs', async () => {
    vi.mocked(window.fly.files.search).mockResolvedValueOnce(resultOf(1));
    await useFlyStore.getState().searchFiles(W, query('a'));
    const pending = deferred<SearchResult>();
    vi.mocked(window.fly.files.search).mockReturnValueOnce(pending.promise);
    const done = useFlyStore.getState().searchFiles(W, query('ab'));
    expect(searchOf()).toMatchObject({result: resultOf(1), searching: true});
    pending.resolve(resultOf(0));
    await done;
    expect(searchOf()).toMatchObject({result: resultOf(0), searching: false});
  });

  it('searchFiles clears the worktree for an empty query without IPC', async () => {
    vi.mocked(window.fly.files.search).mockResolvedValueOnce(resultOf(1));
    await useFlyStore.getState().searchFiles(W, query('a'));
    await useFlyStore.getState().searchFiles(W, query(''));
    expect(window.fly.files.search).toHaveBeenCalledTimes(1);
    expect(searchOf()).toEqual({
      query: query(''),
      result: null,
      error: null,
      searching: false,
    });
  });

  it('searchFiles drops a response whose query is no longer the last one', async () => {
    const slow = deferred<SearchResult>();
    const fast = deferred<SearchResult>();
    vi.mocked(window.fly.files.search)
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    const first = useFlyStore.getState().searchFiles(W, query('a'));
    const second = useFlyStore.getState().searchFiles(W, query('ab'));
    fast.resolve(resultOf(1));
    await second;
    slow.resolve(resultOf(9));
    await first;
    expect(searchOf()).toEqual({
      query: query('ab'),
      result: resultOf(1),
      error: null,
      searching: false,
    });
  });

  it('searchFiles drops a stale rejection too and keeps other worktrees', async () => {
    const slow = deferred<SearchResult>();
    vi.mocked(window.fly.files.search)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(resultOf(3));
    useFlyStore.setState({
      searches: {
        other: {query: query('z'), result: null, error: null, searching: false},
      },
    });
    const first = useFlyStore.getState().searchFiles(W, query('a'));
    await useFlyStore.getState().searchFiles(W, query('ab'));
    slow.reject(new Error('git falhou: late'));
    await first;
    expect(searchOf()).toMatchObject({result: resultOf(3), error: null});
    expect(useFlyStore.getState().searches['other']?.query).toEqual(query('z'));
  });

  it('searchFiles stores a rejection without the IPC prefix and no result', async () => {
    vi.mocked(window.fly.files.search).mockRejectedValue(
      new Error(
        "Error invoking remote method 'file:search': Error: git falhou: bad",
      ),
    );
    await useFlyStore.getState().searchFiles(W, query('('));
    expect(searchOf()).toEqual({
      query: query('('),
      result: null,
      error: 'git falhou: bad',
      searching: false,
    });
    expect(useFlyStore.getState().error).toBeNull();
  });

  it('openMatch opens the file and asks to reveal the hit', async () => {
    vi.mocked(window.fly.files.read).mockResolvedValue({
      kind: 'text',
      path: 'src/a.ts',
      text: 'x',
      eol: 'lf',
      mtimeMs: 1,
    });
    await useFlyStore.getState().openMatch(W, 'src/a.ts', match);
    expect(window.fly.files.read).toHaveBeenCalledWith(W, 'src/a.ts');
    expect(useFlyStore.getState().activeFile[W]).toBe('src/a.ts');
    expect(useFlyStore.getState().reveal).toEqual({
      worktreeId: W,
      path: 'src/a.ts',
      line: 4,
      range: [1, 3],
    });
    useFlyStore.getState().clearReveal();
    expect(useFlyStore.getState().reveal).toBeNull();
  });

  it('openMatch reveals nothing when the file cannot be opened', async () => {
    vi.mocked(window.fly.files.read).mockRejectedValue(
      new Error('Não é um arquivo'),
    );
    await useFlyStore.getState().openMatch(W, 'gone.ts', match);
    expect(useFlyStore.getState().error).toBe('Não é um arquivo');
    expect(useFlyStore.getState().reveal).toBeNull();
  });

  it('applyWorkspace drops the search of a removed worktree and keeps the map otherwise', () => {
    const kept = {
      query: query('a'),
      result: null,
      error: null,
      searching: false,
    };
    const searches = {[W]: kept};
    useFlyStore.setState({searches});
    useFlyStore.getState().applyWorkspace(workspace());
    expect(useFlyStore.getState().searches).toBe(searches);
    useFlyStore.setState({searches: {[W]: kept, gone: kept}});
    useFlyStore.getState().applyWorkspace(workspace());
    expect(useFlyStore.getState().searches).toEqual({[W]: kept});
  });
});
