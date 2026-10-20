import {terminalTheme} from '../../../src/application/ui/terminal/terminal-theme';
import {themeVars} from '../../../src/application/ui/theme/theme';

const ansiKeys = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

describe('terminalTheme', () => {
  it.each(['dark', 'light'] as const)(
    'Should follow themeVars for %s surface colours',
    theme => {
      const vars = themeVars(theme);
      const result = terminalTheme(theme);
      expect(result.background).toBe(vars['--deep']);
      expect(result.foreground).toBe(vars['--text']);
      expect(result.cursor).toBe(vars['--accent']);
    },
  );

  it.each(['dark', 'light'] as const)(
    'Should define all 16 ANSI colours for %s',
    theme => {
      const result = terminalTheme(theme);
      for (const key of ansiKeys) {
        expect(result[key]).toMatch(/^#[0-9a-f]{6}$/);
      }
    },
  );

  it('Should use the per-theme red and selection', () => {
    expect(terminalTheme('dark').red).toBe('#ff6b6b');
    expect(terminalTheme('light').red).toBe('#dc2626');
    expect(terminalTheme('dark').selectionBackground).toBe('#1a3d5e');
    expect(terminalTheme('light').selectionBackground).toBe('#cfe0ee');
  });
});
