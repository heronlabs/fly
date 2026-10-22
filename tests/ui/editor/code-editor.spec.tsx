import {indentUnit} from '@codemirror/language';
import {EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {render} from '@testing-library/react';
import {createRef} from 'react';

import {
  CodeEditor,
  type CodeEditorHandle,
  forgetEditorState,
} from '../../../src/application/ui/editor/code-editor';
import {fileKind} from '../../../src/application/ui/editor/file-kinds';
import type {ResolvedTheme} from '../../../src/application/ui/theme/theme';

// The editor cache is module-level, so every test uses its own keys.
let seq = 0;
const freshKey = (path: string) => `wt${++seq}\0${path}`;

type Props = {
  stateKey: string;
  text: string;
  revision?: number;
  basename?: string;
  theme?: ResolvedTheme;
};

const setup = (initial: Props) => {
  const onDirty = vi.fn();
  const editorRef = createRef<CodeEditorHandle>();
  const element = ({
    stateKey,
    text,
    revision = 0,
    basename = 'a.ts',
    theme = 'dark',
  }: Props) => (
    <CodeEditor
      stateKey={stateKey}
      text={text}
      revision={revision}
      kind={fileKind(basename)}
      theme={theme}
      onDirty={onDirty}
      editorRef={editorRef}
    />
  );
  const utils = render(element(initial));
  const view = () => {
    const dom = utils.container.querySelector<HTMLElement>('.cm-editor');
    const found = dom ? EditorView.findFromDOM(dom) : null;
    if (!found) {
      throw new Error('no editor mounted');
    }
    return found;
  };
  return {
    ...utils,
    onDirty,
    view,
    getText: () => editorRef.current?.getText(),
    rerender: (props: Props) => utils.rerender(element(props)),
    insert: (text: string) =>
      view().dispatch({changes: {from: 0, insert: text}}),
  };
};

describe('CodeEditor', () => {
  it('Should render the text and expose it through the handle', () => {
    const {container, getText} = setup({
      stateKey: freshKey('a.ts'),
      text: 'const a = 1;',
    });
    expect(container.querySelector('.cm-content')).toHaveTextContent(
      'const a = 1;',
    );
    expect(getText()).toBe('const a = 1;');
  });

  it('Should report dirty after an edit and clean after reverting, only on flips', () => {
    const {onDirty, view, insert, getText} = setup({
      stateKey: freshKey('a.ts'),
      text: 'a',
    });
    insert('x');
    insert('y');
    expect(getText()).toBe('yxa');
    expect(onDirty.mock.calls).toEqual([[true]]);
    view().dispatch({selection: {anchor: 1}});
    view().dispatch({changes: {from: 0, to: 2}});
    expect(getText()).toBe('a');
    expect(onDirty.mock.calls).toEqual([[true], [false]]);
  });

  it('Should not report anything on mount', () => {
    const {onDirty} = setup({stateKey: freshKey('a.ts'), text: 'a'});
    expect(onDirty).not.toHaveBeenCalled();
  });

  it('Should report clean when the saved text catches up with the doc', () => {
    const stateKey = freshKey('a.ts');
    const {onDirty, insert, rerender} = setup({stateKey, text: 'a'});
    insert('x');
    rerender({stateKey, text: 'xa'});
    expect(onDirty.mock.calls).toEqual([[true], [false]]);
  });

  it('Should re-derive dirty against the new saved text, not the last report', () => {
    const stateKey = freshKey('a.ts');
    const {onDirty, insert, rerender} = setup({stateKey, text: 'a'});
    insert('x');
    // ⌘S writes 'xa'; 'y' is typed while the write is in flight, then the
    // store marks the tab clean and the saved text becomes 'xa'.
    insert('y');
    rerender({stateKey, text: 'xa'});
    expect(onDirty.mock.calls).toEqual([[true], [true]]);
    rerender({stateKey, text: 'yxa'});
    expect(onDirty.mock.calls).toEqual([[true], [true], [false]]);
    rerender({stateKey, text: 'other'});
    expect(onDirty.mock.calls).toEqual([[true], [true], [false], [true]]);
  });

  it('Should re-derive dirty when switching back to a file saved meanwhile', () => {
    const first = freshKey('a.ts');
    const second = freshKey('b.ts');
    const {onDirty, insert, rerender} = setup({stateKey: first, text: 'a'});
    // ⌘S writes 'xa', 'z' is typed, and the second (then dirty) file is
    // shown before the write resolves: the store marks the first one clean.
    insert('x');
    insert('z');
    rerender({stateKey: second, text: 'b'});
    insert('y');
    rerender({stateKey: first, text: 'xa'});
    expect(onDirty.mock.calls).toEqual([[true], [false], [true], [true]]);
  });

  it('Should reset the doc to the text on a new revision', () => {
    const stateKey = freshKey('a.ts');
    const {onDirty, insert, rerender, getText} = setup({stateKey, text: 'a'});
    insert('x');
    rerender({stateKey, text: 'b', revision: 1});
    expect(getText()).toBe('b');
    expect(onDirty.mock.calls).toEqual([[true], [false]]);
  });

  it('Should restore the edited doc when switching back to a stateKey', () => {
    const first = freshKey('a.ts');
    const second = freshKey('b.ts');
    const {onDirty, insert, rerender, getText} = setup({
      stateKey: first,
      text: 'a',
    });
    insert('x');
    rerender({stateKey: second, text: 'b'});
    expect(getText()).toBe('b');
    rerender({stateKey: first, text: 'a'});
    expect(getText()).toBe('xa');
    expect(onDirty.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('Should rebuild a cached stateKey from the text when its revision moved on', () => {
    const first = freshKey('a.ts');
    const second = freshKey('b.ts');
    const {insert, rerender, getText} = setup({stateKey: first, text: 'a'});
    insert('x');
    rerender({stateKey: second, text: 'b'});
    // The panel reloads the background file while the other one is shown.
    rerender({stateKey: second, text: 'b'});
    rerender({stateKey: first, text: 'reloaded', revision: 1});
    expect(getText()).toBe('reloaded');
  });

  it('Should keep the cached doc across a remount', () => {
    const stateKey = freshKey('a.ts');
    const {insert, unmount} = setup({stateKey, text: 'a'});
    insert('x');
    unmount();
    const {getText, onDirty} = setup({stateKey, text: 'a'});
    expect(getText()).toBe('xa');
    expect(onDirty.mock.calls).toEqual([[true]]);
  });

  it('Should build a fresh doc after forgetEditorState', () => {
    const first = freshKey('a.ts');
    const second = freshKey('b.ts');
    const {insert, rerender, getText} = setup({stateKey: first, text: 'a'});
    insert('x');
    rerender({stateKey: second, text: 'b'});
    forgetEditorState(first);
    rerender({stateKey: first, text: 'a'});
    expect(getText()).toBe('a');
  });

  it('Should keep the doc and follow the theme on a theme change', () => {
    const stateKey = freshKey('a.ts');
    const {insert, rerender, getText, view} = setup({stateKey, text: 'a'});
    expect(view().state.facet(EditorView.darkTheme)).toBe(true);
    insert('x');
    rerender({stateKey, text: 'a', theme: 'light'});
    expect(getText()).toBe('xa');
    expect(view().state.facet(EditorView.darkTheme)).toBe(false);
  });

  it('Should bring a cached state up to the current theme', () => {
    const first = freshKey('a.ts');
    const second = freshKey('b.ts');
    const {rerender, view} = setup({stateKey: first, text: 'a'});
    rerender({stateKey: second, text: 'b', theme: 'light'});
    rerender({stateKey: first, text: 'a', theme: 'light'});
    expect(view().state.facet(EditorView.darkTheme)).toBe(false);
  });

  it('Should indent Go with tabs and TypeScript with two spaces, tab size 4', () => {
    const go = setup({
      stateKey: freshKey('main.go'),
      text: '',
      basename: 'main.go',
    });
    expect(go.view().state.facet(indentUnit)).toBe('\t');
    expect(go.view().state.facet(EditorState.tabSize)).toBe(4);
    go.unmount();
    const ts = setup({stateKey: freshKey('a.ts'), text: ''});
    expect(ts.view().state.facet(indentUnit)).toBe('  ');
  });

  it('Should bind search, history and Tab indent but never Mod-s', () => {
    const {view} = setup({stateKey: freshKey('a.ts'), text: ''});
    const keys = view()
      .state.facet(keymap)
      .flat()
      .map(binding => binding.key);
    expect(keys).toContain('Mod-f');
    expect(keys).toContain('Mod-z');
    expect(keys).toContain('Tab');
    expect(keys).not.toContain('Mod-s');
  });

  it('Should allow multiple selection ranges', () => {
    const {view} = setup({stateKey: freshKey('a.ts'), text: 'abcd'});
    view().dispatch({
      selection: EditorSelection.create([
        EditorSelection.range(0, 1),
        EditorSelection.range(2, 3),
      ]),
    });
    expect(view().state.selection.ranges).toHaveLength(2);
  });

  it('Should destroy the view on unmount', () => {
    const destroy = vi.spyOn(EditorView.prototype, 'destroy');
    const {unmount} = setup({stateKey: freshKey('a.ts'), text: ''});
    expect(destroy).not.toHaveBeenCalled();
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
