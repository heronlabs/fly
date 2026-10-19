import {
  errorMessage,
  groupsOf,
  useFlyStore,
} from '../../../src/application/ui/state/fly-store';
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
});

describe('fly store', () => {
  it('bootstrap opens the first recent root', async () => {
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      recentRoots: ['/r', '/q'],
      theme: 'dark',
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
});
