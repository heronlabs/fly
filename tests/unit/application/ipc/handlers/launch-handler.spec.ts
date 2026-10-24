import {LaunchHandler} from '../../../../../src/application/ipc/handlers/launch-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {LaunchService} from '../../../../../src/core/services/launch-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const broadcaster: Broadcaster = {send};
const plan = vi.fn();
let handler: LaunchHandler;

const take = () => listeners.get(channels.launchTake)!({});

beforeEach(() => {
  listeners.clear();
  plan.mockResolvedValue({
    root: '/w',
    base: '/w',
    folder: '/w/fly/src',
    worktree: '/w/fly',
    worktreeId: 'fly',
  });
  handler = new LaunchHandler(host, broadcaster, {
    plan,
  } as unknown as LaunchService);
  handler.register();
});

describe('LaunchHandler', () => {
  it('registers the take channel', () => {
    expect([...listeners.keys()]).toEqual([channels.launchTake]);
  });

  it('takes nothing before a request', async () => {
    expect(await take()).toBeNull();
    expect(plan).not.toHaveBeenCalled();
  });

  it('announces a request and plans it once when taken', async () => {
    handler.request('/w/fly/src');

    expect(send).toHaveBeenCalledWith(channels.launchRequested, null);
    expect(await take()).toEqual({root: '/w', worktreeId: 'fly'});
    expect(plan).toHaveBeenCalledWith('/w/fly/src');
    expect(await take()).toBeNull();
  });

  it('keeps only the latest request', async () => {
    handler.request('/a');
    handler.request('/w/fly/src');

    await take();

    expect(plan).toHaveBeenCalledTimes(1);
    expect(plan).toHaveBeenCalledWith('/w/fly/src');
  });

  it('ignores a launch without a folder', async () => {
    handler.request(null);

    expect(send).not.toHaveBeenCalled();
    expect(await take()).toBeNull();
  });

  it('rejects the take when the plan fails', async () => {
    plan.mockRejectedValue(new Error('Pasta não encontrada: /gone'));
    handler.request('/gone');

    await expect(take()).rejects.toThrow('Pasta não encontrada: /gone');
  });
});
