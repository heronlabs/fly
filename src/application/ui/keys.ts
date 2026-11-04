import type {Platform} from '../../core/domain/platform';

type KeyEventLike = {
  metaKey: boolean;
  ctrlKey: boolean;
  target: EventTarget | null;
};

const inTerminal = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.xterm') !== null;

// The app's modifier: ⌘ on macOS, Ctrl on Linux. On Linux a Ctrl key pressed
// in a terminal belongs to the terminal (Ctrl+S, Ctrl+N mean something to the
// shell and to claude), so it is never an app shortcut there.
export const isShortcut = (
  event: KeyEventLike,
  platform: Platform,
): boolean => {
  if (platform === 'mac') return event.metaKey && !event.ctrlKey;
  return event.ctrlKey && !event.metaKey && !inTerminal(event.target);
};

export const shortcutLabel = (
  key: string,
  platform: Platform,
  shift = false,
): string =>
  platform === 'mac'
    ? `${shift ? '⇧' : ''}⌘${key}`
    : `Ctrl+${shift ? 'Shift+' : ''}${key}`;
