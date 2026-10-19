import {act, renderHook} from '@testing-library/react';

import {useTheme} from '../../../src/application/ui/theme/use-theme';

type Listener = () => void;

const stubMatchMedia = (initial: boolean) => {
  let matches = initial;
  const listeners = new Set<Listener>();
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: Listener) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) =>
      listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    flip(next: boolean) {
      matches = next;
      listeners.forEach(listener => listener());
    },
    listeners,
  };
};

describe('useTheme', () => {
  it('applies an explicit mode to the document', () => {
    stubMatchMedia(false);
    const {result} = renderHook(() => useTheme('dark'));
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('follows the OS in system mode and re-resolves on change', () => {
    const media = stubMatchMedia(true);
    const {result, unmount} = renderHook(() => useTheme('system'));
    expect(result.current).toBe('dark');
    act(() => media.flip(false));
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
