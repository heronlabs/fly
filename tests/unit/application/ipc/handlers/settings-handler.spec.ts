import {SettingsHandler} from '../../../../../src/application/ipc/handlers/settings-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {SettingsService} from '../../../../../src/core/services/settings-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const get = vi.fn();
const update = vi.fn();

beforeEach(() => {
  listeners.clear();
  new SettingsHandler(host, {
    get,
    update,
  } as unknown as SettingsService).register();
});

describe('SettingsHandler', () => {
  it('get delegates to the settings service', async () => {
    const config = {recentRoots: [], theme: 'system'};
    get.mockResolvedValue(config);
    expect(await listeners.get(channels.settingsGet)!({})).toBe(config);
  });

  it('set delegates the patch to the settings service', async () => {
    const next = {recentRoots: [], theme: 'dark'};
    update.mockResolvedValue(next);
    const result = await listeners.get(channels.settingsSet)!(
      {},
      {theme: 'dark'},
    );
    expect(update).toHaveBeenCalledWith({theme: 'dark'});
    expect(result).toBe(next);
  });
});
