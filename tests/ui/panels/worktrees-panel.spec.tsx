import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {WorktreesPanel} from '../../../src/application/ui/panels/worktrees-panel';
import type {QueueStatus} from '../../../src/core/domain/queue';
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
  statuses: Record<string, QueueStatus> = {},
) => {
  const onSelect = vi.fn();
  const onOpenInEditor = vi.fn();
  const onSearch = vi.fn();
  render(
    <WorktreesPanel
      workspace={workspace}
      selectedId={selectedId}
      onSelect={onSelect}
      onOpenInEditor={onOpenInEditor}
      onSearch={onSearch}
      sessionCounts={sessionCounts}
      statuses={statuses}
    />,
  );
  return {onSelect, onOpenInEditor, onSearch};
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

  it('Should search a worktree from its row without selecting it here', async () => {
    const {onSelect, onSearch} = setup('one-main');
    const user = userEvent.setup();
    const buttons = screen.getAllByRole('button', {name: 'Buscar na worktree'});
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute('aria-keyshortcuts', 'Meta+Shift+F');
    expect(buttons[1]).not.toHaveAttribute('aria-keyshortcuts');
    expect(buttons[0]).toHaveClass('fly-worktree-action');
    await user.click(buttons[1] as HTMLElement);
    expect(onSearch).toHaveBeenCalledExactlyOnceWith('one-feat');
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

  it('Should show the status badge only on the worktree that has a status', () => {
    setup(null, {}, {'one-feat': 'ready'});
    expect(screen.getAllByLabelText('Pronto para merge')).toHaveLength(1);
    expect(screen.getByText('merge')).toBeInTheDocument();
    expect(screen.getByRole('option', {name: /feat-x/})).toContainElement(
      screen.getByText('merge'),
    );
    expect(screen.getByRole('option', {name: /main/})).not.toHaveTextContent(
      'merge',
    );
  });

  it('Should render no badge for a worktree without status', () => {
    setup();
    expect(screen.queryByText('merge')).not.toBeInTheDocument();
    expect(screen.queryByText('?')).not.toBeInTheDocument();
  });
});
