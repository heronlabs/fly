import {closeBrackets, closeBracketsKeymap} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from '@codemirror/language';
import {highlightSelectionMatches, searchKeymap} from '@codemirror/search';
import {Compartment, EditorState} from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  type ViewUpdate,
} from '@codemirror/view';
import {type Ref, useEffect, useImperativeHandle, useRef} from 'react';

import type {ResolvedTheme} from '../theme/theme';
import {editorTheme} from './editor-theme';
import type {FileKind} from './file-kinds';
import {syntaxHighlighting} from './highlight-style';
import {indentUnitOf, languageExtension} from './languages';

export type CodeEditorHandle = {getText(): string};

type CodeEditorProps = {
  stateKey: string;
  text: string;
  revision: number;
  kind: FileKind;
  theme: ResolvedTheme;
  onDirty(dirty: boolean): void;
  editorRef?: Ref<CodeEditorHandle>;
};

// States are cached per stateKey for every CodeEditor and outlive the view
// that edited them, so the compartments and the update listener they carry
// are module-level too: a cached state may come back in another view.
const states = new Map<string, EditorState>();
const language = new Compartment();
const chrome = new Compartment();
const owners = new WeakMap<EditorView, (update: ViewUpdate) => void>();
const updateListener = EditorView.updateListener.of(update =>
  owners.get(update.view)?.(update),
);

// The panel drops a closed file's state; the cache is not pruned otherwise.
export const forgetEditorState = (stateKey: string): void => {
  states.delete(stateKey);
};

const createState = (text: string, kind: FileKind, theme: ResolvedTheme) =>
  EditorState.create({
    doc: text,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      // No Mod-s: the workbench panel saves on ⌘S from a window handler.
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      EditorState.tabSize.of(4),
      indentUnit.of(indentUnitOf(kind.language)),
      language.of(languageExtension(kind)),
      chrome.of(editorTheme(theme)),
      syntaxHighlighting,
      updateListener,
    ],
  });

export const CodeEditor = ({
  stateKey,
  text,
  revision,
  kind,
  theme,
  onDirty,
  editorRef,
}: CodeEditorProps) => {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // The stateKey the view shows; null until the first state is set.
  const shown = useRef<string | null>(null);
  // The last value given to onDirty.
  const dirty = useRef(false);
  const latest = useRef({text, kind, theme, onDirty});
  latest.current = {text, kind, theme, onDirty};

  const report = (state: EditorState) => {
    const next = state.doc.toString() !== latest.current.text;
    if (next !== dirty.current) {
      dirty.current = next;
      latest.current.onDirty(next);
    }
  };

  const followTheme = (editor: EditorView) => {
    const current = latest.current.theme;
    if (editor.state.facet(EditorView.darkTheme) !== (current === 'dark')) {
      editor.dispatch({effects: chrome.reconfigure(editorTheme(current))});
    }
  };

  useImperativeHandle(
    editorRef,
    () => ({getText: () => view.current?.state.doc.toString() ?? ''}),
    [],
  );

  useEffect(() => {
    const parent = host.current;
    if (!parent) {
      return undefined;
    }
    const editor = new EditorView({parent});
    owners.set(editor, update => {
      if (shown.current !== null) {
        states.set(shown.current, update.state);
      }
      if (update.docChanged) {
        report(update.state);
      }
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
      shown.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }
    // Another stateKey reuses its cached state; a new revision of the shown
    // one (a reload) starts over from the text.
    const cached =
      shown.current === stateKey ? undefined : states.get(stateKey);
    const state = cached ?? createState(text, kind, theme);
    states.set(stateKey, state);
    shown.current = stateKey;
    editor.setState(state);
    // A cached state keeps the chrome of the theme it was built under.
    followTheme(editor);
    report(editor.state);
  }, [stateKey, revision]);

  useEffect(() => {
    if (view.current) {
      followTheme(view.current);
    }
  }, [theme]);

  // The saved text changes without a reload after a save.
  useEffect(() => {
    if (view.current) {
      report(view.current.state);
    }
  }, [text]);

  return <div ref={host} style={{width: '100%', height: '100%'}} />;
};
