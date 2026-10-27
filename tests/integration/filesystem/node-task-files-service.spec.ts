import {existsSync} from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  truncate,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {MAX_ATTACHMENT_BYTES} from '../../../src/core/domain/task';
import {NodeTaskFilesService} from '../../../src/infrastructure/filesystem/node-task-files-service';

describe('NodeTaskFilesService', () => {
  let dir: string;
  let src: string;
  let files: NodeTaskFilesService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fly-task-files-'));
    src = await mkdtemp(join(tmpdir(), 'fly-task-src-'));
    files = new NodeTaskFilesService(dir);
  });

  afterEach(async () => {
    await rm(dir, {recursive: true, force: true});
    await rm(src, {recursive: true, force: true});
  });

  it('Should locate a task folder under tasks/<id>', () => {
    expect(files.dir('t1')).toBe(join(dir, 'tasks', 't1'));
  });

  it('Should write a file into the task folder and return its path', async () => {
    const path = await files.write('t1', 'prompt.md', 'x');

    expect(path).toBe(join(dir, 'tasks', 't1', 'prompt.md'));
    expect(await readFile(path, 'utf8')).toBe('x');
  });

  it('Should overwrite a file written before', async () => {
    await files.write('t1', 'prompt.md', 'x');
    await files.write('t1', 'prompt.md', 'y');

    expect(await files.read('t1', 'prompt.md')).toBe('y');
  });

  it('Should read a written file', async () => {
    await files.write('t1', 'prompt.md', 'hello');

    expect(await files.read('t1', 'prompt.md')).toBe('hello');
  });

  it('Should read null for a missing file', async () => {
    expect(await files.read('t1', 'nope.md')).toBeNull();
  });

  it('Should rethrow a read error other than a missing file', async () => {
    await mkdir(join(dir, 'tasks', 't1', 'prompt.md'), {recursive: true});

    await expect(files.read('t1', 'prompt.md')).rejects.toMatchObject({
      code: 'EISDIR',
    });
  });

  it('Should copy a source into attachments with the same bytes', async () => {
    const source = join(src, 'spec.pdf');
    const bytes = Buffer.from([1, 2, 3, 255]);
    await writeFile(source, bytes);

    const path = await files.copyIn('t1', source);

    expect(path).toBe(join(dir, 'tasks', 't1', 'attachments', 'spec.pdf'));
    expect(await readFile(path)).toEqual(bytes);
  });

  it('Should number sources that share a basename', async () => {
    const other = await mkdtemp(join(tmpdir(), 'fly-task-src-'));
    try {
      await writeFile(join(src, 'spec.pdf'), 'one');
      await writeFile(join(other, 'spec.pdf'), 'two');
      await writeFile(join(src, 'notes'), 'n1');
      await writeFile(join(other, 'notes'), 'n2');

      const first = await files.copyIn('t1', join(src, 'spec.pdf'));
      const second = await files.copyIn('t1', join(other, 'spec.pdf'));
      const third = await files.copyIn('t1', join(src, 'spec.pdf'));
      await files.copyIn('t1', join(src, 'notes'));
      const noExt = await files.copyIn('t1', join(other, 'notes'));

      const base = join(dir, 'tasks', 't1', 'attachments');
      expect(first).toBe(join(base, 'spec.pdf'));
      expect(second).toBe(join(base, 'spec-2.pdf'));
      expect(third).toBe(join(base, 'spec-3.pdf'));
      expect(noExt).toBe(join(base, 'notes-2'));
      expect(await readFile(first, 'utf8')).toBe('one');
      expect(await readFile(second, 'utf8')).toBe('two');
    } finally {
      await rm(other, {recursive: true, force: true});
    }
  });

  it('Should accept a source of exactly the maximum size', async () => {
    const source = join(src, 'ok.bin');
    await writeFile(source, '');
    await truncate(source, MAX_ATTACHMENT_BYTES);

    const path = await files.copyIn('t1', source);

    expect(existsSync(path)).toBe(true);
  });

  it('Should reject a source over the maximum size and copy nothing', async () => {
    const source = join(src, 'big.bin');
    await writeFile(source, '');
    await truncate(source, MAX_ATTACHMENT_BYTES + 1);

    await expect(files.copyIn('t1', source)).rejects.toThrow(
      'Arquivo maior que 20 MB: big.bin',
    );
    expect(existsSync(join(dir, 'tasks', 't1'))).toBe(false);
  });

  it('Should reject a source that does not exist', async () => {
    await expect(files.copyIn('t1', join(src, 'gone'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('Should rethrow a copy error other than a taken name', async () => {
    const source = join(src, 'folder');
    await mkdir(source);

    await expect(files.copyIn('t1', source)).rejects.toThrow();
    expect(await readdir(join(dir, 'tasks', 't1', 'attachments'))).toEqual([]);
  });

  it('Should remove the task folder', async () => {
    await files.write('t1', 'prompt.md', 'x');
    await files.write('t2', 'prompt.md', 'y');

    await files.remove('t1');

    expect(await readdir(join(dir, 'tasks'))).toEqual(['t2']);
  });

  it('Should resolve when removing a missing folder', async () => {
    await expect(files.remove('nope')).resolves.toBeUndefined();
  });

  it.each(['', '.', '..', 'a/b', 'a.b', '-a', '../x'])(
    'Should refuse the task id %j everywhere',
    async id => {
      const source = join(src, 'f');
      await writeFile(source, 'x');

      expect(() => files.dir(id)).toThrow(new Error('Caminho inválido'));
      await expect(files.write(id, 'a.md', 'x')).rejects.toThrow(
        'Caminho inválido',
      );
      await expect(files.read(id, 'a.md')).rejects.toThrow('Caminho inválido');
      await expect(files.copyIn(id, source)).rejects.toThrow(
        'Caminho inválido',
      );
      await expect(files.remove(id)).rejects.toThrow('Caminho inválido');
    },
  );

  it.each(['', '../x', 'a/b', '.hidden', '.', '..', '-a'])(
    'Should refuse the name %j in write and read',
    async name => {
      await expect(files.write('t1', name, 'x')).rejects.toThrow(
        'Caminho inválido',
      );
      await expect(files.read('t1', name)).rejects.toThrow('Caminho inválido');
    },
  );

  it.each([
    'prompt.md',
    'pr-request.md',
    'pr.json',
    'ci-123-abc1234.log',
    'review-42-1730000000000.md',
  ])('Should accept the name %s', async name => {
    await files.write('t1', name, 'x');

    expect(await files.read('t1', name)).toBe('x');
  });

  it('Should accept a uuid task id', () => {
    const id = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';

    expect(files.dir(id)).toBe(join(dir, 'tasks', id));
  });
});
