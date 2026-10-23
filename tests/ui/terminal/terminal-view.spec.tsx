import {act, fireEvent, render, screen} from '@testing-library/react';
import type {ILinkHandler} from '@xterm/xterm';

import {TerminalView} from '../../../src/application/ui/terminal/terminal-view';

const h = vi.hoisted(() => ({
  terms: [] as FakeTerm[],
  fitSize: {cols: 100, rows: 30},
}));

interface FakeTerm {
  options: Record<string, unknown>;
  cols: number;
  rows: number;
  open: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  paste: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  textarea: HTMLTextAreaElement;
  addons: Array<{open?: LinkHandler}>;
  emitData(data: string): void;
}

type LinkHandler = (event: MouseEvent, uri: string) => void;

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    // Like xterm, open() puts the textarea that receives keys and pastes.
    textarea = document.createElement('textarea');
    open = vi.fn((element: HTMLElement) => element.append(this.textarea));
    write = vi.fn();
    paste = vi.fn();
    dispose = vi.fn();
    addons: unknown[] = [];
    listener: ((d: string) => void) | undefined;
    constructor(options: Record<string, unknown>) {
      this.options = options;
      h.terms.push(this as unknown as FakeTerm);
    }
    loadAddon(addon: {term?: unknown}) {
      addon.term = this;
      this.addons.push(addon);
    }
    onData(cb: (d: string) => void) {
      this.listener = cb;
      return {dispose: vi.fn()};
    }
    emitData(data: string) {
      this.listener?.(data);
    }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    term: {cols: number; rows: number} | undefined;
    fit() {
      if (this.term) {
        this.term.cols = h.fitSize.cols;
        this.term.rows = h.fitSize.rows;
      }
    }
  },
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class {
    constructor(readonly open: LinkHandler) {}
  },
}));

type DataListener = (id: string, data: string) => void;
type ExitListener = (id: string, code: number) => void;

let dataListener: DataListener;
let exitListener: ExitListener;
const unData = vi.fn();
const unExit = vi.fn();
let observerCb: () => void;
const disconnect = vi.fn();

const terminal = () => window.fly.terminal;
const attachments = () => window.fly.attachments;
const textarea = () => h.terms[0]!.textarea;
const host = () => textarea().parentElement!;
const png = () =>
  new File([new Uint8Array([137, 80, 78, 71])], 'image.png', {
    type: 'image/png',
  });
const pasteOn = (target: Element, text: string, files: File[]) =>
  fireEvent.paste(target, {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      files,
    },
  });
const openExternal = () => vi.mocked(window.fly.shell.openExternal);
const clickWebLink = (uri: string) =>
  h.terms[0]!.addons.find(addon => addon.open)!.open!(
    new MouseEvent('click'),
    uri,
  );
const clickOscLink = (uri: string) =>
  (h.terms[0]!.options['linkHandler'] as ILinkHandler).activate(
    new MouseEvent('click'),
    uri,
    {start: {x: 1, y: 1}, end: {x: uri.length, y: 1}},
  );

beforeEach(() => {
  h.terms.length = 0;
  h.fitSize = {cols: 100, rows: 30};
  vi.mocked(terminal().attach).mockResolvedValue('t1');
  vi.mocked(terminal().detach).mockResolvedValue(undefined);
  vi.mocked(terminal().onData).mockImplementation(l => {
    dataListener = l;
    return unData;
  });
  vi.mocked(terminal().onExit).mockImplementation(l => {
    exitListener = l;
    return unExit;
  });
  unData.mockReset();
  unExit.mockReset();
  disconnect.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        observerCb = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {});

describe('TerminalView', () => {
  it('Should attach with the session name and the fitted size', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    expect(terminal().attach).toHaveBeenCalledWith('s1', {
      cols: 100,
      rows: 30,
    });
    expect(h.terms[0]?.options['fontSize']).toBe(13);
    expect(h.terms[0]?.options['scrollback']).toBe(1000);
  });

  it('Should fall back to the Nerd Font symbols after JetBrains Mono', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    expect(h.terms[0]?.options['fontFamily']).toBe(
      "'JetBrains Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace",
    );
  });

  it('Should write only data for its own id', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    dataListener('other', 'nope');
    dataListener('t1', 'yes');
    expect(h.terms[0]?.write).toHaveBeenCalledTimes(1);
    expect(h.terms[0]?.write).toHaveBeenCalledWith('yes');
  });

  it('Should keep data that arrives before attach resolves', async () => {
    let resolve!: (id: string) => void;
    vi.mocked(terminal().attach).mockReturnValue(
      new Promise<string>(r => (resolve = r)),
    );
    render(<TerminalView sessionName="s1" theme="dark" />);
    dataListener('t1', 'early');
    dataListener('other', 'nope');
    expect(h.terms[0]?.write).not.toHaveBeenCalled();
    resolve('t1');
    await flush();
    expect(h.terms[0]?.write).toHaveBeenCalledTimes(1);
    expect(h.terms[0]?.write).toHaveBeenCalledWith('early');
  });

  it('Should forward keystrokes', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    h.terms[0]?.emitData('ls\r');
    expect(terminal().write).toHaveBeenCalledWith('t1', 'ls\r');
  });

  it('Should not resize when the size is unchanged', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    observerCb();
    expect(terminal().resize).not.toHaveBeenCalled();
  });

  it('Should resize once when the size changed', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    h.fitSize = {cols: 120, rows: 40};
    observerCb();
    observerCb();
    expect(terminal().resize).toHaveBeenCalledTimes(1);
    expect(terminal().resize).toHaveBeenCalledWith('t1', {
      cols: 120,
      rows: 40,
    });
  });

  it('Should show the exit overlay, keep output and call onExit', async () => {
    const onExit = vi.fn();
    render(<TerminalView sessionName="s1" theme="dark" onExit={onExit} />);
    await flush();
    dataListener('t1', 'last words');
    act(() => exitListener('other', 1));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => exitListener('t1', 3));
    expect(screen.getByRole('status')).toHaveTextContent('Sessão encerrada');
    expect(onExit).toHaveBeenCalledWith(3);
    expect(h.terms[0]?.write).toHaveBeenCalledWith('last words');
    expect(h.terms[0]?.dispose).not.toHaveBeenCalled();
  });

  it('Should detach, unsubscribe and dispose on unmount', async () => {
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    unmount();
    expect(terminal().detach).toHaveBeenCalledTimes(1);
    expect(terminal().detach).toHaveBeenCalledWith('t1');
    expect(unData).toHaveBeenCalled();
    expect(unExit).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(h.terms[0]?.dispose).toHaveBeenCalled();
  });

  it('Should detach once a late attach resolves after unmount', async () => {
    let resolve!: (id: string) => void;
    vi.mocked(terminal().attach).mockReturnValue(
      new Promise<string>(r => (resolve = r)),
    );
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    unmount();
    expect(terminal().detach).not.toHaveBeenCalled();
    resolve('late');
    await flush();
    expect(terminal().detach).toHaveBeenCalledTimes(1);
    expect(terminal().detach).toHaveBeenCalledWith('late');
    expect(h.terms[0]?.write).not.toHaveBeenCalled();
  });

  it('Should re-attach when the session name changes', async () => {
    vi.mocked(terminal().attach)
      .mockResolvedValueOnce('t1')
      .mockResolvedValueOnce('t2');
    const {rerender} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    rerender(<TerminalView sessionName="s2" theme="dark" />);
    await flush();
    expect(terminal().detach).toHaveBeenCalledWith('t1');
    expect(terminal().attach).toHaveBeenLastCalledWith('s2', {
      cols: 100,
      rows: 30,
    });
    dataListener('t2', 'new');
    expect(h.terms[1]?.write).toHaveBeenCalledWith('new');
  });

  it('Should update the theme without re-attaching', async () => {
    const {rerender} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    rerender(<TerminalView sessionName="s1" theme="light" />);
    await flush();
    expect(terminal().attach).toHaveBeenCalledTimes(1);
    expect(terminal().detach).not.toHaveBeenCalled();
    expect((h.terms[0]?.options['theme'] as {red: string}).red).toBe('#dc2626');
  });

  it('Should show the overlay without onExit when attach rejects', async () => {
    const onExit = vi.fn();
    vi.mocked(terminal().attach).mockRejectedValue(new Error('gone'));
    render(<TerminalView sessionName="s1" theme="dark" onExit={onExit} />);
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('Sessão encerrada');
    expect(onExit).not.toHaveBeenCalled();
  });

  it('Should do nothing when attach rejects after unmount', async () => {
    let reject!: (e: Error) => void;
    vi.mocked(terminal().attach).mockReturnValue(
      new Promise<string>((_, r) => (reject = r)),
    );
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    unmount();
    reject(new Error('gone'));
    await flush();
    expect(screen.queryByRole('status')).toBeNull();
    expect(terminal().detach).not.toHaveBeenCalled();
  });

  it('Should swallow a detach rejection on unmount', async () => {
    vi.mocked(terminal().detach).mockRejectedValue(new Error('gone'));
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    unmount();
    await flush();
    expect(terminal().detach).toHaveBeenCalledWith('t1');
  });

  it('Should swallow a detach rejection after a late attach', async () => {
    let resolve!: (id: string) => void;
    vi.mocked(terminal().attach).mockReturnValue(
      new Promise<string>(r => (resolve = r)),
    );
    vi.mocked(terminal().detach).mockRejectedValue(new Error('gone'));
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    unmount();
    resolve('late');
    await flush();
    expect(terminal().detach).toHaveBeenCalledWith('late');
  });

  it('Should resize after attach when the size changed meanwhile', async () => {
    let resolve!: (id: string) => void;
    vi.mocked(terminal().attach).mockReturnValue(
      new Promise<string>(r => (resolve = r)),
    );
    render(<TerminalView sessionName="s1" theme="dark" />);
    h.fitSize = {cols: 90, rows: 20};
    observerCb();
    expect(terminal().resize).not.toHaveBeenCalled();
    resolve('t1');
    await flush();
    expect(terminal().resize).toHaveBeenCalledTimes(1);
    expect(terminal().resize).toHaveBeenCalledWith('t1', {cols: 90, rows: 20});
  });

  it('Should accept a drag over the terminal', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    expect(fireEvent.dragOver(host())).toBe(false);
  });

  it('Should paste the escaped paths of dropped files, space-separated', async () => {
    vi.mocked(attachments().pathForFile).mockImplementation(
      file => `/Users/me/Desktop/${file.name}`,
    );
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const dropped = fireEvent.drop(host(), {
      dataTransfer: {
        files: [
          new File([], 'Screenshot 2026-10-23 at 09.46.52.png'),
          new File([], "it's (2).png"),
        ],
      },
    });
    expect(dropped).toBe(false);
    expect(h.terms[0]?.paste).toHaveBeenCalledWith(
      "/Users/me/Desktop/Screenshot\\ 2026-10-23\\ at\\ 09.46.52.png /Users/me/Desktop/it\\'s\\ \\(2\\).png",
    );
  });

  it('Should keep non-ASCII characters of a dropped path unescaped', async () => {
    vi.mocked(attachments().pathForFile).mockReturnValue(
      '/tmp/café 9.46.52\u202fAM.png',
    );
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    fireEvent.drop(host(), {dataTransfer: {files: [png()]}});
    expect(h.terms[0]?.paste).toHaveBeenCalledWith(
      '/tmp/café\\ 9.46.52\u202fAM.png',
    );
  });

  it('Should skip dropped files without a path', async () => {
    vi.mocked(attachments().pathForFile)
      .mockReturnValueOnce('')
      .mockReturnValueOnce('/tmp/b.png');
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    fireEvent.drop(host(), {dataTransfer: {files: [png(), png()]}});
    expect(h.terms[0]?.paste).toHaveBeenCalledTimes(1);
    expect(h.terms[0]?.paste).toHaveBeenCalledWith('/tmp/b.png');
  });

  it('Should paste nothing when no dropped file has a path', async () => {
    vi.mocked(attachments().pathForFile).mockReturnValue('');
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    expect(fireEvent.drop(host(), {dataTransfer: {files: [png()]}})).toBe(
      false,
    );
    expect(h.terms[0]?.paste).not.toHaveBeenCalled();
  });

  it('Should save an image-only paste and paste its escaped path', async () => {
    vi.mocked(attachments().saveImage).mockResolvedValue(
      '/tmp/my dir/image.png',
    );
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const xtermPaste = vi.fn();
    textarea().addEventListener('paste', xtermPaste);
    expect(pasteOn(textarea(), '', [png()])).toBe(false);
    await vi.waitFor(() =>
      expect(h.terms[0]?.paste).toHaveBeenCalledWith('/tmp/my\\ dir/image.png'),
    );
    expect(attachments().saveImage).toHaveBeenCalledWith(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(xtermPaste).not.toHaveBeenCalled();
  });

  it('Should leave a paste with text to xterm, image or not', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const xtermPaste = vi.fn();
    textarea().addEventListener('paste', xtermPaste);
    expect(pasteOn(textarea(), 'hello', [png()])).toBe(true);
    expect(xtermPaste).toHaveBeenCalledTimes(1);
    expect(attachments().saveImage).not.toHaveBeenCalled();
  });

  it('Should leave a paste with neither text nor a PNG to xterm', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const xtermPaste = vi.fn();
    textarea().addEventListener('paste', xtermPaste);
    const tiff = new File([], 'image.tiff', {type: 'image/tiff'});
    expect(pasteOn(textarea(), '', [tiff])).toBe(true);
    expect(xtermPaste).toHaveBeenCalledTimes(1);
    expect(attachments().saveImage).not.toHaveBeenCalled();
  });

  it('Should leave a paste without clipboard data to xterm', async () => {
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const xtermPaste = vi.fn();
    textarea().addEventListener('paste', xtermPaste);
    expect(fireEvent.paste(textarea())).toBe(true);
    expect(xtermPaste).toHaveBeenCalledTimes(1);
    expect(attachments().saveImage).not.toHaveBeenCalled();
  });

  it('Should paste nothing when saving the image fails', async () => {
    vi.mocked(attachments().saveImage).mockRejectedValue(new Error('disk'));
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    pasteOn(textarea(), '', [png()]);
    await vi.waitFor(() =>
      expect(attachments().saveImage).toHaveBeenCalledTimes(1),
    );
    await flush();
    expect(h.terms[0]?.paste).not.toHaveBeenCalled();
  });

  it('Should not paste an image saved after unmount', async () => {
    let resolve!: (path: string) => void;
    vi.mocked(attachments().saveImage).mockReturnValue(
      new Promise<string>(r => (resolve = r)),
    );
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    pasteOn(textarea(), '', [png()]);
    await vi.waitFor(() =>
      expect(attachments().saveImage).toHaveBeenCalledTimes(1),
    );
    unmount();
    resolve('/tmp/image.png');
    await flush();
    expect(h.terms[0]?.paste).not.toHaveBeenCalled();
  });

  it('Should stop handling drops and pastes on unmount', async () => {
    const {unmount} = render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    const element = host();
    unmount();
    expect(fireEvent.dragOver(element)).toBe(true);
    expect(fireEvent.drop(element, {dataTransfer: {files: [png()]}})).toBe(
      true,
    );
    pasteOn(textarea(), '', [png()]);
    expect(attachments().pathForFile).not.toHaveBeenCalled();
    expect(attachments().saveImage).not.toHaveBeenCalled();
  });

  it('Should open a clicked plain URL in the browser', async () => {
    openExternal().mockResolvedValue(undefined);
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    clickWebLink('http://localhost:5173/');
    expect(openExternal()).toHaveBeenCalledWith('http://localhost:5173/');
  });

  it('Should open a clicked OSC 8 hyperlink in the browser', async () => {
    openExternal().mockResolvedValue(undefined);
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    clickOscLink('https://github.com/o/r/pull/1');
    expect(openExternal()).toHaveBeenCalledWith(
      'https://github.com/o/r/pull/1',
    );
  });

  it('Should swallow a refused link', async () => {
    const opened: string[] = [];
    // A plain function: vi.fn() handles its own rejections, hiding a leak.
    vi.stubGlobal('fly', {
      ...window.fly,
      shell: {
        ...window.fly.shell,
        openExternal: (url: string) => {
          opened.push(url);
          return Promise.reject(new Error('URL não permitida'));
        },
      },
    });
    render(<TerminalView sessionName="s1" theme="dark" />);
    await flush();
    clickWebLink('http://localhost:5173/');
    clickOscLink('https://github.com/o/r/pull/1');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(opened).toEqual([
      'http://localhost:5173/',
      'https://github.com/o/r/pull/1',
    ]);
  });
});
