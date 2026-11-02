import {isShortcut, shortcutLabel} from '../../src/application/ui/keys';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isShortcut', () => {
  it('Should take ⌘ and not Ctrl on mac', () => {
    expect(isShortcut(key({key: 's', metaKey: true}), 'mac')).toBe(true);
    expect(isShortcut(key({key: 's', ctrlKey: true}), 'mac')).toBe(false);
    expect(
      isShortcut(key({key: 's', metaKey: true, ctrlKey: true}), 'mac'),
    ).toBe(false);
    expect(isShortcut(key({key: 's'}), 'mac')).toBe(false);
  });

  it('Should take Ctrl and not the Super key on Linux', () => {
    expect(isShortcut(key({key: 's', ctrlKey: true}), 'linux')).toBe(true);
    expect(isShortcut(key({key: 's', metaKey: true}), 'linux')).toBe(false);
    expect(
      isShortcut(key({key: 's', metaKey: true, ctrlKey: true}), 'linux'),
    ).toBe(false);
    expect(isShortcut(key({key: 's'}), 'linux')).toBe(false);
  });

  it('Should leave a Linux Ctrl key pressed in the terminal to the terminal', () => {
    const terminal = document.createElement('div');
    terminal.className = 'xterm';
    const input = document.createElement('textarea');
    terminal.append(input);
    document.body.append(terminal);
    let result: boolean | null = null;
    input.addEventListener('keydown', event => {
      result = isShortcut(event, 'linux');
    });

    input.dispatchEvent(key({key: 's', ctrlKey: true, bubbles: true}));

    expect(result).toBe(false);
    terminal.remove();
  });

  it('Should keep ⌘ shortcuts from the terminal on mac', () => {
    const terminal = document.createElement('div');
    terminal.className = 'xterm';
    document.body.append(terminal);
    let result: boolean | null = null;
    terminal.addEventListener('keydown', event => {
      result = isShortcut(event, 'mac');
    });

    terminal.dispatchEvent(key({key: 's', metaKey: true, bubbles: true}));

    expect(result).toBe(true);
    terminal.remove();
  });

  it('Should take a Linux Ctrl key from outside the terminal', () => {
    const input = document.createElement('input');
    document.body.append(input);
    let result: boolean | null = null;
    input.addEventListener('keydown', event => {
      result = isShortcut(event, 'linux');
    });

    input.dispatchEvent(key({key: 's', ctrlKey: true, bubbles: true}));

    expect(result).toBe(true);
    input.remove();
  });
});

describe('shortcutLabel', () => {
  it('Should spell mac shortcuts with symbols', () => {
    expect(shortcutLabel('S', 'mac')).toBe('⌘S');
    expect(shortcutLabel('F', 'mac', true)).toBe('⇧⌘F');
  });

  it('Should spell Linux shortcuts with Ctrl', () => {
    expect(shortcutLabel('S', 'linux')).toBe('Ctrl+S');
    expect(shortcutLabel('F', 'linux', true)).toBe('Ctrl+Shift+F');
  });
});
