import {LaunchHandler} from '../../../../../src/application/ipc/handlers/launch-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {WindowWorkspacesService} from '../../../../../src/application/ipc/window-workspaces-service';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {Workspace} from '../../../../../src/core/domain/workspace';
import {LaunchService} from '../../../../../src/core/services/launch-service';
import {SettingsService} from '../../../../../src/core/services/settings-service';

const listeners = new Map<string, (...args: any[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const sendTo = vi.fn();
const broadcaster: Broadcaster = {send, sendTo};
const plan = vi.fn();
const get = vi.fn();
let windows: WindowWorkspacesService;
let handler: LaunchHandler;

const at = (root: string): Workspace => ({root, repos: [], worktrees: []});
const take = (windowId = 1) =>
  listeners.get(channels.launchTake)!({sender: {id: windowId}});

beforeEach(() => {
  listeners.clear();
  send.mockReset();
  sendTo.mockReset();
  plan.mockReset().mockResolvedValue({
    root: '/w',
    base: '/w',
    folder: '/w/fly/src',
    worktree: '/w/fly',
    worktreeId: 'fly',
  });
  get.mockReset().mockResolvedValue({recentRoots: []});
  windows = new WindowWorkspacesService();
  handler = new LaunchHandler(
    host,
    broadcaster,
    {plan} as unknown as LaunchService,
    windows,
    {get} as unknown as SettingsService,
  );
  handler.register();
});

describe('LaunchHandler', () => {
  it('registers the take channel', () => {
    expect([...listeners.keys()]).toEqual([channels.launchTake]);
  });

  it('takes nothing before a request when no folder was used', async () => {
    expect(await take()).toBeNull();
    expect(plan).not.toHaveBeenCalled();
  });

  it('tells only the window it is for, and plans it once when taken', async () => {
    handler.request(2, '/w/fly/src');

    expect(sendTo).toHaveBeenCalledExactlyOnceWith(
      2,
      channels.launchRequested,
      null,
    );
    expect(send).not.toHaveBeenCalled();
    expect(await take(1)).toBeNull();
    expect(await take(2)).toEqual({root: '/w', worktreeId: 'fly'});
    expect(plan).toHaveBeenCalledExactlyOnceWith('/w/fly/src');
    expect(await take(2)).toBeNull();
  });

  it("keeps only a window's latest request", async () => {
    handler.request(1, '/a');
    handler.request(1, '/w/fly/src');

    await take();

    expect(plan).toHaveBeenCalledExactlyOnceWith('/w/fly/src');
  });

  it('ignores a launch without a folder', async () => {
    handler.request(1, null);

    expect(sendTo).not.toHaveBeenCalled();
    expect(await take()).toBeNull();
  });

  it('rejects the take when the plan fails', async () => {
    plan.mockRejectedValue(new Error('Pasta não encontrada: /gone'));
    handler.request(1, '/gone');

    await expect(take()).rejects.toThrow('Pasta não encontrada: /gone');
  });

  it('drops the request of a closed window', async () => {
    handler.request(1, '/w/fly/src');
    handler.forget(1);

    expect(await take()).toBeNull();
    expect(plan).not.toHaveBeenCalled();
  });

  describe('without a request', () => {
    it('gives the first window the last folder used', async () => {
      get.mockResolvedValue({recentRoots: ['/last', '/older']});
      expect(await take()).toEqual({root: '/last', worktreeId: null});
    });

    it('gives a reloaded window its own folder back', async () => {
      get.mockResolvedValue({recentRoots: ['/last']});
      windows.set(1, at('/mine'));
      expect(await take()).toEqual({root: '/mine', worktreeId: null});
      expect(get).not.toHaveBeenCalled();
    });

    it('starts another window empty while one shows a folder', async () => {
      get.mockResolvedValue({recentRoots: ['/last']});
      windows.set(1, at('/last'));
      expect(await take(2)).toBeNull();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('windowFor', () => {
    it("finds the window that shows the folder's root", async () => {
      windows.set(1, at('/x'));
      windows.set(2, at('/w'));
      expect(await handler.windowFor('/w/fly/src')).toBe(2);
      expect(plan).toHaveBeenCalledWith('/w/fly/src');
    });

    it('finds none when no window shows the root', async () => {
      windows.set(1, at('/x'));
      expect(await handler.windowFor('/w/fly/src')).toBeNull();
    });

    it('finds none for a folder that cannot be planned', async () => {
      windows.set(1, at('/w'));
      plan.mockRejectedValue(new Error('Pasta não encontrada: /gone'));
      expect(await handler.windowFor('/gone')).toBeNull();
    });
  });
});
