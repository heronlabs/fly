import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {Ref} from 'react';

import {AppShell} from '../../src/application/ui/app-shell';
import {
  type OpenFile,
  useFlyStore,
} from '../../src/application/ui/state/fly-store';
import type {WorktreeDiff} from '../../src/core/domain/diff';
import type {FilesPoll} from '../../src/core/domain/files';
import type {QueueSnapshot} from '../../src/core/domain/queue';
import type {SessionsSnapshot} from '../../src/core/domain/session';
import type {AppConfig} from '../../src/core/domain/settings';
import type {Workspace} from '../../src/core/domain/workspace';

vi.mock('../../src/application/ui/terminal/terminal-view', () => ({
  TerminalView: ({sessionName}: {sessionName: string}) => (
    <div data-testid="terminal">{sessionName}</div>
  ),
}));

// The mocked editor's onDirty, so a test can make the shown file dirty, and
// a call counter for its reveal.
const editor = vi.hoisted(() => ({
  onDirty: null as ((dirty: boolean) => void) | null,
  revealed: vi.fn(),
}));

vi.mock('../../src/application/ui/editor/code-editor', async () => {
  const {useImperativeHandle} = await import('react');
  return {
    forgetEditorState: vi.fn(),
    CodeEditor: (props: {
      stateKey: string;
      onDirty(dirty: boolean): void;
      editorRef?: Ref<{
        getText(): string;
        reveal(line: number, range: [number, number] | null): void;
      }>;
    }) => {
      editor.onDirty = props.onDirty;
      useImperativeHandle(props.editorRef, () => ({
        getText: () => 'edited',
        reveal: (line, range) => editor.revealed(props.stateKey, line, range),
      }));
      return <div data-testid="code-editor">{props.stateKey}</div>;
    },
  };
});

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

const twoWorktrees: Workspace = {
  ...workspace,
  worktrees: [
    ...workspace.worktrees,
    {
      id: 'w2',
      repoId: 'repo-a',
      path: '/tmp/x/repo-a/.worktrees/b',
      branch: 'b',
      head: 'bcdef12345',
      isMain: false,
    },
  ],
};

const openTab = (worktreeId: string, path: string): OpenFile => ({
  worktreeId,
  path,
  content: {kind: 'text', path, text: 'x', eol: 'lf', mtimeMs: 1},
  dirty: false,
  diskState: 'same',
  revision: 0,
});

const config = (theme: AppConfig['theme']): AppConfig => ({
  recentRoots: [],
  theme,
  diffPanel: 'open',
  explorer: 'open',
  setupDone: false,
});

const emptySessions: SessionsSnapshot = {
  tmux: 'ok',
  message: null,
  sessions: [],
};

const emptyQueue: QueueSnapshot = {github: 'ok', message: null, worktrees: []};

const emptyDiff: WorktreeDiff = {
  worktreeId: 'w1',
  scope: 'live',
  base: null,
  diff: {files: [], truncated: false},
  error: null,
};

const emptyPoll: FilesPoll = {flags: {}, mtimes: {}, error: null};

const seed = (state: Partial<ReturnType<typeof useFlyStore.getState>>) => {
  vi.mocked(window.fly.settings.get).mockResolvedValue(config('dark'));
  vi.mocked(window.fly.workspace.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.sessions.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.sessions.list).mockResolvedValue(emptySessions);
  vi.mocked(window.fly.queue.onChanged).mockReturnValue(vi.fn());
  vi.mocked(window.fly.queue.list).mockResolvedValue(emptyQueue);
  vi.mocked(window.fly.diff.get).mockResolvedValue(emptyDiff);
  vi.mocked(window.fly.files.poll).mockResolvedValue(emptyPoll);
  vi.mocked(window.fly.files.list).mockResolvedValue([]);
  useFlyStore.setState({
    sessions: emptySessions,
    queue: emptyQueue,
    activeSessionName: null,
    startingSession: false,
    workspace: null,
    setup: null,
    config: config('dark'),
    selectedWorktreeId: null,
    loading: false,
    error: null,
    openFiles: [],
    activeFile: {},
    trees: {},
    flags: {},
    filesError: {},
    diskMtimes: {},
    saving: false,
    searches: {},
    reveal: null,
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

  it('takes a launch when main announces one and unsubscribes on unmount', async () => {
    seed({});
    const unsubscribe = vi.fn();
    vi.mocked(window.fly.launch.onRequested).mockReturnValue(unsubscribe);
    const view = render(<AppShell />);
    await act(async () => {});
    expect(window.fly.launch.take).toHaveBeenCalledTimes(1);
    vi.mocked(window.fly.launch.take).mockResolvedValue({
      root: '/tmp/x',
      worktreeId: 'w1',
    });
    vi.mocked(window.fly.workspace.open).mockResolvedValue(workspace);
    const listener = vi.mocked(window.fly.launch.onRequested).mock
      .calls[0]?.[0] as () => void;
    await act(async () => listener());
    expect(window.fly.workspace.open).toHaveBeenCalledWith('/tmp/x');
    expect(useFlyStore.getState().selectedWorktreeId).toBe('w1');
    view.unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('applies workspace pushes', async () => {
    seed({});
    await renderShell();
    const listener = vi.mocked(window.fly.workspace.onChanged).mock
      .calls[0]?.[0] as (ws: Workspace) => void;
    act(() => listener(workspace));
    expect(screen.getAllByText('Selecione um worktree').length).toBeGreaterThan(
      0,
    );
  });

  it('renders panels, placeholders and footer with a workspace', async () => {
    seed({workspace});
    await renderShell();
    expect(screen.getByRole('navigation', {name: 'Worktrees'})).toBeVisible();
    expect(screen.getAllByText('Selecione um worktree')).toHaveLength(2);
    expect(screen.queryByText('Marco 4')).not.toBeInTheDocument();
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
      gridTemplateColumns: '320px minmax(0, 1fr) 380px',
      gridRow: '2',
    });
    act(() => useFlyStore.setState({error: 'falhou'}));
    expect(screen.getByRole('alert')).toHaveTextContent('falhou');
    expect(columns).toHaveStyle({gridRow: '2'});
  });

  it('Should show the Diff tab and 3 columns when open', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.diff.get).mockResolvedValue(emptyDiff);
    await renderShell();
    expect(screen.getByRole('tab', {name: 'Diff'})).toBeVisible();
    expect(
      screen.getByRole('navigation', {name: 'Worktrees'}).parentElement,
    ).toHaveStyle({gridTemplateColumns: '320px 260px minmax(0, 1fr) 380px'});
  });

  it('Should drop the panel and its column when collapsed', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      ...config('dark'),
      diffPanel: 'collapsed',
      explorer: 'open',
      setupDone: false,
    });
    await renderShell();
    expect(screen.queryByRole('tab', {name: 'Diff'})).not.toBeInTheDocument();
    expect(
      screen.getByRole('navigation', {name: 'Worktrees'}).parentElement,
    ).toHaveStyle({gridTemplateColumns: '320px 260px minmax(0, 1fr)'});
    expect(screen.getByRole('button', {name: /Mostrar painel/})).toBeVisible();
  });

  it.each([
    ['w1', 'open', 'open', '320px 260px minmax(0, 1fr) 380px'],
    ['w1', 'open', 'collapsed', '320px 260px minmax(0, 1fr)'],
    ['w1', 'collapsed', 'open', '320px minmax(0, 1fr) 380px'],
    ['w1', 'collapsed', 'collapsed', '320px minmax(0, 1fr)'],
    [null, 'open', 'open', '320px minmax(0, 1fr) 380px'],
    [null, 'open', 'collapsed', '320px minmax(0, 1fr)'],
    [null, 'collapsed', 'open', '320px minmax(0, 1fr) 380px'],
    [null, 'collapsed', 'collapsed', '320px minmax(0, 1fr)'],
  ] as const)(
    'Should lay out selection %s, explorer %s, panel %s as %s',
    async (selectedWorktreeId, explorer, diffPanel, columns) => {
      seed({workspace, selectedWorktreeId});
      vi.mocked(window.fly.settings.get).mockResolvedValue({
        ...config('dark'),
        explorer,
        diffPanel,
      });
      await renderShell();
      expect(
        screen.getByRole('navigation', {name: 'Worktrees'}).parentElement,
      ).toHaveStyle({gridTemplateColumns: columns});
      expect(
        screen.queryByRole('navigation', {name: 'Explorer'}) !== null,
      ).toBe(selectedWorktreeId !== null && explorer === 'open');
    },
  );

  it('Should render the explorer after the worktrees with the repo and branch', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    await renderShell();
    const explorer = screen.getByRole('navigation', {name: 'Explorer'});
    expect(explorer.previousElementSibling).toBe(
      screen.getByRole('navigation', {name: 'Worktrees'}),
    );
    expect(explorer).toHaveTextContent('repo-a · main');
  });

  it('Should collapse the explorer and reopen it from the hamburger', async () => {
    const user = userEvent.setup();
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.settings.set)
      .mockResolvedValueOnce({...config('dark'), explorer: 'collapsed'})
      .mockResolvedValueOnce(config('dark'));
    await renderShell();
    await user.click(screen.getByRole('button', {name: 'Fechar explorer'}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({
      explorer: 'collapsed',
    });
    expect(
      screen.queryByRole('navigation', {name: 'Explorer'}),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Abrir explorer'}));
    expect(window.fly.settings.set).toHaveBeenLastCalledWith({
      explorer: 'open',
    });
    expect(screen.getByRole('navigation', {name: 'Explorer'})).toBeVisible();
  });

  it('Should search a worktree from its row and switch back to the explorer', async () => {
    const user = userEvent.setup();
    seed({workspace: twoWorktrees, selectedWorktreeId: 'w1'});
    await renderShell();
    const [, second] = screen.getAllByRole('button', {
      name: 'Buscar na worktree',
    });
    await user.click(second as HTMLElement);
    expect(useFlyStore.getState().selectedWorktreeId).toBe('w2');
    const search = screen.getByRole('navigation', {name: 'Busca'});
    expect(search.previousElementSibling).toBe(
      screen.getByRole('navigation', {name: 'Worktrees'}),
    );
    expect(search).toHaveTextContent('repo-a · b');
    expect(screen.getByRole('textbox', {name: 'Buscar'})).toHaveFocus();
    expect(
      screen.queryByRole('navigation', {name: 'Explorer'}),
    ).not.toBeInTheDocument();
    expect(window.fly.settings.set).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Mostrar explorer'}));
    expect(screen.getByRole('navigation', {name: 'Explorer'})).toBeVisible();
    expect(
      screen.queryByRole('navigation', {name: 'Busca'}),
    ).not.toBeInTheDocument();
  });

  it('Should open the search of the selected worktree with ⇧⌘F, opening the column', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.settings.get).mockResolvedValue({
      ...config('dark'),
      explorer: 'collapsed',
      setupDone: false,
    });
    vi.mocked(window.fly.settings.set).mockResolvedValue(config('dark'));
    await renderShell();
    expect(fireEvent.keyDown(window, {key: 'f', metaKey: true})).toBe(true);
    expect(window.fly.settings.set).not.toHaveBeenCalled();
    let handled = true;
    await act(async () => {
      handled = fireEvent.keyDown(window, {
        key: 'F',
        metaKey: true,
        shiftKey: true,
      });
    });
    expect(handled).toBe(false);
    expect(window.fly.settings.set).toHaveBeenCalledExactlyOnceWith({
      explorer: 'open',
    });
    expect(screen.getByRole('navigation', {name: 'Busca'})).toBeVisible();
    expect(screen.getByRole('textbox', {name: 'Buscar'})).toHaveFocus();
  });

  it('Should ignore ⇧⌘F without a selected worktree', async () => {
    seed({workspace});
    await renderShell();
    expect(
      fireEvent.keyDown(window, {key: 'f', metaKey: true, shiftKey: true}),
    ).toBe(true);
    expect(fireEvent.keyDown(window, {key: 'f', shiftKey: true})).toBe(true);
    expect(
      screen.queryByRole('navigation', {name: 'Busca'}),
    ).not.toBeInTheDocument();
  });

  it('Should search, open a hit in its tab and reveal it in the editor', async () => {
    const user = userEvent.setup();
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.files.search).mockResolvedValue({
      files: [
        {
          path: 'src/a.ts',
          matches: [
            {line: 7, range: [2, 5], preview: 'x foo', highlights: [[2, 5]]},
          ],
        },
      ],
      total: 1,
      truncated: false,
    });
    vi.mocked(window.fly.files.read).mockResolvedValue({
      kind: 'text',
      path: 'src/a.ts',
      text: 'saved',
      eol: 'lf',
      mtimeMs: 7,
    });
    await renderShell();
    await act(async () => {
      fireEvent.keyDown(window, {key: 'f', metaKey: true, shiftKey: true});
    });
    await user.type(
      screen.getByRole('textbox', {name: 'Buscar'}),
      'foo{Enter}',
    );
    expect(window.fly.files.search).toHaveBeenCalledWith('w1', {
      text: 'foo',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    });
    expect(screen.getByText('1 resultado em 1 arquivo')).toBeVisible();
    await user.click(screen.getByRole('button', {name: /^7/}));
    expect(window.fly.files.read).toHaveBeenCalledWith('w1', 'src/a.ts');
    expect(screen.getByRole('tab', {name: 'a.ts'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(editor.revealed).toHaveBeenCalledExactlyOnceWith(
      'w1\0src/a.ts',
      7,
      [2, 5],
    );
    expect(useFlyStore.getState().reveal).toBeNull();
  });

  it('Should not hand a reveal to another worktree', async () => {
    seed({
      workspace: twoWorktrees,
      selectedWorktreeId: 'w1',
      openFiles: [openTab('w1', 'a.ts')],
      activeFile: {w1: 'a.ts'},
      reveal: {worktreeId: 'w2', path: 'a.ts', line: 1, range: null},
    });
    await renderShell();
    expect(editor.revealed).not.toHaveBeenCalled();
    expect(useFlyStore.getState().reveal).not.toBeNull();
  });

  it('Should reopen the explorer, not the search, from the hamburger', async () => {
    const user = userEvent.setup();
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.settings.set)
      .mockResolvedValueOnce({...config('dark'), explorer: 'collapsed'})
      .mockResolvedValueOnce(config('dark'));
    await renderShell();
    await user.click(screen.getByRole('button', {name: 'Buscar na worktree'}));
    await user.click(screen.getByRole('button', {name: 'Fechar busca'}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({
      explorer: 'collapsed',
    });
    expect(
      screen.queryByRole('navigation', {name: 'Busca'}),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Abrir explorer'}));
    expect(screen.getByRole('navigation', {name: 'Explorer'})).toBeVisible();
  });

  it('Should list the root of a selected worktree once', async () => {
    seed({workspace});
    await renderShell();
    expect(window.fly.files.list).not.toHaveBeenCalled();
    await act(async () => useFlyStore.getState().select('w1'));
    expect(window.fly.files.list).toHaveBeenCalledTimes(1);
    expect(window.fly.files.list).toHaveBeenCalledWith('w1', '');
    await act(async () => useFlyStore.setState({error: 'x'}));
    expect(window.fly.files.list).toHaveBeenCalledTimes(1);
  });

  it('Should list the root when the tree exists without it', async () => {
    seed({
      workspace,
      selectedWorktreeId: 'w1',
      trees: {w1: {expanded: {src: true}, entries: {}}},
    });
    await renderShell();
    expect(window.fly.files.list).toHaveBeenCalledWith('w1', '');
  });

  it('Should not list a root that is already listed', async () => {
    seed({
      workspace,
      selectedWorktreeId: 'w1',
      trees: {w1: {expanded: {}, entries: {'': []}}},
    });
    await renderShell();
    expect(window.fly.files.list).not.toHaveBeenCalled();
  });

  it('Should poll the selected worktree with its open paths', async () => {
    seed({
      workspace,
      selectedWorktreeId: 'w1',
      openFiles: [openTab('w1', 'a.ts')],
    });
    await renderShell();
    expect(window.fly.files.poll).toHaveBeenCalledWith('w1', ['a.ts']);
  });

  it('Should show only the tabs of the selected worktree', async () => {
    seed({
      workspace: twoWorktrees,
      selectedWorktreeId: 'w1',
      openFiles: [openTab('w1', 'a.ts'), openTab('w2', 'b.ts')],
      activeFile: {w2: 'b.ts'},
    });
    await renderShell();
    expect(screen.getByRole('tab', {name: 'a.ts'})).toBeVisible();
    expect(screen.queryByRole('tab', {name: 'b.ts'})).not.toBeInTheDocument();
    expect(screen.getByRole('tab', {name: 'Sessão'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Should collapse every folder of the selected worktree from the explorer', async () => {
    const user = userEvent.setup();
    seed({
      workspace,
      selectedWorktreeId: 'w1',
      trees: {
        w1: {
          expanded: {src: true},
          entries: {
            '': [{name: 'src', kind: 'dir'}],
            src: [{name: 'a.ts', kind: 'file'}],
          },
        },
      },
    });
    await renderShell();
    expect(screen.getByRole('treeitem', {name: /a\.ts/})).toBeVisible();
    await user.click(screen.getByRole('button', {name: 'Recolher pastas'}));
    expect(
      screen.queryByRole('treeitem', {name: /a\.ts/}),
    ).not.toBeInTheDocument();
    expect(useFlyStore.getState().trees.w1?.expanded).toEqual({src: false});
  });

  it('Should close the saved, then all tabs of the selected worktree from the tab menu', async () => {
    const user = userEvent.setup();
    const rightClick = (name: string) =>
      user.pointer({
        keys: '[MouseRight]',
        target: screen.getByRole('tab', {name}),
      });
    seed({
      workspace: twoWorktrees,
      selectedWorktreeId: 'w1',
      openFiles: [
        openTab('w1', 'a.ts'),
        {...openTab('w1', 'b.ts'), dirty: true},
        openTab('w2', 'c.ts'),
      ],
      activeFile: {w1: 'a.ts', w2: 'c.ts'},
    });
    await renderShell();
    await rightClick('a.ts');
    await user.click(screen.getByRole('menuitem', {name: 'Fechar salvas'}));
    expect(screen.queryByRole('tab', {name: 'a.ts'})).not.toBeInTheDocument();
    expect(screen.getByRole('tab', {name: 'b.ts'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await rightClick('b.ts');
    await user.click(screen.getByRole('menuitem', {name: 'Fechar todas'}));
    await user.click(screen.getByRole('menuitem', {name: 'Descartar'}));
    expect(screen.queryByRole('tab', {name: 'b.ts'})).not.toBeInTheDocument();
    expect(screen.getByRole('tab', {name: 'Sessão'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(useFlyStore.getState().openFiles).toEqual([openTab('w2', 'c.ts')]);
    expect(useFlyStore.getState().activeFile).toEqual({w1: null, w2: 'c.ts'});
  });

  it('Should open a file from the explorer, save it with ⌘S and go back to the session', async () => {
    const user = userEvent.setup();
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.files.list).mockResolvedValue([
      {name: 'a.ts', kind: 'file'},
    ]);
    vi.mocked(window.fly.files.read).mockResolvedValue({
      kind: 'text',
      path: 'a.ts',
      text: 'saved',
      eol: 'lf',
      mtimeMs: 7,
    });
    vi.mocked(window.fly.files.write).mockResolvedValue({mtimeMs: 8});
    await renderShell();
    await user.click(screen.getByRole('treeitem', {name: /a\.ts/}));
    expect(window.fly.files.read).toHaveBeenCalledWith('w1', 'a.ts');
    expect(screen.getByRole('tab', {name: 'a.ts'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('code-editor')).toHaveTextContent('w1\0a.ts');
    act(() => editor.onDirty?.(true));
    expect(screen.getByText('Modificado')).toBeVisible();
    await act(async () => {
      fireEvent.keyDown(window, {key: 's', metaKey: true});
    });
    expect(window.fly.files.write).toHaveBeenCalledWith(
      'w1',
      'a.ts',
      'edited',
      'lf',
      7,
    );
    expect(screen.getByText('Salvo')).toBeVisible();
    await user.click(screen.getByRole('tab', {name: 'Sessão'}));
    expect(screen.queryByTestId('code-editor')).not.toBeInTheDocument();
  });

  it('Should collapse the panel through settings.set', async () => {
    seed({workspace});
    vi.mocked(window.fly.settings.set).mockResolvedValue({
      ...config('dark'),
      diffPanel: 'collapsed',
      explorer: 'open',
      setupDone: false,
    });
    await renderShell();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: /Esconder painel/}));
    expect(window.fly.settings.set).toHaveBeenCalledWith({
      diffPanel: 'collapsed',
    });
  });

  it('Should show an openExternal rejection as an alert', async () => {
    seed({workspace, selectedWorktreeId: 'w1'});
    vi.mocked(window.fly.diff.get).mockResolvedValue(emptyDiff);
    vi.mocked(window.fly.shell.openExternal).mockRejectedValue(
      new Error(
        "Error invoking remote method 'shell:open-external': Error: sem link",
      ),
    );
    useFlyStore.setState({
      queue: {
        github: 'ok',
        message: null,
        worktrees: [
          {
            worktreeId: 'w1',
            status: 'ci',
            task: null,
            canOpenPr: false,
            pullRequest: {
              number: 1,
              title: 't',
              url: 'https://github.com/o/r/pull/1',
              branch: 'b',
              state: 'open',
              draft: false,
              mergeable: 'mergeable',
              review: 'none',
              checks: 'pending',
              checkRuns: [],
              headSha: null,
              behind: false,
            },
          },
        ],
      },
    });
    await renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', {name: 'PR'}));
    await user.click(screen.getByRole('button', {name: '#1 t'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('sem link');
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
          {
            worktreeId: 'w1',
            status: 'ready',
            pullRequest: null,
            task: null,
            canOpenPr: false,
          },
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
      branch: 'corrigir-bug',
      model: null,
      attachments: [],
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
    vi.mocked(window.fly.workspace.refresh).mockResolvedValue(workspace);
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

  describe('setup wizard', () => {
    const open = {
      packaged: true,
      inApplications: true,
      bundlePath: '/Applications/fly.app',
      open: true,
    };

    it('renders only the wizard while setup is open, then the welcome screen', async () => {
      seed({});
      vi.mocked(window.fly.setup.info).mockResolvedValue(open);
      vi.mocked(window.fly.setup.doctor).mockResolvedValue({
        brew: true,
        tools: (['git', 'gh', 'tmux', 'claude'] as const).map(id => ({
          id,
          ok: true,
          version: '1',
          problem: null,
          fix: null,
        })),
      });
      vi.mocked(window.fly.setup.commandState).mockResolvedValue('installed');
      vi.mocked(window.fly.setup.installer).mockResolvedValue(null);
      vi.mocked(window.fly.setup.complete).mockResolvedValue(undefined);
      await renderShell();
      expect(screen.getByText('Passo 1 de 3')).toBeVisible();
      expect(
        screen.queryByRole('button', {name: /Abrir pasta/}),
      ).not.toBeInTheDocument();
      await userEvent.click(
        await screen.findByRole('button', {name: 'Continuar'}),
      );
      await userEvent.click(
        await screen.findByRole('button', {name: 'Continuar'}),
      );
      await userEvent.click(
        await screen.findByRole('button', {name: 'Começar'}),
      );
      expect(screen.getByRole('button', {name: /Abrir pasta/})).toBeVisible();
      expect(screen.queryByText(/Passo/)).not.toBeInTheDocument();
    });

    it('keeps the open wizard when a requested reload rejects', async () => {
      seed({});
      vi.mocked(window.fly.setup.info).mockResolvedValue(open);
      vi.mocked(window.fly.setup.doctor).mockResolvedValue({
        brew: true,
        tools: [],
      });
      await renderShell();
      expect(screen.getByText('Passo 1 de 3')).toBeVisible();
      vi.mocked(window.fly.setup.info).mockRejectedValue(new Error('x'));
      const listener = vi.mocked(window.fly.setup.onRequested).mock
        .calls[0]?.[0] as () => void;
      await act(async () => listener());
      expect(screen.getByText('Passo 1 de 3')).toBeVisible();
      vi.mocked(window.fly.setup.info).mockResolvedValue({
        ...open,
        open: false,
      });
      await act(async () => listener());
      expect(screen.getByText('Passo 1 de 3')).toBeVisible();
    });

    it('reloads setup when main requests it and unsubscribes on unmount', async () => {
      seed({});
      const unsubscribe = vi.fn();
      vi.mocked(window.fly.setup.onRequested).mockReturnValue(unsubscribe);
      vi.mocked(window.fly.setup.info).mockResolvedValue({
        ...open,
        open: false,
      });
      const view = render(<AppShell />);
      await act(async () => {});
      expect(screen.getByRole('button', {name: /Abrir pasta/})).toBeVisible();
      vi.mocked(window.fly.setup.info).mockResolvedValue({
        ...open,
        inApplications: false,
        bundlePath: '/Volumes/fly/fly.app',
      });
      const listener = vi.mocked(window.fly.setup.onRequested).mock
        .calls[0]?.[0] as () => void;
      await act(async () => listener());
      expect(
        screen.getByText('Arraste o fly para Aplicativos e abra de lá.'),
      ).toBeVisible();
      view.unmount();
      expect(unsubscribe).toHaveBeenCalled();
    });
  });
});
