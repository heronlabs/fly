import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {SessionPanel} from '../../../src/application/ui/panels/session-panel';
import type {Session, SessionsSnapshot} from '../../../src/core/domain/session';
import type {Worktree} from '../../../src/core/domain/workspace';

vi.mock('../../../src/application/ui/terminal/terminal-view', () => ({
  TerminalView: ({sessionName}: {sessionName: string}) => (
    <div data-testid="terminal">{sessionName}</div>
  ),
}));

const worktree: Worktree = {
  id: 'w1',
  repoId: 'repo-a',
  path: '/tmp/x/repo-a',
  branch: 'main',
  head: 'abcdef1234',
  isMain: true,
};

const session = (name: string, worktreeId = 'w1'): Session => ({
  name,
  worktreeId,
  createdAt: 1,
  attachedClients: 0,
  origin: 'fly',
  task: null,
});

const snapshot = (sessions: Session[]): SessionsSnapshot => ({
  tmux: 'ok',
  message: null,
  sessions,
});

const setup = (overrides: Partial<Parameters<typeof SessionPanel>[0]> = {}) => {
  const props = {
    worktree,
    snapshot: snapshot([]),
    activeSessionName: null,
    theme: 'dark' as const,
    onStart: vi.fn(),
    onKill: vi.fn(),
    onSelectSession: vi.fn(),
    ...overrides,
  };
  render(<SessionPanel {...props} />);
  return props;
};

describe('SessionPanel', () => {
  it('Should ask for a worktree when none is selected', () => {
    setup({worktree: null});
    expect(screen.getByText('Selecione um worktree')).toBeVisible();
  });

  it('Should show the tmux message as an alert', () => {
    setup({
      snapshot: {
        tmux: 'missing',
        message: 'tmux não encontrado — instale com: brew install tmux',
        sessions: [session('a')],
      },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'tmux não encontrado — instale com: brew install tmux',
    );
    expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
  });

  it('Should offer to start a session when the worktree has none', async () => {
    const props = setup({snapshot: snapshot([session('b', 'other')])});
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Iniciar sessão'}));
    expect(props.onStart).toHaveBeenCalledWith('w1');
  });

  it('Should show the first session when the active one belongs elsewhere', () => {
    setup({
      snapshot: snapshot([session('a'), session('b', 'other')]),
      activeSessionName: 'b',
    });
    expect(screen.getByTestId('terminal')).toHaveTextContent('a');
    expect(screen.queryByText('Outras sessões')).not.toBeInTheDocument();
  });

  it('Should show the first session when none is active', () => {
    setup({snapshot: snapshot([session('a'), session('c')])});
    expect(screen.getByTestId('terminal')).toHaveTextContent('a');
  });

  it('Should switch between sessions of the worktree', async () => {
    const props = setup({
      snapshot: snapshot([session('a'), session('c')]),
      activeSessionName: 'c',
    });
    expect(screen.getByTestId('terminal')).toHaveTextContent('c');
    expect(screen.getByText('Outras sessões')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', {name: 'a'}));
    expect(props.onSelectSession).toHaveBeenCalledWith('a');
  });

  it('Should require confirmation before killing and allow cancelling', async () => {
    const user = userEvent.setup();
    const props = setup({snapshot: snapshot([session('a')])});
    await user.click(screen.getByRole('button', {name: 'Encerrar sessão'}));
    expect(props.onKill).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Cancelar'}));
    expect(screen.getByRole('button', {name: 'Encerrar sessão'})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Encerrar sessão'}));
    await user.click(screen.getByRole('button', {name: 'Confirmar'}));
    expect(props.onKill).toHaveBeenCalledWith('a');
  });
});
