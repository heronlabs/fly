import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {createRef, type Ref} from 'react';

import type {CodeEditorHandle} from '../../../src/application/ui/editor/code-editor';
import {EditorPanel} from '../../../src/application/ui/panels/editor-panel';
import type {OpenFile} from '../../../src/application/ui/state/fly-store';
import type {FileContent} from '../../../src/core/domain/files';

type EditorProps = {
  stateKey: string;
  text: string;
  revision: number;
  onDirty(dirty: boolean): void;
  editorRef?: Ref<CodeEditorHandle>;
};

// The last props given to the mocked editor and the text its handle returns.
const editor = vi.hoisted(() => ({
  text: 'live text',
  props: null as EditorProps | null,
}));

vi.mock('../../../src/application/ui/editor/code-editor', async () => {
  const {useImperativeHandle} = await import('react');
  return {
    forgetEditorState: vi.fn(),
    CodeEditor: (props: EditorProps) => {
      editor.props = props;
      useImperativeHandle(
        props.editorRef,
        () => ({getText: () => editor.text}),
        [],
      );
      return <div data-testid="code-editor">{props.text}</div>;
    },
  };
});

const text = (overrides: Partial<Extract<FileContent, {kind: 'text'}>> = {}) =>
  ({
    kind: 'text',
    path: 'src/a.ts',
    text: 'a\nb\nc',
    eol: 'lf',
    mtimeMs: 10,
    ...overrides,
  }) as FileContent;

const file = (overrides: Partial<OpenFile> = {}): OpenFile => ({
  worktreeId: 'w1',
  path: 'src/a.ts',
  content: text(),
  dirty: false,
  diskState: 'same',
  revision: 2,
  ...overrides,
});

const setup = (overrides: Partial<Parameters<typeof EditorPanel>[0]> = {}) => {
  const props = {
    file: file(),
    worktreePath: '/r/repo-a',
    theme: 'dark' as const,
    saving: false,
    diskMtime: undefined,
    onDirty: vi.fn(),
    onSave: vi.fn(),
    onReload: vi.fn(),
    onKeep: vi.fn(),
    onOpenInEditor: vi.fn(),
    editorRef: createRef<CodeEditorHandle>(),
    ...overrides,
  };
  render(<EditorPanel {...props} />);
  return props;
};

describe('EditorPanel', () => {
  beforeEach(() => {
    editor.text = 'live text';
    editor.props = null;
  });

  it('Should show the path crumb and the footer of a text file', () => {
    setup();
    expect(screen.getByText('src/a.ts')).toBeVisible();
    expect(
      screen.getByText('TypeScript · UTF-8 · LF · 3 linhas'),
    ).toBeVisible();
  });

  it('Should show CRLF in the footer of a CRLF file', () => {
    setup({
      file: file({
        path: 'Makefile',
        content: text({path: 'Makefile', text: 'all:\n', eol: 'crlf'}),
      }),
    });
    expect(
      screen.getByText('Makefile · UTF-8 · CRLF · 2 linhas'),
    ).toBeVisible();
  });

  it('Should mount the editor with the file key, saved text and revision', () => {
    const props = setup();
    expect(screen.getByTestId('code-editor')).toHaveTextContent('a b c');
    expect(editor.props).toMatchObject({
      stateKey: 'w1\0src/a.ts',
      text: 'a\nb\nc',
      revision: 2,
    });
    act(() => editor.props?.onDirty(true));
    expect(props.onDirty).toHaveBeenCalledWith(true);
    expect(props.editorRef.current?.getText()).toBe('live text');
  });

  it('Should disable Salvar and say Salvo when clean', () => {
    setup();
    expect(screen.getByRole('button', {name: 'Salvar'})).toBeDisabled();
    expect(screen.getByText('⌘S')).toBeVisible();
    expect(screen.getByText('Salvo')).toBeVisible();
  });

  it('Should say Modificado and save the live text when dirty', async () => {
    const props = setup({file: file({dirty: true})});
    expect(screen.getByText('Modificado')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', {name: 'Salvar'}));
    expect(props.onSave).toHaveBeenCalledWith('live text');
  });

  it('Should say Salvando… while a save is running', () => {
    setup({file: file({dirty: true}), saving: true});
    expect(screen.getByText('Salvando…')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Salvar'})).toBeDisabled();
  });

  it('Should open the file in VSCode from the header', async () => {
    const props = setup();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Abrir no VSCode'}));
    expect(props.onOpenInEditor).toHaveBeenCalledWith('/r/repo-a/src/a.ts');
  });

  it('Should offer Recarregar and Manter when the file changed on disk', async () => {
    const user = userEvent.setup();
    const props = setup({
      file: file({dirty: true, diskState: 'changed'}),
      diskMtime: 42,
    });
    const bar = screen.getByRole('alert');
    expect(bar).toHaveTextContent('Arquivo alterado no disco');
    await user.click(within(bar).getByRole('button', {name: 'Recarregar'}));
    expect(props.onReload).toHaveBeenCalledTimes(1);
    await user.click(within(bar).getByRole('button', {name: 'Manter'}));
    expect(props.onKeep).toHaveBeenCalledWith(42);
  });

  it('Should keep with a null mtime when the file was never polled', async () => {
    const props = setup({file: file({dirty: true, diskState: 'changed'})});
    await userEvent.setup().click(screen.getByRole('button', {name: 'Manter'}));
    expect(props.onKeep).toHaveBeenCalledWith(null);
  });

  it('Should say the file was removed from disk', () => {
    setup({file: file({diskState: 'missing'})});
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Arquivo removido do disco',
    );
    expect(
      screen.queryByRole('button', {name: 'Recarregar'}),
    ).not.toBeInTheDocument();
  });

  it('Should show no disk bar while the file matches the disk', () => {
    setup();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Should show a binary file without the editor and open it in VSCode', async () => {
    const props = setup({
      file: file({
        path: 'build/icon.png',
        content: {kind: 'binary', path: 'build/icon.png'},
      }),
    });
    expect(screen.queryByTestId('code-editor')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'Salvar'}),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/UTF-8/)).not.toBeInTheDocument();
    const body = screen.getByText('Arquivo binário')
      .parentElement as HTMLElement;
    await userEvent
      .setup()
      .click(within(body).getByRole('button', {name: 'Abrir no VSCode'}));
    expect(props.onOpenInEditor).toHaveBeenCalledWith(
      '/r/repo-a/build/icon.png',
    );
  });

  it('Should show a large file with its size in KB and open it in VSCode', async () => {
    const props = setup({
      file: file({
        path: 'big.bin',
        content: {kind: 'large', path: 'big.bin', bytes: 2_000_000},
      }),
    });
    expect(screen.queryByTestId('code-editor')).not.toBeInTheDocument();
    const body = screen.getByText('Arquivo grande (2000 KB)')
      .parentElement as HTMLElement;
    await userEvent
      .setup()
      .click(within(body).getByRole('button', {name: 'Abrir no VSCode'}));
    expect(props.onOpenInEditor).toHaveBeenCalledWith('/r/repo-a/big.bin');
  });
});
