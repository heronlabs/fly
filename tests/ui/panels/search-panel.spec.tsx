import {act, fireEvent, render, screen, within} from '@testing-library/react';

import {SearchPanel} from '../../../src/application/ui/panels/search-panel';
import {
  SEARCH_DEBOUNCE_MS,
  type WorktreeSearch,
} from '../../../src/application/ui/state/fly-store';
import type {SearchQuery, SearchResult} from '../../../src/core/domain/search';
import type {Worktree} from '../../../src/core/domain/workspace';

const worktree: Worktree = {
  id: 'w1',
  repoId: 'repo-a',
  path: '/r/repo-a',
  branch: 'feat-x',
  head: 'abcdef1234',
  isMain: false,
};

const query = (text: string, over: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  ...over,
});

const found: SearchResult = {
  files: [
    {
      path: 'src/app.ts',
      matches: [
        {
          line: 3,
          range: [6, 9],
          preview: 'const foo = 1;',
          highlights: [[6, 9]],
        },
        {
          line: 12,
          range: [0, 3],
          preview: 'foo(foo)',
          highlights: [
            [0, 3],
            [4, 7],
          ],
        },
      ],
    },
    {
      path: 'README.md',
      matches: [{line: 1, range: null, preview: 'plain', highlights: []}],
    },
  ],
  total: 3,
  truncated: false,
};

const searchOf = (over: Partial<WorktreeSearch> = {}): WorktreeSearch => ({
  query: query('foo'),
  result: found,
  error: null,
  searching: false,
  ...over,
});

type Props = Parameters<typeof SearchPanel>[0];

const setup = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    worktree,
    repoName: 'repo-a',
    search: undefined,
    focusKey: 0,
    onSearch: vi.fn(),
    onOpenMatch: vi.fn(),
    onShowExplorer: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<SearchPanel {...props} />);
  return {
    props,
    view,
    rerender: (next: Partial<Props>) =>
      view.rerender(<SearchPanel {...props} {...next} />),
  };
};

const input = () =>
  screen.getByRole('textbox', {name: 'Buscar'}) as HTMLInputElement;

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the header with the worktree and an empty, focused input', () => {
    setup();
    const nav = screen.getByRole('navigation', {name: 'Busca'});
    expect(within(nav).getByText('Buscar', {selector: 'span'})).toBeVisible();
    expect(within(nav).getByText('repo-a · feat-x')).toBeVisible();
    expect(input()).toHaveValue('');
    expect(input()).toHaveFocus();
    expect(within(nav).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows the short head of a detached worktree', () => {
    setup({worktree: {...worktree, branch: null}});
    expect(screen.getByText('repo-a · abcdef1')).toBeVisible();
  });

  it('switches to the explorer and closes the column from the header', () => {
    const {props} = setup();
    fireEvent.click(screen.getByRole('button', {name: 'Mostrar explorer'}));
    expect(props.onShowExplorer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', {name: 'Fechar busca'}));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('searches the last typed text once the typing pauses', () => {
    const {props} = setup();
    fireEvent.change(input(), {target: {value: 'fo'}});
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    fireEvent.change(input(), {target: {value: 'foo'}});
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(props.onSearch).not.toHaveBeenCalled();
    expect(input()).toHaveValue('foo');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(props.onSearch).toHaveBeenCalledExactlyOnceWith(query('foo'));
  });

  it('searches at once on Enter and drops the pending search', () => {
    const {props} = setup();
    fireEvent.change(input(), {target: {value: 'foo'}});
    fireEvent.keyDown(input(), {key: 'Enter'});
    expect(props.onSearch).toHaveBeenCalledExactlyOnceWith(query('foo'));
    fireEvent.keyDown(input(), {key: 'a'});
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(props.onSearch).toHaveBeenCalledTimes(1);
  });

  it('flips each option, shows it pressed and searches at once', () => {
    const {props} = setup({search: searchOf()});
    const toggle = (name: string) => screen.getByRole('button', {name});
    expect(toggle('Diferenciar maiúsculas')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(toggle('Diferenciar maiúsculas'));
    expect(props.onSearch).toHaveBeenLastCalledWith(
      query('foo', {caseSensitive: true}),
    );
    fireEvent.click(toggle('Palavra inteira'));
    expect(props.onSearch).toHaveBeenLastCalledWith(
      query('foo', {caseSensitive: true, wholeWord: true}),
    );
    fireEvent.click(toggle('Expressão regular'));
    expect(props.onSearch).toHaveBeenLastCalledWith(
      query('foo', {caseSensitive: true, wholeWord: true, regex: true}),
    );
    for (const name of [
      'Diferenciar maiúsculas',
      'Palavra inteira',
      'Expressão regular',
    ]) {
      expect(toggle(name)).toHaveAttribute('aria-pressed', 'true');
    }
    fireEvent.click(toggle('Expressão regular'));
    expect(toggle('Expressão regular')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(props.onSearch).toHaveBeenCalledTimes(4);
  });

  it('cancels a pending search on unmount', () => {
    const {props, view} = setup();
    fireEvent.change(input(), {target: {value: 'foo'}});
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(props.onSearch).not.toHaveBeenCalled();
  });

  it('starts from the last query of the worktree and follows a switch', () => {
    const {rerender} = setup({
      search: searchOf({query: query('foo', {regex: true})}),
    });
    expect(input()).toHaveValue('foo');
    expect(
      screen.getByRole('button', {name: 'Expressão regular'}),
    ).toHaveAttribute('aria-pressed', 'true');
    rerender({worktree: {...worktree, id: 'w2'}, search: undefined});
    expect(input()).toHaveValue('');
    expect(
      screen.getByRole('button', {name: 'Expressão regular'}),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('refocuses and selects the input on each focus request', () => {
    const {rerender} = setup({search: searchOf()});
    input().blur();
    expect(input()).not.toHaveFocus();
    rerender({focusKey: 1});
    expect(input()).toHaveFocus();
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(3);
  });

  it('groups the hits by file with the count, line numbers and highlights', () => {
    const {view} = setup({search: searchOf()});
    expect(screen.getByText('3 resultados em 2 arquivos')).toBeVisible();
    const files = screen.getAllByRole('listitem');
    expect(files.map(file => file.getAttribute('aria-label'))).toEqual([
      'src/app.ts',
      'README.md',
    ]);
    const app = within(files[0] as HTMLElement);
    expect(app.getByText('app.ts')).toBeVisible();
    expect(app.getByText('src')).toBeVisible();
    expect(app.getByText('2')).toBeVisible();
    expect(app.getAllByRole('button').map(row => row.textContent)).toEqual([
      '3const foo = 1;',
      '12foo(foo)',
    ]);
    expect(
      [...view.container.querySelectorAll('mark')].map(m => m.textContent),
    ).toEqual(['foo', 'foo', 'foo']);
    const readme = within(files[1] as HTMLElement);
    expect(readme.getByText('README.md')).toBeVisible();
    expect(readme.getByRole('button')).toHaveTextContent('1plain');
  });

  it('opens a hit with its file and match', () => {
    const {props} = setup({search: searchOf()});
    fireEvent.click(screen.getByRole('button', {name: /^12/}));
    expect(props.onOpenMatch).toHaveBeenCalledExactlyOnceWith(
      'src/app.ts',
      found.files[0]?.matches[1],
    );
  });

  it('highlights a hit row on hover', () => {
    setup({search: searchOf()});
    const row = screen.getByRole('button', {name: /^3/});
    fireEvent.mouseEnter(row);
    expect(row).toHaveStyle({backgroundColor: 'var(--surface)'});
    fireEvent.mouseLeave(row);
    expect(row).not.toHaveStyle({backgroundColor: 'var(--surface)'});
  });

  it('counts a single hit in the singular', () => {
    setup({
      search: searchOf({
        result: {files: found.files.slice(1), total: 1, truncated: false},
      }),
    });
    expect(screen.getByText('1 resultado em 1 arquivo')).toBeVisible();
  });

  it('shows Nenhum resultado for an empty result', () => {
    setup({
      search: searchOf({result: {files: [], total: 0, truncated: false}}),
    });
    expect(screen.getByText('Nenhum resultado')).toBeVisible();
  });

  it('shows Buscando… over the previous results while searching', () => {
    setup({
      search: searchOf({searching: true, result: {...found, truncated: true}}),
    });
    expect(screen.getByText('Buscando…')).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(
      screen.queryByText('Resultados limitados; refine a busca'),
    ).not.toBeInTheDocument();
  });

  it('notes a truncated result', () => {
    setup({search: searchOf({result: {...found, truncated: true}})});
    expect(
      screen.getByText('Resultados limitados; refine a busca'),
    ).toBeVisible();
  });

  it('shows the error instead of a status', () => {
    setup({
      search: searchOf({result: null, error: 'git falhou: bad regex'}),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'git falhou: bad regex',
    );
    expect(screen.queryByText(/resultado/)).not.toBeInTheDocument();
  });
});
