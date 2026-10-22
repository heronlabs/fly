import {syntaxPalette} from '../../../src/application/ui/editor/syntax-palette';
import {applyTheme, themeVars} from '../../../src/application/ui/theme/theme';
import {tokens} from '../../../src/application/ui/theme/tokens';

describe('theme', () => {
  it('Should map dark page/surface/border/text to the heronlabs dark tokens', () => {
    const vars = themeVars('dark');
    expect(vars['--page']).toBe(tokens.colors.pageDark);
    expect(vars['--surface']).toBe(tokens.colors.surfaceDark);
    expect(vars['--drawer']).toBe(tokens.colors.drawerDark);
    expect(vars['--border']).toBe(tokens.colors.borderDark);
    expect(vars['--text']).toBe(tokens.colors.textDarkPrimary);
    expect(vars['--accentText']).toBe(tokens.colors.lightBlue);
  });

  it('Should map light page/border/text to the heronlabs light tokens and darken accent text', () => {
    const vars = themeVars('light');
    expect(vars['--page']).toBe(tokens.colors.pageLight);
    expect(vars['--border']).toBe(tokens.colors.borderPanelLight);
    expect(vars['--text']).toBe(tokens.colors.textStrong);
    expect(vars['--accent']).toBe(tokens.colors.lightBlue);
    expect(vars['--accentText']).toBe('#1d4ed8');
  });

  it('Should take syntax colors from tokens.syntax per theme', () => {
    expect(themeVars('dark')['--syKeyword']).toBe(tokens.syntax.dark.keyword);
    expect(themeVars('light')['--syString']).toBe(tokens.syntax.light.string);
  });

  it('Should expose the editor syntax palette as --ed* variables per theme', () => {
    expect(themeVars('dark')['--edKeyword']).toBe(syntaxPalette.dark.keyword);
    expect(themeVars('light')['--edKeyword']).toBe(syntaxPalette.light.keyword);
    expect(themeVars('dark')['--edFindMatchOther']).toBe(
      syntaxPalette.dark.findMatchOther,
    );
  });

  it('Should fall back to the Nerd Font symbols after JetBrains Mono in both themes', () => {
    expect(themeVars('dark')['--fontMono']).toBe(
      "'JetBrains Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace",
    );
    expect(themeVars('light')['--fontMono']).toBe(
      "'JetBrains Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace",
    );
  });

  it('Should expose the same variable names in both themes', () => {
    expect(Object.keys(themeVars('dark')).sort()).toEqual(
      Object.keys(themeVars('light')).sort(),
    );
  });

  it('Should apply variables and data-theme on the given root', () => {
    const el = document.createElement('div');
    applyTheme('light', el);
    expect(el.style.getPropertyValue('--page')).toBe(tokens.colors.pageLight);
    expect(el.dataset['theme']).toBe('light');
  });
});
