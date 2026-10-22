import type {Extension} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import type {ResolvedTheme} from '../theme/theme';

// The look of the panels' `buttonStyle`, for the search panel controls.
const control = {
  backgroundColor: 'var(--surface)',
  backgroundImage: 'none',
  color: 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  padding: '2px 10px',
};

// Every colour is a fly variable, so only the `dark` flag (which picks
// CodeMirror's base light/dark defaults) depends on the theme.
export const editorTheme = (theme: ResolvedTheme): Extension =>
  EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'var(--page)',
        color: 'var(--text)',
        fontSize: '12.5px',
      },
      '&.cm-focused': {outline: 'none'},
      '.cm-scroller': {fontFamily: 'var(--fontMono)', lineHeight: '1.65'},
      '.cm-content': {caretColor: 'var(--accent)'},
      '.cm-cursor, .cm-dropCursor': {borderLeftColor: 'var(--accent)'},
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
        {backgroundColor: 'var(--edSelection)'},
      '.cm-activeLine': {backgroundColor: 'var(--edLineHighlight)'},
      '.cm-gutters': {
        backgroundColor: 'var(--page)',
        color: 'var(--faint)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--edLineHighlight)',
        color: 'var(--text)',
      },
      '&.cm-focused .cm-matchingBracket': {
        backgroundColor: 'var(--edBracketMatch)',
        outline: '1px solid var(--edBracketBorder)',
      },
      '.cm-searchMatch, .cm-selectionMatch': {
        backgroundColor: 'var(--edFindMatchOther)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--edFindMatch)',
      },
      '.cm-panels': {backgroundColor: 'var(--drawer)', color: 'var(--text)'},
      '.cm-panels.cm-panels-top': {borderBottom: '1px solid var(--border)'},
      '.cm-panels.cm-panels-bottom': {borderTop: '1px solid var(--border)'},
      '.cm-textfield': {...control, color: 'var(--text)'},
      '.cm-button': {
        ...control,
        cursor: 'pointer',
        '&:active': {backgroundImage: 'none'},
      },
      '.cm-panel.cm-search [name=close]': {color: 'var(--muted)'},
      '.cm-foldPlaceholder': {
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--muted)',
      },
    },
    {dark: theme === 'dark'},
  );
