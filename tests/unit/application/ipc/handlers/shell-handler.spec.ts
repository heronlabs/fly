import {ShellHandler} from '../../../../../src/application/ipc/handlers/shell-handler';
import type {
  IpcHost,
  LinkOpener,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {EditorLauncher} from '../../../../../src/core/interfaces/editor-launcher';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const open = vi.fn();
const linkOpen = vi.fn();

beforeEach(() => {
  listeners.clear();
  linkOpen.mockReset();
  new ShellHandler(
    host,
    {open} as unknown as EditorLauncher,
    {open: linkOpen} as LinkOpener,
  ).register();
});

describe('ShellHandler', () => {
  it('open-in-editor delegates to the launcher', async () => {
    open.mockResolvedValue(undefined);
    await listeners.get(channels.shellOpenInEditor)!({}, '/wt');
    expect(open).toHaveBeenCalledWith('/wt');
  });

  it('propagates the launcher error message', async () => {
    open.mockRejectedValue(new Error('VSCode não encontrado'));
    await expect(
      listeners.get(channels.shellOpenInEditor)!({}, '/wt'),
    ).rejects.toThrow('VSCode não encontrado');
  });

  it('Should open an https URL', async () => {
    linkOpen.mockResolvedValue(undefined);
    await listeners.get(channels.shellOpenExternal)!(
      {},
      'https://github.com/x',
    );
    expect(linkOpen).toHaveBeenCalledWith('https://github.com/x');
  });

  it('Should open an http URL', async () => {
    linkOpen.mockResolvedValue(undefined);
    await listeners.get(channels.shellOpenExternal)!(
      {},
      'http://localhost:5173/',
    );
    expect(linkOpen).toHaveBeenCalledWith('http://localhost:5173/');
  });

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'not a url'])(
    'Should reject %s without opening it',
    async url => {
      await expect(
        listeners.get(channels.shellOpenExternal)!({}, url),
      ).rejects.toThrow('URL não permitida');
      expect(linkOpen).not.toHaveBeenCalled();
    },
  );
});
