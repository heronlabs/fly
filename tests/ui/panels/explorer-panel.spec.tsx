import {fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {ExplorerPanel} from '../../../src/application/ui/panels/explorer-panel';
import type {ExplorerTree} from '../../../src/application/ui/state/fly-store';
import type {FileFlag} from '../../../src/core/domain/files';
import type {Worktree} from '../../../src/core/domain/workspace';

const worktree: Worktree = {
  id: 'w1',
  repoId: 'repo-a',
  path: '/r/repo-a',
  branch: 'feat-x',
  head: 'abcdef1234',
  isMain: false,
};

const tree: ExplorerTree = {
  expanded: {src: true, docs: false, empty: true},
  entries: {
    '': [
      {name: 'docs', kind: 'dir'},
      {name: 'empty', kind: 'dir'},
      {name: 'src', kind: 'dir'},
      {name: 'gone.ts', kind: 'file'},
      {name: 'README.md', kind: 'file'},
    ],
    src: [
      {name: 'a.ts', kind: 'file'},
      {name: 'b.ts', kind: 'file'},
    ],
    empty: [],
  },
};

const flags: Record<string, FileFlag> = {
  'src/a.ts': 'A',
  'src/b.ts': 'M',
  'gone.ts': 'D',
  'docs/old.md': 'D',
};

const setup = (
  overrides: Partial<Parameters<typeof ExplorerPanel>[0]> = {},
) => {
  const props = {
    worktree,
    repoName: 'repo-a',
    tree,
    flags,
    error: null,
    activePath: null,
    onToggleDir: vi.fn(),
    onOpenFile: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ExplorerPanel {...props} />);
  return props;
};

const item = (name: string): HTMLElement => {
  const row = screen.getByText(name).closest<HTMLElement>('[role="treeitem"]');
  if (!row) throw new Error(`no treeitem for ${name}`);
  return row;
};

describe('ExplorerPanel', () => {
  it('renders the header with the changed count and the worktree', () => {
    setup();
    const nav = screen.getByRole('navigation', {name: 'Explorer'});
    expect(within(nav).getByText('Explorer')).toBeInTheDocument();
    expect(within(nav).getByText('4 alterados')).toBeInTheDocument();
    expect(within(nav).getByText('repo-a · feat-x')).toBeInTheDocument();
  });

  it('shows the short head of a detached worktree', () => {
    setup({worktree: {...worktree, branch: null}});
    expect(screen.getByText('repo-a · abcdef1')).toBeInTheDocument();
  });

  it('calls onClose from the close button', async () => {
    const props = setup();
    await userEvent.click(
      screen.getByRole('button', {name: 'Fechar explorer'}),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('toggles a directory by click, Enter and Space', async () => {
    const props = setup();
    await userEvent.click(item('docs'));
    expect(props.onToggleDir).toHaveBeenLastCalledWith('docs');
    item('src').focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onToggleDir).toHaveBeenLastCalledWith('src');
    await userEvent.keyboard(' ');
    expect(props.onToggleDir).toHaveBeenCalledTimes(3);
    await userEvent.keyboard('a');
    expect(props.onToggleDir).toHaveBeenCalledTimes(3);
  });

  it('marks directories as expanded or collapsed', () => {
    setup();
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(item('src')).toHaveAttribute('aria-expanded', 'true');
    expect(item('docs')).toHaveAttribute('aria-expanded', 'false');
    expect(item('README.md')).not.toHaveAttribute('aria-expanded');
  });

  it('renders the children of an expanded directory one level deeper', () => {
    setup();
    expect(item('src')).toHaveAttribute('aria-level', '1');
    expect(item('a.ts')).toHaveAttribute('aria-level', '2');
    expect(item('src')).toHaveStyle({paddingLeft: '8px'});
    expect(item('a.ts')).toHaveStyle({paddingLeft: '22px'});
    expect(screen.queryByText('old.md')).not.toBeInTheDocument();
  });

  it('shows a dot on directories that contain changes', () => {
    setup();
    expect(within(item('src')).getByTestId('changed-dot')).toBeInTheDocument();
    expect(within(item('docs')).getByTestId('changed-dot')).toBeInTheDocument();
    expect(
      within(item('empty')).queryByTestId('changed-dot'),
    ).not.toBeInTheDocument();
  });

  it('shows the kind chip and the flag letter of a file', () => {
    setup();
    expect(within(item('a.ts')).getByText('ts')).toHaveStyle({
      color: '#2396ed',
    });
    expect(within(item('a.ts')).getByText('A')).toHaveStyle({
      color: 'var(--ok)',
    });
    expect(within(item('b.ts')).getByText('M')).toHaveStyle({
      color: 'var(--warn)',
    });
    expect(within(item('README.md')).getByText('md')).toBeInTheDocument();
    expect(item('README.md')).toHaveTextContent(/^mdREADME\.md$/);
  });

  it('opens a file by click and by Enter', async () => {
    const props = setup();
    await userEvent.click(item('a.ts'));
    expect(props.onOpenFile).toHaveBeenLastCalledWith('src/a.ts');
    item('README.md').focus();
    await userEvent.keyboard('{Enter}');
    expect(props.onOpenFile).toHaveBeenLastCalledWith('README.md');
    expect(props.onToggleDir).not.toHaveBeenCalled();
  });

  it('marks the active file as selected', () => {
    setup({activePath: 'src/a.ts'});
    expect(item('a.ts')).toHaveAttribute('aria-selected', 'true');
    expect(item('a.ts')).toHaveStyle({backgroundColor: 'var(--active)'});
    expect(item('b.ts')).toHaveAttribute('aria-selected', 'false');
    expect(item('src')).not.toHaveAttribute('aria-selected');
  });

  it('highlights a row on hover', () => {
    setup();
    fireEvent.mouseEnter(item('b.ts'));
    expect(item('b.ts')).toHaveStyle({backgroundColor: 'var(--surface)'});
    fireEvent.mouseLeave(item('b.ts'));
    expect(item('b.ts')).not.toHaveStyle({backgroundColor: 'var(--surface)'});
  });

  it('shows Vazio for a listed directory without visible entries', () => {
    setup();
    expect(screen.getAllByText('Vazio')).toHaveLength(1);
    setup({
      tree: {expanded: {}, entries: {'': [{name: 'x', kind: 'file'}]}},
      flags: {x: 'D'},
    });
    expect(screen.getAllByText('Vazio')).toHaveLength(2);
  });

  it('renders no rows before the root is listed', () => {
    setup({tree: undefined});
    expect(screen.queryAllByRole('treeitem')).toEqual([]);
    expect(screen.queryByText('Vazio')).not.toBeInTheDocument();
  });

  it('shows the error text', () => {
    setup({error: 'git falhou: not a repo'});
    expect(screen.getByText('git falhou: not a repo')).toBeInTheDocument();
  });

  it('does not render a deleted path', () => {
    setup();
    expect(screen.queryByText('gone.ts')).not.toBeInTheDocument();
  });
});
