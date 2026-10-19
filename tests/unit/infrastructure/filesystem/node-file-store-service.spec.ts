import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {NodeFileStoreService} from '../../../../src/infrastructure/filesystem/node-file-store-service';

describe('NodeFileStoreService', () => {
  const store = new NodeFileStoreService();
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fly-fs-'));
  });

  afterEach(async () => {
    await rm(dir, {recursive: true, force: true});
  });

  it('Should list entries with correct directory and file flags', async () => {
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'a.txt'), 'x');
    const entries = await store.readDir(dir);
    expect(entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      {name: 'a.txt', isDirectory: false, isFile: true},
      {name: 'sub', isDirectory: true, isFile: false},
    ]);
  });

  it('Should report whether a path exists', async () => {
    await writeFile(join(dir, 'a.txt'), 'x');
    expect(await store.exists(join(dir, 'a.txt'))).toBe(true);
    expect(await store.exists(join(dir, 'missing'))).toBe(false);
  });

  it('Should round-trip text through a nested path that did not exist', async () => {
    const path = join(dir, 'a', 'b', 'c.json');
    await store.writeText(path, '{"k":1}');
    expect(await store.readText(path)).toBe('{"k":1}');
  });
});
