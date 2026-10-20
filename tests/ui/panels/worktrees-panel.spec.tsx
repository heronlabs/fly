import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {WorktreesPanel} from '../../../src/application/ui/panels/worktrees-panel';
import type {Workspace} from '../../../src/core/domain/workspace';

const workspace: Workspace = {
  root: '/r',
  repos: [
    {id: 'actions/one', name: 'one', group: 'actions', path: '/r/actions/one'},
    {
      id: 'solo',
      name: 'solo',
      group: '',
      path: '/r/solo',
      error: 'Repositório inválido',
    },
  ],
  worktrees: [
    {
      id: 'one-feat',
      repoId: 'actions/one',
      path: '/w/feat',
      branch: 'feat-x',
      head: '1111111aaaa',
      isMain: false,
    },
    {
      id: 'one-main',
      repoId: 'actions/one',
      path: '/r/actions/one',
      branch: 'main',
      head: '2222222bbbb',
      isMain: true,
    },
    {
      id: 'one-det',
      repoId: 'actions/one',
      path: '/w/det',
      branch: null,
      head: '3333333cccc',
      isMain: false,
    },
  ],
};

const setup = (
  selectedId: string | null = null,
  sessionCounts: Record<string, number> = {},
) => {
  const onSelect = vi.fn();
  const onOpenInEditor = vi.fn();
  render(
    <WorktreesPanel
      workspace={workspace}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpenInEditor={onOpenInEditor}
      sessionCounts={sessionCounts}
    />,
  );
  return {onSelect, onOpenInEditor};
};

describe('WorktreesPanel', () => {
  it('renders group headers and repo names', () => {
    setup();
    expect(screen.getByText('actions')).toBeInTheDocument();
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('solo')).toBeInTheDocument();
  });

  it('shows the main worktree first', () => {
    setup();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('main');
  });

  it('shows a 7-char sha for a detached worktree', () => {
    setup();
    expect(screen.getByText('3333333')).toBeInTheDocument();
  });

  it('selects on click and on keyboard', async () => {
    const {onSelect} = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('option', {name: /feat-x/}));
    expect(onSelect).toHaveBeenCalledWith('one-feat');
    screen.getByRole('option', {name: /main/}).focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('one-main');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(3);
    await user.keyboard('a');
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it('marks the selected row', () => {
    setup('one-main');
    expect(screen.getByRole('option', {name: /main/})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', {name: /feat-x/})).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('shows a repo error', () => {
    setup();
    expect(screen.getByText('Repositório inválido')).toBeVisible();
  });

  it('opens in the editor without selecting the row', async () => {
    const {onSelect, onOpenInEditor} = setup();
    const user = userEvent.setup();
    const [button] = screen.getAllByRole('button', {name: 'Abrir no VSCode'});
    await user.click(button as HTMLElement);
    expect(onOpenInEditor).toHaveBeenCalledWith('/r/actions/one');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('Should show the session dot only on rows with a session', () => {
    setup(null, {'one-main': 1, 'one-feat': 0});
    expect(screen.getAllByLabelText('Sessão ativa')).toHaveLength(1);
    expect(screen.getByRole('option', {name: /main/})).toContainElement(
      screen.getByLabelText('Sessão ativa'),
    );
  });

  it('Should not show the session dot without sessions', () => {
    setup();
    expect(screen.queryByLabelText('Sessão ativa')).not.toBeInTheDocument();
  });
});
