import {TaskRecord} from '../../../../src/core/domain/task';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {JsonTaskStoreService} from '../../../../src/infrastructure/environment/json-task-store-service';

const tasksPath = '/u/tasks.json';
const tmpPath = '/u/tasks.json.tmp';
const exists = vi.fn();
const readText = vi.fn();
const writeText = vi.fn();
const rename = vi.fn();
const fileStore: FileStore = {
  readDir: vi.fn(),
  realPath: vi.fn(),
  exists,
  readText,
  writeText,
  createText: vi.fn(),
  stat: vi.fn(),
  rename,
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
  rename.mockReset();
  writeText.mockResolvedValue(undefined);
  rename.mockResolvedValue(undefined);
  exists.mockResolvedValue(false);
  store = new JsonTaskStoreService(fileStore, '/u');
});

describe('JsonTaskStoreService', () => {
  it('Should save a record, return it by worktree path and write the file', async () => {
    const a = record('/r/.worktrees/a');

    await store.save(a);

    expect(await store.get('/r/.worktrees/a')).toEqual(a);
    expect(writeText).toHaveBeenCalledWith(
      tmpPath,
      JSON.stringify([a], null, 2),
    );
  });

  it('Should write a temp file and rename it over tasks.json, in order', async () => {
    await store.save(record('/r/.worktrees/a'));

    expect(writeText.mock.calls.map(c => c[0])).toEqual([tmpPath]);
    expect(rename).toHaveBeenCalledWith(tmpPath, tasksPath);
    expect(writeText.mock.invocationCallOrder[0]).toBeLessThan(
      rename.mock.invocationCallOrder[0]!,
    );
  });

  it('Should not rename when the temp write failed', async () => {
    writeText.mockRejectedValueOnce(new Error('ENOSPC'));

    await expect(store.save(record('/r/.worktrees/a'))).rejects.toThrow(
      'ENOSPC',
    );
    expect(rename).not.toHaveBeenCalled();
  });

  it('Should hand out copies, never the stored records', async () => {
    const a = record('/r/.worktrees/a');
    await store.save(a);
    a.phase = 'stopped';

    const got = (await store.get('/r/.worktrees/a'))!;
    got.phase = 'ci';
    (await store.list())[0]!.branch = 'x';

    expect((await store.get('/r/.worktrees/a'))!.phase).toBe('working');
    expect((await store.list())[0]!.branch).toBe('feat-a');
  });

  it.each(['{', '{}'])(
    'Should keep a damaged file (%s) as .bad-<ms> and start empty',
    async content => {
      withFile(content);
      vi.spyOn(Date, 'now').mockReturnValue(1234);

      expect(await store.list()).toEqual([]);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(rename).toHaveBeenCalledWith(tasksPath, `${tasksPath}.bad-1234`);
      const a = record('/r/.worktrees/a');
      await store.save(a);
      expect(rename).toHaveBeenLastCalledWith(tmpPath, tasksPath);
      expect(written()).toEqual([a]);
      vi.restoreAllMocks();
    },
  );

  it('Should keep an unreadable file as .bad-<ms>', async () => {
    exists.mockResolvedValue(true);
    readText.mockRejectedValue(new Error('EACCES'));
    vi.spyOn(Date, 'now').mockReturnValue(7);

    expect(await store.list()).toEqual([]);
    expect(rename).toHaveBeenCalledWith(tasksPath, `${tasksPath}.bad-7`);
    vi.restoreAllMocks();
  });

  it('Should start empty even when keeping the damaged file fails', async () => {
    withFile('{');
    rename.mockRejectedValue(new Error('EPERM'));

    expect(await store.list()).toEqual([]);
    expect(await store.list()).toEqual([]);
    expect(readText).toHaveBeenCalledTimes(1);
  });

  it('Should not rename a missing or valid file', async () => {
    await store.list();
    store = new JsonTaskStoreService(fileStore, '/u');
    withFile('[]');
    await store.list();

    expect(rename).not.toHaveBeenCalled();
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

  describe('saveIfUnchanged', () => {
    const a = record('/r/.worktrees/a');
    const b = record('/r/.worktrees/b', 'b');
    const after = {...a, phase: 'ci' as const, prNumber: 42};

    it('Should replace a record still equal to the one read', async () => {
      await store.save(b);
      await store.save(a);

      expect(await store.saveIfUnchanged(a, after)).toBe(true);

      expect(await store.list()).toEqual([b, after]);
      expect(written()).toEqual([b, after]);
    });

    it.each<[string, TaskRecord]>([
      ['changed', {...a, phase: 'stopped'}],
      ['of another task', {...a, id: 'z'}],
    ])('Should write nothing over a record %s', async (_name, stored) => {
      await store.save(stored);
      writeText.mockClear();

      expect(await store.saveIfUnchanged(a, after)).toBe(false);

      expect(await store.get(a.worktreePath)).toEqual(stored);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should not bring back a removed record', async () => {
      await store.save(a);
      await store.remove(a.worktreePath);
      writeText.mockClear();

      expect(await store.saveIfUnchanged(a, after)).toBe(false);

      expect(await store.list()).toEqual([]);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should check after a save queued before it', async () => {
      await store.save(a);
      const resumed = {
        ...a,
        ciAttempts: 0,
        review: null,
        phase: 'working' as const,
        stop: null,
        fixedSha: null,
        createdAt: 2,
      };

      const results = await Promise.all([
        store.save(resumed),
        store.saveIfUnchanged(a, after),
      ]);

      expect(results).toEqual([undefined, false]);
      expect(await store.get(a.worktreePath)).toEqual(resumed);
    });

    it('Should keep a copy of the record it saves', async () => {
      await store.save(a);
      const mine: TaskRecord = structuredClone(after);
      await store.saveIfUnchanged(a, mine);
      mine.phase = 'stopped';
      expect(await store.get(a.worktreePath)).toEqual(after);
    });
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

  it('Should keep only entries that pass the guard', async () => {
    const good = record('/r/.worktrees/a');
    const bad = [
      null,
      7,
      'x',
      {...good, id: 1},
      {...good, repoPath: 1},
      {...good, worktreePath: 2},
      {...good, branch: null},
      {...good, base: undefined},
      {...good, phase: 'done'},
      {...good, phase: 1},
      {...good, ciAttempts: '0'},
      {...good, createdAt: '1'},
    ];
    withFile(JSON.stringify([good, ...bad]));

    expect(await store.list()).toEqual([good]);
  });

  it.each(['working', 'opening', 'ci', 'fixing', 'reviewing', 'stopped'])(
    'Should accept phase %s',
    async phase => {
      const r = {...record('/r/.worktrees/a'), phase};
      withFile(JSON.stringify([r]));

      expect(await store.list()).toEqual([r]);
    },
  );

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
