import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {SessionPanel} from '../../../src/application/ui/panels/session-panel';
import type {Session, SessionsSnapshot} from '../../../src/core/domain/session';
import type {Worktree} from '../../../src/core/domain/workspace';

// Each rendered terminal's onExit, so a test can end its session.
const exits = vi.hoisted(() => new Map<string, (code: number) => void>());

vi.mock('../../../src/application/ui/terminal/terminal-view', () => ({
  TerminalView: ({
    sessionName,
    onExit,
  }: {
    sessionName: string;
    onExit?(code: number): void;
  }) => {
    if (onExit) exits.set(sessionName, onExit);
    return <div data-testid="terminal">{sessionName}</div>;
  },
}));

const exit = (name: string) => act(() => exits.get(name)?.(0));

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
  const view = render(<SessionPanel {...props} />);
  return {
    ...props,
    rerender: (next: Partial<typeof props>) =>
      view.rerender(<SessionPanel {...props} {...next} />),
  };
};

describe('SessionPanel', () => {
  beforeEach(() => exits.clear());

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

  describe('after the shown session exits', () => {
    it('Should keep the same terminal and offer to start once the session is gone', async () => {
      const props = setup({snapshot: snapshot([session('a')])});
      const terminal = screen.getByTestId('terminal');
      exit('a');
      expect(
        screen.getByRole('button', {name: 'Encerrar sessão'}),
      ).toBeVisible();

      props.rerender({snapshot: snapshot([])});

      expect(screen.getByTestId('terminal')).toBe(terminal);
      expect(terminal).toHaveTextContent('a');
      expect(
        screen.queryByRole('button', {name: 'Encerrar sessão'}),
      ).not.toBeInTheDocument();
      await userEvent
        .setup()
        .click(screen.getByRole('button', {name: 'Iniciar sessão'}));
      expect(props.onStart).toHaveBeenCalledWith('w1');
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    });

    it('Should let the user pick another session of the worktree', async () => {
      const props = setup({
        snapshot: snapshot([session('a'), session('c')]),
        activeSessionName: 'a',
      });
      exit('a');
      props.rerender({
        snapshot: snapshot([session('c')]),
        activeSessionName: null,
      });
      expect(screen.getByTestId('terminal')).toHaveTextContent('a');

      await userEvent.setup().click(screen.getByRole('button', {name: 'c'}));

      expect(props.onSelectSession).toHaveBeenCalledWith('c');
      expect(screen.getByTestId('terminal')).toHaveTextContent('c');
    });

    it('Should give way to a session started elsewhere for the same worktree', () => {
      const props = setup({snapshot: snapshot([session('a')])});
      exit('a');
      props.rerender({snapshot: snapshot([])});
      expect(screen.getByTestId('terminal')).toHaveTextContent('a');

      props.rerender({
        snapshot: snapshot([session('b')]),
        activeSessionName: 'b',
      });
      expect(screen.getByTestId('terminal')).toHaveTextContent('b');
      expect(screen.queryByText('Outras sessões')).not.toBeInTheDocument();

      props.rerender({snapshot: snapshot([]), activeSessionName: null});
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Iniciar sessão'}),
      ).toBeVisible();
    });

    it('Should forget the exited terminal when another worktree is selected', () => {
      const props = setup({snapshot: snapshot([session('a')])});
      exit('a');
      props.rerender({snapshot: snapshot([])});
      expect(screen.getByTestId('terminal')).toHaveTextContent('a');

      props.rerender({
        snapshot: snapshot([]),
        worktree: {...worktree, id: 'w2'},
      });
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();

      props.rerender({snapshot: snapshot([])});
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {name: 'Iniciar sessão'}),
      ).toBeVisible();
    });

    it('Should show the tmux alert and not bring the terminal back', () => {
      const props = setup({snapshot: snapshot([session('a')])});
      exit('a');
      props.rerender({
        snapshot: {tmux: 'error', message: 'boom', sessions: []},
      });
      expect(screen.getByRole('alert')).toHaveTextContent('boom');
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();

      props.rerender({snapshot: snapshot([])});
      expect(screen.queryByTestId('terminal')).not.toBeInTheDocument();
    });
  });
});
