import {realpathSync, statSync} from 'node:fs';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
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

  it('Should list a dangling symlink as neither a file nor a directory, which does not exist', async () => {
    await symlink(join(dir, 'missing-target'), join(dir, 'dangling'));

    expect(await store.readDir(dir)).toEqual([
      {name: 'dangling', isDirectory: false, isFile: false},
    ]);
    expect(await store.exists(join(dir, 'dangling'))).toBe(false);
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

  it('Should stat a file with its size, mtime and file flag', async () => {
    const path = join(dir, 'a.txt');
    await writeFile(path, 'hello');

    expect(await store.stat(path)).toEqual({
      size: 5,
      mtimeMs: statSync(path).mtimeMs,
      isFile: true,
      isDirectory: false,
    });
  });

  it('Should stat a directory with its directory flag', async () => {
    await mkdir(join(dir, 'sub'));

    expect(await store.stat(join(dir, 'sub'))).toMatchObject({
      isFile: false,
      isDirectory: true,
    });
  });

  it('Should reject the stat of a missing path', async () => {
    await expect(store.stat(join(dir, 'missing'))).rejects.toThrow(/ENOENT/);
  });

  it('Should resolve a symlinked directory to its real path', async () => {
    await mkdir(join(dir, 'real'));
    await symlink(join(dir, 'real'), join(dir, 'link'));
    expect(await store.realPath(join(dir, 'link'))).toBe(
      realpathSync(join(dir, 'real')),
    );
  });
});
