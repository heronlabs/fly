import {join} from 'node:path';

import {maxRecentRoots} from '../../../../src/core/domain/settings';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {JsonConfigStoreService} from '../../../../src/infrastructure/environment/json-config-store-service';

const dir = '/data';
const configPath = join(dir, 'config.json');
const exists = vi.fn();
const readText = vi.fn();
const writeText = vi.fn();
const fileStore: FileStore = {
  readDir: vi.fn(),
  realPath: vi.fn(),
  exists,
  readText,
  writeText,
  stat: vi.fn(),
};
let store: JsonConfigStoreService;

const withFile = (content: string): void => {
  exists.mockResolvedValue(true);
  readText.mockResolvedValue(content);
};

beforeEach(() => {
  exists.mockReset();
  readText.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  store = new JsonConfigStoreService(dir, fileStore);
});

describe('JsonConfigStoreService', () => {
  it('Should return defaults when the file is missing', async () => {
    exists.mockResolvedValue(false);

    expect(await store.load()).toEqual({
      recentRoots: [],
      theme: 'system',
      diffPanel: 'open',
    });
    expect(exists).toHaveBeenCalledWith(configPath);
    expect(readText).not.toHaveBeenCalled();
  });

  it('Should return a fresh object on every load', async () => {
    exists.mockResolvedValue(false);

    const first = await store.load();
    first.recentRoots.push('/mutated');

    expect((await store.load()).recentRoots).toEqual([]);
  });

  it('Should return defaults when the file is not valid json', async () => {
    withFile('{not json');

    expect(await store.load()).toEqual({
      recentRoots: [],
      theme: 'system',
      diffPanel: 'open',
    });
  });

  it('Should return defaults when the file cannot be read', async () => {
    exists.mockResolvedValue(true);
    readText.mockRejectedValue(new Error('EACCES'));

    expect(await store.load()).toEqual({
      recentRoots: [],
      theme: 'system',
      diffPanel: 'open',
    });
  });

  it.each(['null', '[]', '"text"', '42'])(
    'Should return defaults when the json is not an object (%s)',
    async content => {
      withFile(content);

      expect(await store.load()).toEqual({
        recentRoots: [],
        theme: 'system',
        diffPanel: 'open',
      });
    },
  );

  it('Should coerce invalid fields and drop unknown keys', async () => {
    withFile('{"theme":"neon","recentRoots":"x","extra":1}');

    expect(await store.load()).toEqual({
      recentRoots: [],
      theme: 'system',
      diffPanel: 'open',
    });
  });

  it('Should keep valid values', async () => {
    withFile('{"theme":"dark","recentRoots":["/a","/b"]}');

    expect(await store.load()).toEqual({
      recentRoots: ['/a', '/b'],
      theme: 'dark',
      diffPanel: 'open',
    });
  });

  it('Should load collapsed and a config saved before the diff panel existed', async () => {
    withFile('{"diffPanel":"collapsed"}');
    expect((await store.load()).diffPanel).toBe('collapsed');

    withFile('{"theme":"dark","recentRoots":[]}');
    expect((await store.load()).diffPanel).toBe('open');
  });

  it.each(['42', '"closed"', 'null', '{}'])(
    'Should fall back to open for diffPanel %s',
    async value => {
      withFile(`{"diffPanel":${value}}`);

      expect((await store.load()).diffPanel).toBe('open');
    },
  );

  it('Should round-trip collapsed through save and load', async () => {
    const config = {
      recentRoots: [],
      theme: 'system' as const,
      diffPanel: 'collapsed' as const,
    };
    await store.save(config);
    withFile(writeText.mock.calls[0]![1] as string);

    expect(await store.load()).toEqual(config);
  });

  it('Should keep only string roots and cap them at the maximum', async () => {
    const roots = Array.from({length: maxRecentRoots + 3}, (_, i) => `/r${i}`);
    withFile(
      JSON.stringify({recentRoots: [1, null, ...roots], theme: 'light'}),
    );

    const config = await store.load();

    expect(config.recentRoots).toEqual(roots.slice(0, maxRecentRoots));
    expect(config.theme).toBe('light');
  });

  it('Should write pretty json to config.json on save', async () => {
    const config = {
      recentRoots: ['/a'],
      theme: 'dark' as const,
      diffPanel: 'open' as const,
    };

    await store.save(config);

    expect(writeText).toHaveBeenCalledWith(
      configPath,
      JSON.stringify(config, null, 2),
    );
  });
});
