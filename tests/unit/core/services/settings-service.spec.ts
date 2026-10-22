import {AppConfig, maxRecentRoots} from '../../../../src/core/domain/settings';
import {ConfigStore} from '../../../../src/core/interfaces/config-store';
import {SettingsService} from '../../../../src/core/services/settings-service';

const load = vi.fn();
const save = vi.fn();
const store: ConfigStore = {load, save};
let service: SettingsService;

beforeEach(() => {
  load.mockReset();
  save.mockReset();
  save.mockResolvedValue(undefined);
  service = new SettingsService(store);
});

describe('SettingsService', () => {
  it('Should return the stored config on get', async () => {
    const config: AppConfig = {
      recentRoots: ['/a'],
      theme: 'dark',
      diffPanel: 'open',
    };
    load.mockResolvedValue(config);

    expect(await service.get()).toEqual(config);
  });

  it('Should save and return the merged config on update', async () => {
    load.mockResolvedValue({
      recentRoots: ['/a'],
      theme: 'dark',
      diffPanel: 'open',
    });

    const result = await service.update({theme: 'light'});

    expect(result).toEqual({
      recentRoots: ['/a'],
      theme: 'light',
      diffPanel: 'open',
    });
    expect(save).toHaveBeenCalledWith(result);
  });

  it('Should prepend a new root on rememberRoot', async () => {
    load.mockResolvedValue({
      recentRoots: ['/a'],
      theme: 'system',
      diffPanel: 'open',
    });

    const result = await service.rememberRoot('/b');

    expect(result.recentRoots).toEqual(['/b', '/a']);
    expect(save).toHaveBeenCalledWith(result);
  });

  it('Should move an existing root to the front on rememberRoot', async () => {
    load.mockResolvedValue({
      recentRoots: ['/a', '/b', '/c'],
      theme: 'system',
      diffPanel: 'open',
    });

    const result = await service.rememberRoot('/c');

    expect(result.recentRoots).toEqual(['/c', '/a', '/b']);
  });

  it('Should cap recent roots at the maximum on rememberRoot', async () => {
    const roots = Array.from({length: maxRecentRoots}, (_, i) => `/r${i}`);
    load.mockResolvedValue({
      recentRoots: roots,
      theme: 'system',
      diffPanel: 'open',
    });

    const result = await service.rememberRoot('/new');

    expect(result.recentRoots).toHaveLength(maxRecentRoots);
    expect(result.recentRoots[0]).toBe('/new');
    expect(result.recentRoots).not.toContain(`/r${maxRecentRoots - 1}`);
  });
});
