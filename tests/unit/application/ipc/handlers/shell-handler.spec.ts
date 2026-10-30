import {ShellHandler} from '../../../../../src/application/ipc/handlers/shell-handler';
import type {
  IpcHost,
  LinkOpener,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const linkOpen = vi.fn();

beforeEach(() => {
  listeners.clear();
  linkOpen.mockReset();
  new ShellHandler(host, {open: linkOpen} as LinkOpener).register();
});

describe('ShellHandler', () => {
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
