import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';

import {editorTheme} from '../../../src/application/ui/editor/editor-theme';

const stateWith = (theme: 'dark' | 'light') =>
  EditorState.create({extensions: editorTheme(theme)});

const css = (theme: 'dark' | 'light') =>
  stateWith(theme)
    .facet(EditorView.styleModule)
    .map(module => module.getRules())
    .join('\n');

describe('editorTheme', () => {
  it('Should flag the dark theme as dark', () => {
    expect(stateWith('dark').facet(EditorView.darkTheme)).toBe(true);
  });

  it('Should flag the light theme as light', () => {
    expect(stateWith('light').facet(EditorView.darkTheme)).toBe(false);
  });

  it('Should paint the chrome with the fly theme variables', () => {
    const rules = css('dark');
    expect(rules).toContain('background-color: var(--page)');
    expect(rules).toContain('color: var(--text)');
    expect(rules).toContain('font-family: var(--fontMono)');
    expect(rules).toContain('font-size: 12.5px');
    expect(rules).toContain('line-height: 1.65');
    expect(rules).toContain('color: var(--faint)');
    expect(rules).toContain('border-right: 1px solid var(--border)');
    expect(rules).toContain('border-left-color: var(--accent)');
    expect(rules).toContain('background-color: var(--drawer)');
    expect(rules).toContain('color: var(--muted)');
  });

  it('Should take selection, active line, brackets and search matches from the --ed variables', () => {
    const rules = css('light');
    expect(rules).toContain('background-color: var(--edSelection)');
    expect(rules).toContain('background-color: var(--edLineHighlight)');
    expect(rules).toContain('background-color: var(--edBracketMatch)');
    expect(rules).toContain('outline: 1px solid var(--edBracketBorder)');
    expect(rules).toContain('background-color: var(--edFindMatch)');
    expect(rules).toContain('background-color: var(--edFindMatchOther)');
  });

  it('Should style search inputs and buttons like the panel buttons', () => {
    const rules = css('dark');
    expect(rules).toMatch(
      /\.cm-button \{[^}]*background-color: var\(--surface\)[^}]*border: 1px solid var\(--border\)[^}]*border-radius: 6px/,
    );
    expect(rules).toMatch(
      /\.cm-textfield \{[^}]*border: 1px solid var\(--border\)[^}]*border-radius: 6px/,
    );
  });

  it('Should never hard-code a colour', () => {
    expect(css('dark')).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
