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

import type {SearchRange} from '../../../core/domain/search';
import type {ResolvedTheme} from '../theme/theme';
import {editorTheme} from './editor-theme';
import type {FileKind} from './file-kinds';
import {syntaxHighlighting} from './highlight-style';
import {indentUnitOf, languageExtension} from './languages';

// getText is null without a view: nothing to save. reveal selects a range
// of a line (clamped to the doc) and scrolls it to the middle.
export type CodeEditorHandle = {
  getText(): string | null;
  reveal(line: number, range: SearchRange | null): void;
};

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
// are module-level too: a cached state may come back in another view. Each
// entry remembers the revision it was built from.
type Cached = {state: EditorState; revision: number};
const states = new Map<string, Cached>();
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
      EditorState.allowMultipleSelections.of(true),
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
  // What the view shows; null until the first state is set.
  const shown = useRef<{stateKey: string; revision: number} | null>(null);
  // The last value given to onDirty.
  const dirty = useRef(false);
  const mounted = useRef(false);
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
    () => ({
      getText: () => view.current?.state.doc.toString() ?? null,
      reveal: (line, range) => {
        const editor = view.current;
        if (!editor) {
          return;
        }
        const {doc} = editor.state;
        const target = doc.line(Math.min(line, doc.lines));
        const at = (offset: number) =>
          Math.min(target.from + offset, target.to);
        const anchor = at(range?.[0] ?? 0);
        editor.dispatch({
          selection: {anchor, head: at(range?.[1] ?? 0)},
          effects: EditorView.scrollIntoView(anchor, {y: 'center'}),
        });
      },
    }),
    [],
  );

  useEffect(() => {
    const parent = host.current;
    if (!parent) {
      return undefined;
    }
    const editor = new EditorView({parent});
    owners.set(editor, update => {
      if (shown.current) {
        states.set(shown.current.stateKey, {
          state: update.state,
          revision: shown.current.revision,
        });
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
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }
    // Another stateKey reuses its cached state if it was built from this
    // revision; a new revision (a reload, of the shown file or of one in the
    // background) starts over from the text.
    const cached =
      shown.current?.stateKey === stateKey ? undefined : states.get(stateKey);
    const state =
      cached?.revision === revision
        ? cached.state
        : createState(text, kind, theme);
    states.set(stateKey, {state, revision});
    shown.current = {stateKey, revision};
    editor.setState(state);
    // A cached state keeps the chrome of the theme it was built under.
    followTheme(editor);
  }, [stateKey, revision]);

  useEffect(() => {
    if (view.current) {
      followTheme(view.current);
    }
  }, [theme]);

  // Another file, a reload or a save: the store's flag for the shown file
  // may differ from the last report (a save marks the tab clean even when
  // the doc moved on during the write), so the flag is re-derived against
  // the new text and always reported. On mount only a dirty doc is.
  useEffect(() => {
    const editor = view.current;
    if (!editor) {
      return;
    }
    const next = editor.state.doc.toString() !== text;
    if (mounted.current || next) {
      dirty.current = next;
      latest.current.onDirty(next);
    }
    mounted.current = true;
  }, [stateKey, revision, text]);

  return <div ref={host} style={{width: '100%', height: '100%'}} />;
};
