import {act, fireEvent, render, screen} from '@testing-library/react';
import type {Ref} from 'react';

import {
  type CodeEditorHandle,
  forgetEditorState,
} from '../../../src/application/ui/editor/code-editor';
import {WorkbenchPanel} from '../../../src/application/ui/panels/workbench-panel';
import {
  FILES_POLL_MS,
  type OpenFile,
} from '../../../src/application/ui/state/fly-store';
import type {Worktree} from '../../../src/core/domain/workspace';

type EditorProps = {
  stateKey: string;
  onDirty(dirty: boolean): void;
  editorRef?: Ref<CodeEditorHandle>;
};

const mocks = vi.hoisted(() => ({
  // A call counter only: mockReset clears it before each test.
  terminalMounted: vi.fn(),
  editor: null as EditorProps | null,
}));

vi.mock('../../../src/application/ui/terminal/terminal-view', async () => {
  const {useEffect} = await import('react');
  return {
    TerminalView: ({sessionName}: {sessionName: string}) => {
      useEffect(() => {
        mocks.terminalMounted(sessionName);
      }, []);
      return <div data-testid="terminal">{sessionName}</div>;
    },
  };
});

vi.mock('../../../src/application/ui/editor/code-editor', async () => {
  const {useImperativeHandle} = await import('react');
  return {
    forgetEditorState: vi.fn(),
    CodeEditor: (props: EditorProps) => {
      mocks.editor = props;
      useImperativeHandle(
        props.editorRef,
        () => ({getText: () => `live ${props.stateKey}`}),
        [props.stateKey],
      );
      return <div data-testid="code-editor">{props.stateKey}</div>;
    },
  };
});

const worktree = (id: string): Worktree => ({
  id,
  repoId: 'repo-a',
  path: `/tmp/x/${id}`,
  branch: 'main',
  head: 'abcdef1234',
  isMain: true,
});

const tab = (path: string, overrides: Partial<OpenFile> = {}): OpenFile => ({
  worktreeId: 'w1',
  path,
  content: {kind: 'text', path, text: 'x', eol: 'lf', mtimeMs: 1},
  dirty: false,
  diskState: 'same',
  revision: 0,
  ...overrides,
});

const binary = tab('icon.png', {
  content: {kind: 'binary', path: 'icon.png'},
});

type Props = Parameters<typeof WorkbenchPanel>[0];

const setup = (overrides: Partial<Props> = {}) => {
  const props = {
    worktree: worktree('w1'),
    theme: 'dark' as const,
    explorerCollapsed: false,
    onOpenExplorer: vi.fn(),
    tabs: [tab('src/a.ts'), tab('src/b.ts', {dirty: true}), binary],
    activePath: null,
    mtimes: {},
    saving: false,
    onActivate: vi.fn(),
    onClose: vi.fn(),
    onDirty: vi.fn(),
    onSave: vi.fn(),
    onReload: vi.fn(),
    onKeep: vi.fn(),
    onPoll: vi.fn(),
    onOpenInEditor: vi.fn(),
    session: {
      snapshot: {
        tmux: 'ok' as const,
        message: null,
        sessions: [
          {
            name: 'repo-a-abc123',
            worktreeId: 'w1',
            createdAt: 1,
            attachedClients: 0,
            origin: 'fly' as const,
            task: null,
          },
        ],
      },
      activeSessionName: null,
      onStart: vi.fn(),
      onKill: vi.fn(),
      onSelectSession: vi.fn(),
    },
    ...overrides,
  };
  const view = render(<WorkbenchPanel {...props} />);
  return {
    props,
    view,
    rerender: (next: Partial<Props>) =>
      view.rerender(<WorkbenchPanel {...props} {...next} />),
  };
};

const commandS = () => fireEvent.keyDown(window, {key: 's', metaKey: true});

const click = (element: HTMLElement) =>
  act(() => {
    fireEvent.click(element);
  });

const sessionContainer = () =>
  screen.getByTestId('terminal').closest('section')
    ?.parentElement as HTMLElement;

const editorOverlay = () =>
  screen.queryByTestId('code-editor')?.closest('section')?.parentElement ??
  null;

describe('WorkbenchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.editor = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Should poll the worktree at once and every FILES_POLL_MS', async () => {
    const {props} = setup();
    expect(props.onPoll).toHaveBeenCalledTimes(1);
    expect(props.onPoll).toHaveBeenLastCalledWith('w1');
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(FILES_POLL_MS);
    });
    expect(props.onPoll).toHaveBeenCalledTimes(2);
  });

  it('Should skip a poll while the previous one is pending', async () => {
    let resolve = () => {};
    const onPoll = vi.fn(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
    );
    setup({onPoll});
    act(() => {
      vi.advanceTimersByTime(FILES_POLL_MS * 2);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
    act(() => {
      vi.advanceTimersByTime(FILES_POLL_MS);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it('Should stop polling on unmount', () => {
    const {props, view} = setup();
    view.unmount();
    act(() => {
      vi.advanceTimersByTime(FILES_POLL_MS * 3);
    });
    expect(props.onPoll).toHaveBeenCalledTimes(1);
  });

  it('Should move the poll to a newly selected worktree', async () => {
    const onPoll = vi.fn();
    const {rerender} = setup({onPoll});
    await act(async () => {});
    rerender({worktree: worktree('w2'), tabs: []});
    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onPoll).toHaveBeenLastCalledWith('w2');
    for (let tick = 0; tick < 2; tick++) {
      await act(async () => {});
      act(() => {
        vi.advanceTimersByTime(FILES_POLL_MS);
      });
    }
    expect(onPoll.mock.calls).toEqual([['w1'], ['w2'], ['w2'], ['w2']]);
  });

  it('Should render no tabs and not poll without a worktree', () => {
    const {props} = setup({worktree: null, tabs: []});
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Selecione um worktree')).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(FILES_POLL_MS * 3);
    });
    expect(props.onPoll).not.toHaveBeenCalled();
  });

  it('Should keep the session mounted and sized under the editor overlay', () => {
    const {rerender} = setup();
    const session = sessionContainer();
    expect(session).not.toHaveAttribute('hidden');
    expect(session).not.toHaveAttribute('inert');
    expect(editorOverlay()).toBeNull();
    rerender({activePath: 'src/a.ts'});
    expect(sessionContainer()).toBe(session);
    expect(session).not.toHaveAttribute('hidden');
    expect(session).toHaveAttribute('inert');
    const overlay = editorOverlay() as HTMLElement;
    expect(overlay).toHaveStyle({position: 'absolute', inset: '0'});
    expect(overlay.parentElement).toBe(session.parentElement);
    expect(overlay.parentElement).toHaveStyle({position: 'relative'});
    expect(screen.getByTestId('code-editor')).toHaveTextContent('w1\0src/a.ts');
    rerender({activePath: null});
    expect(sessionContainer()).toBe(session);
    expect(session).not.toHaveAttribute('inert');
    expect(editorOverlay()).toBeNull();
    rerender({activePath: 'src/b.ts'});
    expect(sessionContainer()).toBe(session);
    expect(session).toHaveAttribute('inert');
    expect(editorOverlay()).not.toBeNull();
    expect(mocks.terminalMounted).toHaveBeenCalledTimes(1);
  });

  it('Should cover the session for a binary tab too', () => {
    setup({activePath: 'icon.png'});
    expect(sessionContainer()).toHaveAttribute('inert');
    expect(screen.getByText('Arquivo binário')).toBeVisible();
  });

  it('Should save the live editor text of a dirty text tab on ⌘S', () => {
    const {props} = setup({activePath: 'src/b.ts'});
    expect(commandS()).toBe(false);
    expect(props.onSave).toHaveBeenCalledWith('src/b.ts', 'live w1\0src/b.ts');
  });

  it('Should swallow ⌘S without saving a clean tab, a binary tab or Sessão', () => {
    const {props, rerender} = setup({activePath: 'src/a.ts'});
    expect(commandS()).toBe(false);
    rerender({activePath: 'icon.png', tabs: [{...binary, dirty: true}]});
    expect(commandS()).toBe(false);
    rerender({activePath: null});
    expect(commandS()).toBe(false);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('Should ignore s without ⌘ and stop listening on unmount', () => {
    const {props, view} = setup({activePath: 'src/b.ts'});
    expect(fireEvent.keyDown(window, {key: 's'})).toBe(true);
    view.unmount();
    expect(commandS()).toBe(true);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('Should forget the editor state when a clean tab closes', () => {
    const onClose = vi.fn();
    setup({activePath: 'src/a.ts', onClose});
    click(screen.getByRole('button', {name: 'Fechar a.ts'}));
    expect(forgetEditorState).toHaveBeenCalledWith('w1\0src/a.ts');
    expect(onClose).toHaveBeenCalledWith('src/a.ts');
    const [forgotten] = vi.mocked(forgetEditorState).mock.invocationCallOrder;
    const [closed] = onClose.mock.invocationCallOrder;
    expect(forgotten).toBeLessThan(closed as number);
  });

  it('Should forget the editor state of a dirty tab only after Descartar', () => {
    const {props} = setup();
    click(screen.getByRole('button', {name: 'Fechar b.ts'}));
    expect(forgetEditorState).not.toHaveBeenCalled();
    click(screen.getByRole('button', {name: 'Descartar'}));
    expect(forgetEditorState).toHaveBeenCalledWith('w1\0src/b.ts');
    expect(props.onClose).toHaveBeenCalledWith('src/b.ts');
  });

  it('Should bind the editor callbacks to the active file', () => {
    const {props} = setup({
      activePath: 'src/b.ts',
      tabs: [tab('src/b.ts', {dirty: true, diskState: 'changed'})],
      mtimes: {'src/b.ts': 42},
    });
    act(() => mocks.editor?.onDirty(false));
    expect(props.onDirty).toHaveBeenCalledWith('src/b.ts', false);
    click(screen.getByRole('button', {name: 'Salvar'}));
    expect(props.onSave).toHaveBeenCalledWith('src/b.ts', 'live w1\0src/b.ts');
    click(screen.getByRole('button', {name: 'Recarregar'}));
    expect(props.onReload).toHaveBeenCalledWith('src/b.ts');
    click(screen.getByRole('button', {name: 'Manter'}));
    expect(props.onKeep).toHaveBeenCalledWith('src/b.ts', 42);
    click(screen.getByRole('button', {name: 'Abrir no VSCode'}));
    expect(props.onOpenInEditor).toHaveBeenCalledWith('/tmp/x/w1/src/b.ts');
  });

  it('Should keep a never-polled file with a null mtime', () => {
    const {props} = setup({
      activePath: 'src/b.ts',
      tabs: [tab('src/b.ts', {dirty: true, diskState: 'changed'})],
    });
    click(screen.getByRole('button', {name: 'Manter'}));
    expect(props.onKeep).toHaveBeenCalledWith('src/b.ts', null);
  });

  it('Should activate tabs and reopen the explorer through the strip', () => {
    const {props} = setup({explorerCollapsed: true, activePath: 'src/a.ts'});
    click(screen.getByRole('tab', {name: 'Sessão'}));
    expect(props.onActivate).toHaveBeenLastCalledWith(null);
    click(screen.getByRole('tab', {name: 'b.ts'}));
    expect(props.onActivate).toHaveBeenLastCalledWith('src/b.ts');
    click(screen.getByRole('button', {name: 'Abrir explorer'}));
    expect(props.onOpenExplorer).toHaveBeenCalledTimes(1);
  });

  it('Should show Salvando… on the active tab while saving', () => {
    setup({activePath: 'src/b.ts', saving: true});
    expect(screen.getByText('Salvando…')).toBeVisible();
  });
});
