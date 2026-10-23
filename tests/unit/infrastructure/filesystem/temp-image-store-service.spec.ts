import {statSync} from 'node:fs';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';

import {TempImageStoreService} from '../../../../src/infrastructure/filesystem/temp-image-store-service';

describe('TempImageStoreService', () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  let dir: string;
  let store: TempImageStoreService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fly-images-'));
    store = new TempImageStoreService(dir);
  });

  afterEach(async () => {
    await rm(dir, {recursive: true, force: true});
  });

  it('Should write the bytes to image.png in a new fly-image- directory', async () => {
    const path = await store.savePng(png);

    expect(relative(dir, path)).toMatch(/^fly-image-[^/]+\/image\.png$/);
    expect(new Uint8Array(await readFile(path))).toEqual(png);
  });

  it('Should keep the directory private to the user', async () => {
    const path = await store.savePng(png);

    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);
  });

  it('Should never reuse a path across saves', async () => {
    const first = await store.savePng(png);
    const second = await store.savePng(new Uint8Array([1]));

    expect(second).not.toBe(first);
    expect(new Uint8Array(await readFile(first))).toEqual(png);
  });
});
