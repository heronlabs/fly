import type {ITheme} from '@xterm/xterm';

import {type ResolvedTheme, themeVars} from '../theme/theme';

const ansi: Record<ResolvedTheme, ITheme> = {
  dark: {
    selectionBackground: '#1a3d5e',
    black: '#0a1a2c',
    red: '#ff6b6b',
    green: '#1fd646',
    yellow: '#f59e0b',
    blue: '#39b3f8',
    magenta: '#c084fc',
    cyan: '#13c2c2',
    white: '#dde7ef',
    brightBlack: '#5e8fc0',
    brightRed: '#ffa198',
    brightGreen: '#86efac',
    brightYellow: '#fcd34d',
    brightBlue: '#7dd3fc',
    brightMagenta: '#d8b4fe',
    brightCyan: '#5eead4',
    brightWhite: '#ffffff',
  },
  light: {
    selectionBackground: '#cfe0ee',
    black: '#1f2937',
    red: '#dc2626',
    green: '#15803d',
    yellow: '#c2410c',
    blue: '#1d4ed8',
    magenta: '#7c3aed',
    cyan: '#0e7490',
    white: '#6b7280',
    brightBlack: '#374151',
    brightRed: '#b91c1c',
    brightGreen: '#166534',
    brightYellow: '#9a3412',
    brightBlue: '#1e40af',
    brightMagenta: '#6d28d9',
    brightCyan: '#155e75',
    brightWhite: '#9ca3af',
  },
};

export const terminalTheme = (theme: ResolvedTheme): ITheme => {
  const vars = themeVars(theme);
  return {
    ...ansi[theme],
    background: vars['--deep'],
    foreground: vars['--text'],
    cursor: vars['--accent'],
  };
};
