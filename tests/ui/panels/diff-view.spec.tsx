import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {DiffView} from '../../../src/application/ui/panels/diff-view';
import type {Diff, DiffFile, WorktreeDiff} from '../../../src/core/domain/diff';

const file = (overrides: Partial<DiffFile> = {}): DiffFile => ({
  path: 'src/a.ts',
  oldPath: null,
  status: 'modified',
  binary: false,
  additions: 2,
  deletions: 1,
  lines: 5,
  hunks: [],
  truncated: false,
  ...overrides,
});

const result = (
  diff: Diff | null,
  error: string | null = null,
): WorktreeDiff => ({
  worktreeId: 'w1',
  scope: 'live',
  base: 'main',
  diff,
  error,
});

const renderView = (
  diff: WorktreeDiff | null,
  onOpenInEditor: (path: string) => void = () => {},
) =>
  render(
    <DiffView
      diff={diff}
      onOpenInEditor={onOpenInEditor}
      worktreePath="/r/repo"
    />,
  );

describe('DiffView', () => {
  it('Should render nothing while no diff is loaded', () => {
    const {container} = renderView(null);
    expect(container).toHaveTextContent('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Should explain the main worktree has no diff', () => {
    renderView(result(null));
    expect(screen.getByText('Este é o worktree principal')).toBeVisible();
  });

  it('Should show the error as an alert', () => {
    renderView(result(null, 'git quebrou'));
    expect(screen.getByRole('alert')).toHaveTextContent('git quebrou');
    expect(screen.queryByText('Este é o worktree principal')).toBeNull();
  });

  it('Should say there are no changes', () => {
    renderView(result({files: [], truncated: false}));
    expect(screen.getByText('Sem alterações')).toBeVisible();
    expect(screen.queryByText('Diff truncado')).toBeNull();
  });

  it('Should note a truncated diff', () => {
    renderView(result({files: [file()], truncated: true}));
    expect(screen.getByText('Diff truncado')).toBeVisible();
    expect(screen.queryByText('Sem alterações')).toBeNull();
  });

  it('Should render the file header with status, path and counts', () => {
    renderView(result({files: [file()], truncated: false}));
    expect(screen.getByText('modified')).toBeVisible();
    expect(screen.getByText('src/a.ts')).toBeVisible();
    expect(screen.getByText('+2 −1')).toBeVisible();
    expect(screen.queryByText(/renomeado de/)).toBeNull();
  });

  it('Should show where a renamed file came from', () => {
    renderView(
      result({
        files: [file({status: 'renamed', oldPath: 'src/old.ts'})],
        truncated: false,
      }),
    );
    expect(screen.getByText('renomeado de src/old.ts')).toBeVisible();
  });

  it('Should mark a binary file without hunks', () => {
    renderView(result({files: [file({binary: true})], truncated: false}));
    expect(screen.getByText('Arquivo binário')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Should offer the editor for a truncated file', async () => {
    const onOpenInEditor = vi.fn();
    renderView(
      result({
        files: [file({truncated: true, lines: 9000})],
        truncated: false,
      }),
      onOpenInEditor,
    );
    expect(screen.getByText('Arquivo grande (9000 linhas)')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {name: 'Abrir no VSCode'}),
    );
    expect(onOpenInEditor).toHaveBeenCalledExactlyOnceWith('/r/repo/src/a.ts');
  });

  it('Should render hunks with gutters and line backgrounds', () => {
    renderView(
      result({
        files: [
          file({
            hunks: [
              {
                header: '@@ -1,2 +1,2 @@',
                lines: [
                  {kind: 'context', text: 'keep', oldNo: 1, newNo: 1},
                  {kind: 'del', text: 'gone', oldNo: 2, newNo: null},
                  {kind: 'add', text: 'new', oldNo: null, newNo: 2},
                ],
              },
            ],
          }),
        ],
        truncated: false,
      }),
    );
    expect(screen.getByText('@@ -1,2 +1,2 @@')).toHaveStyle({
      color: 'var(--muted)',
    });
    const add = screen.getByText('new').closest('[data-kind]');
    expect(add).toHaveAttribute('data-kind', 'add');
    expect(add).toHaveStyle({backgroundColor: 'var(--diffAddBg)'});
    const del = screen.getByText('gone').closest('[data-kind]');
    expect(del).toHaveStyle({
      backgroundColor: 'var(--diffDelBg)',
      color: 'var(--diffDelFg)',
    });
    const context = screen.getByText('keep').closest('[data-kind]');
    expect(context?.getAttribute('style') ?? '').not.toContain('diffAddBg');
    expect(context?.getAttribute('style') ?? '').not.toContain('diffDelBg');
    expect(add).toHaveTextContent('2new');
    expect(del).toHaveTextContent('2gone');
    expect(context).toHaveTextContent('11keep');
  });
});
