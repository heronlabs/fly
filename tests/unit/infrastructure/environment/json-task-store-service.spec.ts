import {TaskRecord} from '../../../../src/core/domain/task';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {JsonTaskStoreService} from '../../../../src/infrastructure/environment/json-task-store-service';

const tasksPath = '/u/tasks.json';
const exists = vi.fn();
const readText = vi.fn();
const writeText = vi.fn();
const fileStore: FileStore = {
  readDir: vi.fn(),
  realPath: vi.fn(),
  exists,
  readText,
  writeText,
  createText: vi.fn(),
  stat: vi.fn(),
};
let store: JsonTaskStoreService;

const record = (worktreePath: string, id = 'a'): TaskRecord => ({
  id,
  repoPath: '/r',
  worktreePath,
  branch: 'feat-a',
  base: 'main',
  model: null,
  promptFile: null,
  prNumber: null,
  phase: 'working',
  ciAttempts: 0,
  fixedSha: null,
  reviewSeenAt: null,
  review: null,
  outbox: null,
  pending: null,
  stop: null,
  createdAt: 1,
});

const withFile = (content: string): void => {
  exists.mockResolvedValue(true);
  readText.mockResolvedValue(content);
};

const written = (): unknown => JSON.parse(writeText.mock.calls.at(-1)![1]);

beforeEach(() => {
  exists.mockReset();
  readText.mockReset();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  exists.mockResolvedValue(false);
  store = new JsonTaskStoreService(fileStore, '/u');
});

describe('JsonTaskStoreService', () => {
  it('Should save a record, return it by worktree path and write the file', async () => {
    const a = record('/r/.worktrees/a');

    await store.save(a);

    expect(await store.get('/r/.worktrees/a')).toEqual(a);
    expect(writeText).toHaveBeenCalledWith(
      tasksPath,
      JSON.stringify([a], null, 2),
    );
  });

  it('Should return null for an unknown worktree path', async () => {
    await store.save(record('/r/.worktrees/a'));

    expect(await store.get('/r/.worktrees/b')).toBeNull();
  });

  it('Should replace a record saved with the same worktree path', async () => {
    await store.save(record('/r/.worktrees/a'));
    await store.save(record('/r/.worktrees/b', 'b'));
    const updated = {...record('/r/.worktrees/a'), phase: 'ci' as const};

    await store.save(updated);

    expect(written()).toEqual([updated, record('/r/.worktrees/b', 'b')]);
    expect(await store.list()).toEqual([
      updated,
      record('/r/.worktrees/b', 'b'),
    ]);
  });

  it('Should drop a removed record and keep the others', async () => {
    await store.save(record('/r/.worktrees/a'));
    await store.save(record('/r/.worktrees/b', 'b'));

    await store.remove('/r/.worktrees/a');

    expect(written()).toEqual([record('/r/.worktrees/b', 'b')]);
    expect(await store.get('/r/.worktrees/a')).toBeNull();
  });

  it('Should remove a record that is not the first', async () => {
    await store.save(record('/r/.worktrees/a'));
    await store.save(record('/r/.worktrees/b', 'b'));

    await store.remove('/r/.worktrees/b');

    expect(written()).toEqual([record('/r/.worktrees/a')]);
  });

  it('Should write nothing when removing an unknown record', async () => {
    await store.remove('/r/.worktrees/a');

    expect(writeText).not.toHaveBeenCalled();
  });

  it('Should return no records when the file is missing', async () => {
    expect(await store.list()).toEqual([]);
    expect(exists).toHaveBeenCalledWith(tasksPath);
    expect(readText).not.toHaveBeenCalled();
  });

  it('Should return no records when the file is not valid json', async () => {
    withFile('{not json');

    expect(await store.list()).toEqual([]);
  });

  it('Should return no records when the file cannot be read', async () => {
    exists.mockResolvedValue(true);
    readText.mockRejectedValue(new Error('EACCES'));

    expect(await store.list()).toEqual([]);
  });

  it.each(['null', '{}', '"x"', '42'])(
    'Should return no records when the json is not an array (%s)',
    async content => {
      withFile(content);

      expect(await store.list()).toEqual([]);
    },
  );

  it('Should keep only entries with string id and worktreePath', async () => {
    const good = record('/r/.worktrees/a');
    withFile(
      JSON.stringify([
        good,
        null,
        7,
        'x',
        {id: 'x'},
        {worktreePath: '/w'},
        {id: 1, worktreePath: '/w'},
        {id: 'x', worktreePath: 2},
      ]),
    );

    expect(await store.list()).toEqual([good]);
  });

  it('Should read the file once and serve later reads from memory', async () => {
    withFile(JSON.stringify([record('/r/.worktrees/a')]));

    await store.list();
    await store.get('/r/.worktrees/a');
    await store.save(record('/r/.worktrees/b', 'b'));
    await store.list();

    expect(readText).toHaveBeenCalledTimes(1);
    expect(exists).toHaveBeenCalledTimes(1);
  });

  it('Should append to the records already on disk', async () => {
    const a = record('/r/.worktrees/a');
    withFile(JSON.stringify([a]));

    await store.save(record('/r/.worktrees/b', 'b'));

    expect(written()).toEqual([a, record('/r/.worktrees/b', 'b')]);
  });

  it('Should not let callers mutate the stored list', async () => {
    await store.save(record('/r/.worktrees/a'));

    (await store.list()).pop();

    expect(await store.list()).toHaveLength(1);
  });

  it('Should keep every record when the first calls run concurrently', async () => {
    withFile('[]');
    const a = record('/r/.worktrees/a');
    const b = record('/r/.worktrees/b', 'b');

    await Promise.all([store.save(a), store.save(b)]);

    expect(readText).toHaveBeenCalledTimes(1);
    expect(written()).toEqual([a, b]);
    expect(await store.list()).toEqual([a, b]);
  });

  it('Should write in call order even when an earlier write finishes later', async () => {
    const releases: Array<() => void> = [];
    writeText.mockImplementation(
      () => new Promise<void>(resolve => releases.push(resolve)),
    );
    const a = record('/r/.worktrees/a');
    const b = record('/r/.worktrees/b', 'b');

    const first = store.save(a);
    const second = store.save(b);
    // Let the chain reach the first write, then free whatever is pending.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      releases.splice(0).forEach(release => release());
    }
    await Promise.all([first, second]);

    expect(writeText.mock.calls.map(call => JSON.parse(call[1]))).toEqual([
      [a],
      [a, b],
    ]);
    expect(releases).toHaveLength(0);
  });

  it('Should not start a write before the previous one finished', async () => {
    let active = 0;
    let overlap = false;
    writeText.mockImplementation(async () => {
      active++;
      overlap ||= active > 1;
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
    });

    await Promise.all([
      store.save(record('/r/.worktrees/a')),
      store.save(record('/r/.worktrees/b', 'b')),
      store.remove('/r/.worktrees/a'),
    ]);

    expect(overlap).toBe(false);
    expect(written()).toEqual([record('/r/.worktrees/b', 'b')]);
  });

  it('Should still run the next call after a write failed', async () => {
    writeText.mockRejectedValueOnce(new Error('ENOSPC'));
    const a = record('/r/.worktrees/a');
    const b = record('/r/.worktrees/b', 'b');

    const failed = store.save(a);
    const next = store.save(b);

    await expect(failed).rejects.toThrow('ENOSPC');
    await expect(next).resolves.toBeUndefined();
    expect(written()).toEqual([a, b]);
  });
});
