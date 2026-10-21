import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {AppShell} from '../../src/application/ui/app-shell';
import {useFlyStore} from '../../src/application/ui/state/fly-store';
import type {QueueSnapshot} from '../../src/core/domain/queue';
import type {SessionsSnapshot} from '../../src/core/domain/session';
import type {AppConfig} from '../../src/core/domain/settings';
import type {Workspace} from '../../src/core/domain/workspace';

vi.mock('../../src/application/ui/terminal/terminal-view', () => ({
  TerminalView: ({sessionName}: {sessionName: string}) => (
    <div data-testid="terminal">{sessionName}</div>
  ),
}));

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

const emptySessions: SessionsSnapshot = {
  tmux: 'ok',
  message: null,
  sessions: [],
};

const emptyQueue: QueueSnapshot = {github: 'ok', message: null, worktrees: []};

const seed = (state: Partial<ReturnType<typeof useFlyStore.getState>>) => {
  vi.mocked(window.fly.settings.get).mockResolvedValue(config('dark'));
  vi.mocked(window.fly.workspace.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.sessions.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.sessions.list).mockResolvedValue(emptySessions);
  vi.mocked(window.fly.queue.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.queue.list).mockResolvedValue(emptyQueue);
  useFlyStore.setState({
    sessions: emptySessions,
    queue: emptyQueue,
    activeSessionName: null,
    startingSession: false,
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
    expect(screen.getByText('Selecione um worktree')).toBeVisible();
  });

  it('renders panels, placeholders and footer with a workspace', async () => {
    seed({workspace});
    await renderShell();
    expect(screen.getByRole('navigation', {name: 'Worktrees'})).toBeVisible();
    expect(screen.getByText('Selecione um worktree')).toBeVisible();
    expect(screen.getByText('Diff / PR')).toBeVisible();
    expect(screen.getByText('Marco 4')).toBeVisible();
    expect(screen.getByText('Esperando você')).toBeVisible();
    expect(screen.getByText('Agente rodando')).toBeVisible();
    expect(screen.getByText('CI')).toBeVisible();
    expect(screen.getByText('Falhou')).toBeVisible();
    expect(screen.getByRole('button', {name: /Nova tarefa/})).toBeEnabled();
  });

  it('Should pin the columns to the 1fr row with and without the alert', async () => {
    seed({workspace});
    await renderShell();
    const columns = screen.getByRole('navigation', {name: 'Worktrees'})
      .parentElement as HTMLElement;
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(columns).toHaveStyle({
      gridTemplateColumns: '320px 1fr 380px',
      gridRow: '2',
    });
    act(() => useFlyStore.setState({error: 'falhou'}));
    expect(screen.getByRole('alert')).toHaveTextContent('falhou');
    expect(columns).toHaveStyle({gridRow: '2'});
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

  it('Should unsubscribe from session pushes on unmount', async () => {
    seed({workspace});
    const unsubscribe = vi.fn();
    vi.mocked(window.fly.sessions.onChanged).mockReturnValue(unsubscribe);
    const view = render(<AppShell />);
    await act(async () => {});
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('Should unsubscribe from queue pushes on unmount', async () => {
    seed({workspace});
    const unsubscribe = vi.fn();
    vi.mocked(window.fly.queue.onChanged).mockReturnValue(unsubscribe);
    const view = render(<AppShell />);
    await act(async () => {});
    expect(window.fly.queue.onChanged).toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('Should apply queue pushes to the footer and the badges', async () => {
    seed({workspace});
    await renderShell();
    expect(screen.queryByText('merge')).not.toBeInTheDocument();
    const listener = vi.mocked(window.fly.queue.onChanged).mock
      .calls[0]?.[0] as (snapshot: QueueSnapshot) => void;
    act(() =>
      listener({
        github: 'missing',
        message: 'gh não encontrado — instale com: brew install gh',
        worktrees: [
          {worktreeId: 'w1', status: 'ready', pullRequest: null, receipt: null},
        ],
      }),
    );
    expect(screen.getByText('merge')).toBeVisible();
    expect(
      screen.getByText('Esperando você').previousSibling,
    ).toHaveTextContent('1');
    expect(screen.getByRole('status')).toHaveTextContent('gh não encontrado');
  });

  it('Should apply session pushes and render the terminal for the selected worktree', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    await renderShell();
    expect(screen.getByRole('button', {name: 'Iniciar sessão'})).toBeVisible();
    const listener = vi.mocked(window.fly.sessions.onChanged).mock
      .calls[0]?.[0] as (snapshot: SessionsSnapshot) => void;
    act(() =>
      listener({
        tmux: 'ok',
        message: null,
        sessions: [
          {
            name: 'repo-a-abc123',
            worktreeId: 'w1',
            createdAt: 1,
            attachedClients: 0,
            origin: 'fly',
            task: null,
          },
        ],
      }),
    );
    expect(screen.getByTestId('terminal')).toHaveTextContent('repo-a-abc123');
  });

  it('Should start a session for the selected worktree', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.sessions.start).mockResolvedValue('repo-a-abc123');
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Iniciar sessão'}));
    expect(window.fly.sessions.start).toHaveBeenCalledWith('w1');
  });

  it('Should kill a session after confirmation', async () => {
    const user = userEvent.setup();
    seed({
      workspace,
      selectedWorktreeId: 'w1',
      sessions: {
        tmux: 'ok',
        message: null,
        sessions: [
          {
            name: 'repo-a-abc123',
            worktreeId: 'w1',
            createdAt: 1,
            attachedClients: 0,
            origin: 'fly',
            task: null,
          },
          {
            name: 'repo-a-def456',
            worktreeId: 'w1',
            createdAt: 2,
            attachedClients: 0,
            origin: 'fly',
            task: null,
          },
        ],
      },
    });
    vi.mocked(window.fly.sessions.list).mockResolvedValue(emptySessions);
    vi.mocked(window.fly.sessions.kill).mockResolvedValue();
    await renderShell();
    await user.click(screen.getByRole('button', {name: 'repo-a-def456'}));
    expect(screen.getByTestId('terminal')).toHaveTextContent('repo-a-def456');
    await user.click(screen.getByRole('button', {name: 'Encerrar sessão'}));
    await user.click(screen.getByRole('button', {name: 'Confirmar'}));
    expect(window.fly.sessions.kill).toHaveBeenCalledWith('repo-a-def456');
  });

  it('Should open the dialog from the button, defaulting to the selected repo', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: /Nova tarefa/}));
    expect(screen.getByRole('dialog', {name: 'Nova tarefa'})).toBeVisible();
    expect(screen.getByLabelText('Repositório')).toHaveValue('repo-a');
  });

  it('Should open the dialog with Cmd+N', async () => {
    const user = userEvent.setup();
    seed({workspace});
    await renderShell();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('Should not open the dialog with Cmd+N when the workspace has no repos', async () => {
    const user = userEvent.setup();
    seed({workspace: {root: '/tmp/x', repos: [], worktrees: []}});
    await renderShell();
    await user.keyboard('{Meta>}n{/Meta}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: /Nova tarefa/})).toBeDisabled();
  });

  it('Should ignore other Cmd shortcuts', async () => {
    const user = userEvent.setup();
    seed({workspace});
    await renderShell();
    await user.keyboard('{Meta>}m{/Meta}n');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Should create the task and close the dialog', async () => {
    const user = userEvent.setup();
    seed({workspace});
    vi.mocked(window.fly.tasks.create).mockResolvedValue('repo-a-abc123');
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.type(screen.getByLabelText('Descrição'), 'corrigir bug');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(window.fly.tasks.create).toHaveBeenCalledWith({
      repoId: 'repo-a',
      description: 'corrigir bug',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Should keep the dialog open and show the error when creating fails', async () => {
    const user = userEvent.setup();
    seed({workspace});
    vi.mocked(window.fly.tasks.create).mockRejectedValue(
      new Error('Repositório não encontrado'),
    );
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    const dialog = screen.getByRole('dialog');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Repositório não encontrado',
    );
    expect(dialog).toContainElement(screen.getByRole('alert'));
  });

  it('Should cancel the dialog', async () => {
    const user = userEvent.setup();
    seed({workspace});
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Should clear the error after a failed create is retried successfully', async () => {
    const user = userEvent.setup();
    seed({workspace});
    vi.mocked(window.fly.tasks.create)
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce('repo-a-abc123');
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('falhou');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Should not leak a failed create error to the shell after cancelling', async () => {
    const user = userEvent.setup();
    seed({workspace});
    vi.mocked(window.fly.tasks.create).mockRejectedValue(new Error('falhou'));
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    await screen.findByRole('alert');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Should ignore repeated submits while the create is pending', async () => {
    const user = userEvent.setup();
    seed({workspace});
    let settle: (error?: Error) => void = () => undefined;
    vi.mocked(window.fly.tasks.create).mockReturnValue(
      new Promise((resolve, reject) => {
        settle = error => (error ? reject(error) : resolve('n'));
      }),
    );
    await renderShell();
    await user.click(screen.getByRole('button', {name: /Nova tarefa/}));
    await user.type(screen.getByLabelText('Descrição'), 'x');
    await user.click(screen.getByRole('button', {name: 'Iniciar'}));
    expect(screen.getByRole('button', {name: 'Iniciar'})).toBeDisabled();
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(window.fly.tasks.create).toHaveBeenCalledTimes(1);
    await act(async () => settle(new Error('falhou')));
    expect(screen.getByRole('button', {name: 'Iniciar'})).toBeEnabled();
  });
});
