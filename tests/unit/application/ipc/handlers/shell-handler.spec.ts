import {ShellHandler} from '../../../../../src/application/ipc/handlers/shell-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {EditorLauncher} from '../../../../../src/core/interfaces/editor-launcher';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const open = vi.fn();

beforeEach(() => {
  listeners.clear();
  new ShellHandler(host, {open} as unknown as EditorLauncher).register();
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
});
