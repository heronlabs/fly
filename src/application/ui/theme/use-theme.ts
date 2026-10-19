import {useEffect, useState} from 'react';

import type {ThemeMode} from '../../../core/domain/settings';
import {applyTheme, type ResolvedTheme} from './theme';

const query = '(prefers-color-scheme: dark)';

const resolve = (mode: ThemeMode): ResolvedTheme =>
  mode === 'system'
    ? window.matchMedia(query).matches
      ? 'dark'
      : 'light'
    : mode;

export const useTheme = (mode: ThemeMode): ResolvedTheme => {
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(mode));

  useEffect(() => {
    setResolved(resolve(mode));
    if (mode !== 'system') {
      return undefined;
    }
    const media = window.matchMedia(query);
    const onChange = () => setResolved(resolve('system'));
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [mode]);

  useEffect(() => {
    applyTheme(resolved, document.documentElement);
  }, [resolved]);

  return resolved;
};
