import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {AppShell} from '../../src/application/ui/app-shell';
import {useFlyStore} from '../../src/application/ui/state/fly-store';
import type {AppConfig} from '../../src/core/domain/settings';
import type {Workspace} from '../../src/core/domain/workspace';

const workspace: Workspace = {
  root: '/tmp/x',
  repos: [{id: 'repo-a', name: 'repo-a', group: '', path: '/tmp/x/repo-a'}],
  worktrees: [
    {
      id: 'w1',
      repoId: 'repo-a',
      path: '/tmp/x/repo-a',
      branch: 'main',
      head: 'abcdef1234',
      isMain: true,
    },
  ],
};

const config = (theme: AppConfig['theme']): AppConfig => ({
  recentRoots: [],
  theme,
});

const seed = (state: Partial<ReturnType<typeof useFlyStore.getState>>) => {
  vi.mocked(window.fly.settings.get).mockResolvedValue(config('dark'));
  vi.mocked(window.fly.workspace.onChanged).mockReturnValue(vi.fn());
  useFlyStore.setState({
    workspace: null,
    config: config('dark'),
    selectedWorktreeId: null,
    loading: false,
    error: null,
    ...state,
  });
};

const renderShell = async () => {
  render(<AppShell />);
  await act(async () => {});
};

const topBarEditorButton = () =>
  screen.getByText('Abrir no VSCode', {selector: 'button'});

describe('AppShell', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('renders the welcome panel without a workspace', async () => {
    seed({});
    await renderShell();
    expect(screen.getByRole('button', {name: /Abrir pasta/})).toBeVisible();
    expect(screen.queryByText('Sessão')).not.toBeInTheDocument();
  });

  it('bootstraps once and unsubscribes on unmount', async () => {
    seed({});
    const unsubscribe = vi.fn();
    vi.mocked(window.fly.workspace.onChanged).mockReturnValue(unsubscribe);
    const view = render(<AppShell />);
    await act(async () => {});
    expect(window.fly.settings.get).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('applies workspace pushes', async () => {
    seed({});
    await renderShell();
    const listener = vi.mocked(window.fly.workspace.onChanged).mock
      .calls[0]?.[0] as (ws: Workspace) => void;
    act(() => listener(workspace));
    expect(screen.getByText('Sessão')).toBeVisible();
  });

  it('renders panels, placeholders and footer with a workspace', async () => {
    seed({workspace});
    await renderShell();
    expect(screen.getByRole('navigation', {name: 'Worktrees'})).toBeVisible();
    expect(screen.getByText('Sessão')).toBeVisible();
    expect(screen.getByText('Terminal chega no marco 2')).toBeVisible();
    expect(screen.getByText('Diff / PR')).toBeVisible();
    expect(screen.getByText('Marco 4')).toBeVisible();
    expect(screen.getByText('Esperando você')).toBeVisible();
    expect(screen.getByText('Agente rodando')).toBeVisible();
    expect(screen.getByText('CI')).toBeVisible();
    expect(screen.getByText('Falhou')).toBeVisible();
    expect(screen.getByRole('button', {name: /Nova tarefa/})).toBeDisabled();
  });

  it('shows the empty-root state and reopens the picker', async () => {
    seed({workspace: {root: '/tmp/x', repos: [], worktrees: []}});
    vi.mocked(window.fly.workspace.pickFolder).mockResolvedValue(null);
    await renderShell();
    expect(screen.getByText('Nenhum repositório em /tmp/x')).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Abrir outra pasta'}));
    expect(window.fly.workspace.pickFolder).toHaveBeenCalledTimes(1);
  });

  it('toggles the theme through settings.set', async () => {
    seed({workspace});
    vi.mocked(window.fly.settings.set).mockResolvedValue(config('light'));
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Alternar tema'}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({theme: 'light'});
  });

  it('toggles from system using the resolved theme', async () => {
    seed({workspace, config: config('system')});
    vi.mocked(window.fly.settings.get).mockResolvedValue(config('system'));
    vi.mocked(window.fly.settings.set).mockResolvedValue(config('light'));
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Alternar tema'}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({theme: 'light'});
  });

  it('toggles light to dark', async () => {
    seed({workspace, config: config('light')});
    vi.mocked(window.fly.settings.get).mockResolvedValue(config('light'));
    vi.mocked(window.fly.settings.set).mockResolvedValue(config('dark'));
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Alternar tema'}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({theme: 'dark'});
  });

  it('opens the selected worktree from the top bar and shows breadcrumb', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.shell.openInEditor).mockResolvedValue();
    await renderShell();
    expect(screen.getByText('repo-a › main')).toBeVisible();
    await userEvent.setup().click(topBarEditorButton());
    expect(window.fly.shell.openInEditor).toHaveBeenCalledWith('/tmp/x/repo-a');
  });

  it('disables the top-bar editor button without a selection', async () => {
    seed({workspace});
    await renderShell();
    expect(topBarEditorButton()).toBeDisabled();
  });

  it('shows editor errors as an alert (stripped IPC prefix)', async () => {
    seed({workspace});
    vi.mocked(window.fly.shell.openInEditor).mockRejectedValue(
      new Error(
        "Error invoking remote method 'shell:open-in-editor': Error: sem code",
      ),
    );
    await renderShell();
    const rows = screen.getAllByRole('button', {name: 'Abrir no VSCode'});
    await userEvent.setup().click(rows[rows.length - 1] as HTMLElement);
    expect(await screen.findByRole('alert')).toHaveTextContent('sem code');
  });
});
