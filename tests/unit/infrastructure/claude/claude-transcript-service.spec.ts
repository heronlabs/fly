import {readFileSync, type Stats} from 'node:fs';
import {
  appendFile,
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import type {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {
  ClaudeTranscriptService,
  LIVE_WINDOW_MS,
  projectDirName,
} from '../../../../src/infrastructure/claude/claude-transcript-service';
import {TranscriptParser} from '../../../../src/infrastructure/claude/transcript-parser';

// ESM namespaces cannot be spied on: mock the module with spies that keep the
// real implementation, so tests can count `open` calls on real files.
vi.mock('node:fs/promises', {spy: true});

const FIXTURES = join(__dirname, '../../../fixtures/transcripts');
const ROOT = '/Users/u/w/repo';
const S = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const D = '44444444-4444-4444-8444-444444444444';
const OTHER = '33333333-3333-4333-8333-333333333333';
const KIB = 1024;
const NOW = 1_800_000_000_000;
const MINUTE = 60_000;

const text = (...ids: string[]): string =>
  ids.map(id => readFileSync(join(FIXTURES, `${id}.jsonl`), 'utf8')).join('');

/** What a fresh parser makes of the whole content, line by line. */
const parse = (content: string): TranscriptSummary => {
  const parser = new TranscriptParser();
  for (const line of content.split('\n')) parser.push(line);
  return parser.summary();
};

const expected = (...ids: string[]): TranscriptSummary => parse(text(...ids));

/** Seconds, for `utimes`, of the instant `ms` before NOW. */
const ago = (ms: number): number => (NOW - ms) / 1000;

const [C1_CLEAR = '', C1_LINK = ''] = text('c1').split('\n');

describe('projectDirName', () => {
  it('Should replace every char outside [A-Za-z0-9] with a dash', () => {
    expect(projectDirName('/Users/u/w/repo/.worktrees/feat_x y')).toBe(
      '-Users-u-w-repo--worktrees-feat-x-y',
    );
  });
});

describe('ClaudeTranscriptService', () => {
  let projects: string;
  let service: ClaudeTranscriptService;

  beforeEach(async () => {
    projects = await mkdtemp(join(tmpdir(), 'fly-transcripts-'));
    service = new ClaudeTranscriptService(projects);
  });

  afterEach(async () => {
    await rm(projects, {recursive: true, force: true});
  });

  const dirOf = (cwd: string): string => join(projects, projectDirName(cwd));

  /** Writes `<stem>.jsonl` in the project dir of `cwd`, mtime `seconds` if given. */
  const write = async (
    stem: string,
    content: string | Buffer,
    seconds?: number,
    cwd = ROOT,
  ): Promise<string> => {
    await mkdir(dirOf(cwd), {recursive: true});
    const path = join(dirOf(cwd), `${stem}.jsonl`);
    await writeFile(path, content);
    if (seconds !== undefined) await utimes(path, seconds, seconds);
    return path;
  };

  const session = (sessionId = S, launchCwd = ROOT) =>
    service.forSession({launchCwd, sessionId});

  /** Makes `open` fail with ENOENT for `path`, as if it vanished after the stat. */
  const vanishOnOpen = async (path: string, code = 'ENOENT'): Promise<void> => {
    const actual =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    vi.mocked(open).mockImplementation(((file: string, ...rest: unknown[]) =>
      file === path
        ? Promise.reject(Object.assign(new Error('gone'), {code}))
        : (actual.open as (...args: unknown[]) => unknown)(
            file,
            ...rest,
          )) as unknown as typeof open);
  };

  /** Wraps `open` so every handle's `read` and `close` calls are recorded. */
  const trackHandles = async (): Promise<
    {
      path: string;
      read: ReturnType<typeof vi.spyOn>;
      close: ReturnType<typeof vi.spyOn>;
    }[]
  > => {
    const actual =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );
    const handles: {
      path: string;
      read: ReturnType<typeof vi.spyOn>;
      close: ReturnType<typeof vi.spyOn>;
    }[] = [];
    vi.mocked(open).mockImplementation((async (
      file: string,
      ...rest: unknown[]
    ) => {
      const handle = await (
        actual.open as (
          ...args: unknown[]
        ) => Promise<Awaited<ReturnType<typeof open>>>
      )(file, ...rest);
      handles.push({
        path: file,
        read: vi.spyOn(handle, 'read'),
        close: vi.spyOn(handle, 'close'),
      });
      return handle;
    }) as unknown as typeof open);
    return handles;
  };

  const opened = (path: string): number =>
    vi.mocked(open).mock.calls.filter(([file]) => file === path).length;

  describe('forSession', () => {
    it('Should return null when the project dir does not exist', async () => {
      expect(await session()).toBeNull();
    });

    it('Should return null while the session file does not exist yet', async () => {
      await write(C, text('t1'));
      expect(await session()).toBeNull();
    });

    it('Should read the whole session file on the first call', async () => {
      await write(S, text('t1'));
      expect(await session()).toEqual(expected('t1'));
    });

    it('Should read only the bytes appended since the last read', async () => {
      const path = await write(S, text('w1'));
      await session();
      const handle = await open(path, 'r+');
      try {
        await handle.write(Buffer.from(' '.repeat(10)), 0, 10, 0);
      } finally {
        await handle.close();
      }
      await appendFile(path, text('t1'));
      // A re-read from byte 0 would skip the corrupted first line and take
      // launchCwd from the worktree line instead.
      expect(await session()).toMatchObject({
        launchCwd: ROOT,
        worktreePath: `${ROOT}/.worktrees/feat-add-retry`,
        phase: 'turn-ended',
      });
    });

    it('Should hold a half-written line until its newline arrives', async () => {
      const path = await write(S, text('t1'));
      await session();
      const line = text('t3');
      await appendFile(path, line.slice(0, 40));
      expect(await session()).toEqual(expected('t1'));
      await appendFile(path, line.slice(40));
      expect(await session()).toEqual(expected('t1', 't3'));
    });

    it('Should decode a character split across two appends', async () => {
      const line = Buffer.from(
        JSON.stringify({type: 'user', cwd: '/Users/u/ação 🚀'}) + '\n',
      );
      const split = line.indexOf(Buffer.from('🚀')) + 2;
      const path = await write(S, line.subarray(0, split));
      expect(await session()).toMatchObject({launchCwd: null});
      await appendFile(path, line.subarray(split));
      expect(await session()).toMatchObject({launchCwd: '/Users/u/ação 🚀'});
    });

    it('Should restart from byte 0 when the file was truncated and rewritten shorter', async () => {
      const path = await write(S, text('t4', 't5', 't6'));
      expect(await session()).toMatchObject({looping: true});
      await writeFile(path, text('t1'));
      expect(await session()).toEqual(expected('t1'));
    });

    it('Should restart from byte 0 when the file was replaced by a new inode', async () => {
      const path = await write(S, text('t1'));
      await session();
      const replacement = join(dirOf(ROOT), 'replacement.tmp');
      await writeFile(replacement, text('t4', 't5', 't6'));
      await rename(replacement, path);
      expect(await session()).toEqual(expected('t4', 't5', 't6'));
    });

    it('Should read a line longer than one read chunk', async () => {
      // The cwd sits after the 1.5 MiB payload: it is read only when the
      // line is decoded whole.
      const blob = JSON.stringify({
        type: 'api-request-blob',
        data: 'x'.repeat(1536 * KIB),
        cwd: '/Users/u/blob',
      });
      await write(S, `${blob}\n${text('t1')}`);
      expect(await session()).toMatchObject({
        phase: 'turn-ended',
        launchCwd: '/Users/u/blob',
      });
    });

    it('Should evict the least recently read of 65 files and re-read it', async () => {
      const paths: string[] = [];
      for (let index = 0; index < 65; index++) {
        const content = index === 0 ? text('t4', 't5', 't6') : text('t1');
        paths.push(await write(S, content, undefined, `/r/${index}`));
        await session(S, `/r/${index}`);
      }
      expect(await session(S, '/r/0')).toEqual(expected('t4', 't5', 't6'));
      expect(opened(paths[0] ?? '')).toBe(2);
      expect(await session(S, '/r/64')).toEqual(expected('t1'));
      expect(opened(paths[64] ?? '')).toBe(1);
    });

    it('Should read the file once when two callers ask at the same time', async () => {
      const path = await write(S, text('t9'));
      const fs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      let release = (): void => {};
      const gate = new Promise<void>(resolve => (release = resolve));
      // The first read stays open until the second caller has reached the
      // read too, so the two always overlap.
      vi.mocked(open).mockImplementationOnce(async (...args) => {
        await gate;
        return fs.open(...args);
      });
      const reads = vi.spyOn(
        service as unknown as {read(path: string): Promise<unknown>},
        'read',
      );
      const both = Promise.all([session(), session()]);
      await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(2));
      release();
      const [first, second] = await both;
      expect(first).toEqual(expected('t9'));
      expect(second).toEqual(expected('t9'));
      expect(first?.backgroundShells).toHaveLength(1);
      expect(opened(path)).toBe(1);
    });

    it('Should read the file with one exact-size read and close the handle', async () => {
      const path = await write(S, text('t1'));
      const handles = await trackHandles();
      await session();
      expect(handles).toHaveLength(1);
      const [handle] = handles;
      expect(handle?.read).toHaveBeenCalledTimes(1);
      expect(handle?.read.mock.calls[0]).toEqual([
        expect.objectContaining({length: Buffer.byteLength(text('t1'))}),
        0,
        Buffer.byteLength(text('t1')),
        0,
      ]);
      expect(handle?.close).toHaveBeenCalledTimes(1);
      expect(path).toBe(handle?.path);
    });

    it('Should size the buffer for the held remainder plus the appended bytes', async () => {
      const path = await write(S, text('t1'));
      await session();
      const line = text('t3');
      await appendFile(path, line.slice(0, 40));
      await session();
      const handles = await trackHandles();
      await appendFile(path, line.slice(40));
      await session();
      const [handle] = handles;
      expect(handle?.read).toHaveBeenCalledTimes(1);
      expect(handle?.read.mock.calls[0]).toEqual([
        expect.objectContaining({length: Buffer.byteLength(line)}),
        40,
        Buffer.byteLength(line) - 40,
        Buffer.byteLength(text('t1')) + 40,
      ]);
    });

    it('Should stop reading when the file is shorter than its stat said', async () => {
      const path = await write(S, text('t1'));
      const actual =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      vi.mocked(stat).mockImplementation((async (
        file: string,
        ...rest: unknown[]
      ) => {
        const stats = await (
          actual.stat as (...args: unknown[]) => Promise<Stats>
        )(file, ...rest);
        return file === path ? {...stats, size: stats.size + 50} : stats;
      }) as unknown as typeof stat);
      expect(await session()).toEqual(expected('t1'));
    });

    it('Should close the handle of a newer file after scanning its owner', async () => {
      await write(S, text('t1'), 1000);
      const successor = await write(C, text('c1', 't3'), 2000);
      const handles = await trackHandles();
      await session();
      const scan = handles.filter(handle => handle.path === successor);
      expect(scan.length).toBeGreaterThan(0);
      for (const handle of handles) {
        expect(handle.close).toHaveBeenCalledTimes(1);
      }
    });

    it('Should queue a third caller behind the second while the first has finished', async () => {
      const path = await write(S, text('t1'));
      const actual =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );
      const gates: (() => void)[] = [];
      let stats = 0;
      vi.mocked(open).mockImplementation((async (
        file: string,
        ...rest: unknown[]
      ) => {
        if (file === path) await new Promise<void>(r => gates.push(r));
        return (actual.open as (...args: unknown[]) => unknown)(file, ...rest);
      }) as unknown as typeof open);
      vi.mocked(stat).mockImplementation((async (
        file: string,
        ...rest: unknown[]
      ) => {
        if (file === path) stats++;
        return (actual.stat as (...args: unknown[]) => unknown)(file, ...rest);
      }) as unknown as typeof stat);
      const pause = (): Promise<void> =>
        new Promise(resolve => setTimeout(resolve, 30));

      // Each call stats the file twice before it reaches the read.
      const first = session();
      await vi.waitFor(() => expect(opened(path)).toBe(1));
      await appendFile(path, text('t3'));
      const second = session();
      await vi.waitFor(() => expect(stats).toBe(5));
      await pause();
      gates[0]?.();
      await vi.waitFor(() => expect(opened(path)).toBe(2));
      const third = session();
      await vi.waitFor(() => expect(stats).toBeGreaterThanOrEqual(8));
      await pause();
      // The second read is still running: the third must wait for it.
      expect(opened(path)).toBe(2);
      gates[1]?.();

      expect(await first).toEqual(expected('t1'));
      expect(await second).toEqual(expected('t1', 't3'));
      expect(await third).toEqual(expected('t1', 't3'));
      expect(opened(path)).toBe(2);
    });

    it('Should drop the per-path read chain once it settles', async () => {
      await write(S, text('t1'));
      await Promise.all([session(), session()]);
      await new Promise(resolve => setImmediate(resolve));
      expect(
        (service as unknown as {reads: Map<string, unknown>}).reads.size,
      ).toBe(0);
    });

    it('Should reject when the project dir is not a directory', async () => {
      await writeFile(dirOf(ROOT), 'x');
      await expect(session()).rejects.toMatchObject({code: 'ENOTDIR'});
    });

    it('Should reject when the session file cannot be read', async () => {
      const path = join(dirOf(ROOT), `${S}.jsonl`);
      await mkdir(path, {recursive: true});
      await writeFile(join(path, 'entry'), 'x');
      await expect(session()).rejects.toMatchObject({code: 'EISDIR'});
    });

    it('Should skip a candidate that vanished before its stat', async () => {
      await write(S, text('t1'), 1000);
      await symlink(join(dirOf(ROOT), 'missing'), join(dirOf(ROOT), 'x.jsonl'));
      expect(await session()).toEqual(expected('t1'));
    });

    it('Should skip a newer candidate that vanished before its owner scan', async () => {
      await write(S, text('t1'), 1000);
      const gone = await write(C, text('c1', 't3'), 2000);
      await vanishOnOpen(gone);
      expect(await session()).toEqual(expected('t1'));
    });

    it('Should reject when a newer candidate cannot be opened for another reason', async () => {
      await write(S, text('t1'), 1000);
      const broken = await write(C, text('c1', 't3'), 2000);
      await vanishOnOpen(broken, 'EACCES');
      await expect(session()).rejects.toMatchObject({code: 'EACCES'});
    });

    describe('after /clear', () => {
      /** The launch file holds T1; the newer successor holds `successor`. */
      const clear = async (successor: string): Promise<string> => {
        await write(S, text('t1'), 1000);
        return write(C, successor, 2000);
      };

      it('Should follow the newer file whose session_id is the launch uuid (C1)', async () => {
        await clear(text('c1', 't3'));
        expect(await session()).toEqual(expected('c1', 't3'));
      });

      it('Should keep reading the recorded successor on later calls', async () => {
        const successor = await clear(text('c1', 't3'));
        await session();
        await appendFile(successor, text('t1'));
        expect(await session()).toEqual(expected('c1', 't3', 't1'));
      });

      it('Should stay on the launch file while the successor has no session_id', async () => {
        await clear(`${C1_CLEAR}\n${text('t3')}`);
        expect(await session()).toEqual(expected('t1'));
      });

      it('Should re-check a small successor without session_id on the next call', async () => {
        const successor = await clear(`${C1_CLEAR}\n`);
        expect(await session()).toEqual(expected('t1'));
        await appendFile(successor, `${C1_LINK}\n${text('t3')}`);
        expect(await session()).toEqual(expected('c1', 't3'));
      });

      it('Should not follow a successor of another session and remember its owner', async () => {
        const successor = await clear(
          text('c1', 't3').replace(
            `"session_id":"${S}"`,
            `"session_id":"${OTHER}"`,
          ),
        );
        expect(await session()).toEqual(expected('t1'));
        expect(await session()).toEqual(expected('t1'));
        expect(opened(successor)).toBe(1);
      });

      it('Should scan only the first 256 KiB of a newer file and remember it has no owner', async () => {
        const filler = `${JSON.stringify({type: 'mode', data: 'x'.repeat(KIB)})}\n`;
        const successor = await clear(filler.repeat(300) + text('c1', 't3'));
        expect(await session()).toEqual(expected('t1'));
        expect(await session()).toEqual(expected('t1'));
        expect(opened(successor)).toBe(1);
      });

      it('Should skip malformed and non-object lines while looking for the owner', async () => {
        const noisy = `garbage\nnull\n"x"\n[1]\n{"session_id":5}\n${text('c1', 't3')}`;
        await clear(noisy);
        expect(await session()).toEqual(parse(noisy));
      });

      it('Should not follow an owned file with the same mtime as the current one', async () => {
        await write(S, text('t1'), 1000);
        await write(C, text('c1', 't3'), 1000);
        expect(await session()).toEqual(expected('t1'));
      });

      it('Should never take the current file as its own successor', async () => {
        // The current file is rewritten between the first stat and the listing.
        await write(S, text('c1', 't3'), 1000);
        await write(D, text('c1', 't4'), 800);
        const path = join(dirOf(ROOT), `${S}.jsonl`);
        const actual =
          await vi.importActual<typeof import('node:fs/promises')>(
            'node:fs/promises',
          );
        let first = true;
        vi.mocked(stat).mockImplementation((async (
          file: string,
          ...rest: unknown[]
        ) => {
          const stats = await (
            actual.stat as (...args: unknown[]) => Promise<Stats>
          )(file, ...rest);
          if (file !== path || !first) return stats;
          first = false;
          return {...stats, mtimeMs: 500_000};
        }) as unknown as typeof stat);
        expect(await session()).toEqual(expected('c1', 't4'));
      });

      it('Should ignore an owned file older than the current one', async () => {
        await write(S, text('t1'), 2000);
        await write(C, text('c1', 't3'), 1000);
        expect(await session()).toEqual(expected('t1'));
      });

      it('Should follow the newest of several successors', async () => {
        await clear(text('c1', 't3'));
        await write(D, text('c1', 't4'), 3000);
        expect(await session()).toEqual(expected('c1', 't4'));
      });
    });
  });

  describe('forDirectory', () => {
    const directory = (
      input: Partial<{since: number; exclude: string[]}> = {},
    ) =>
      service.forDirectory({
        cwd: ROOT,
        since: NOW - 60 * MINUTE,
        exclude: [],
        now: NOW,
        ...input,
      });

    it('Should return null when the project dir does not exist', async () => {
      expect(await directory()).toBeNull();
    });

    it('Should return null when the dir holds no transcript', async () => {
      await mkdir(join(dirOf(ROOT), 'memory'), {recursive: true});
      await writeFile(join(dirOf(ROOT), 'agent.meta.json'), '{}');
      expect(await directory()).toBeNull();
    });

    it('Should ignore a transcript older than since', async () => {
      await write(S, text('t1'), ago(61 * MINUTE));
      expect(await directory()).toBeNull();
    });

    it('Should keep a transcript written exactly at since', async () => {
      await write(S, text('t1'), ago(60 * MINUTE));
      expect(await directory()).toEqual(expected('t1'));
    });

    it('Should ignore a file that is not a .jsonl transcript', async () => {
      const path = join(dirOf(ROOT), 'agent.meta.json');
      await mkdir(dirOf(ROOT), {recursive: true});
      await writeFile(path, '{}');
      await utimes(path, ago(MINUTE), ago(MINUTE));
      expect(await directory()).toBeNull();
    });

    it('Should ignore a transcript whose stem is excluded', async () => {
      await write(S, text('t1'), ago(MINUTE));
      expect(await directory({exclude: [S]})).toBeNull();
    });

    it('Should ignore a transcript whose owner is excluded', async () => {
      await write(C, text('c1', 't3'), ago(MINUTE));
      expect(await directory({exclude: [S]})).toBeNull();
    });

    it('Should call two transcripts written within the live window ambiguous', async () => {
      await write(S, text('t1'), ago(MINUTE));
      await write(OTHER, text('t3'), ago(LIVE_WINDOW_MS - MINUTE));
      expect(await directory()).toBe('ambiguous');
    });

    it('Should count a transcript written exactly at the live window edge as live', async () => {
      await write(S, text('t1'), ago(MINUTE));
      await write(OTHER, text('t3'), ago(LIVE_WINDOW_MS));
      expect(await directory()).toBe('ambiguous');
    });

    it('Should keep a transcript whose owner is unknown', async () => {
      await write(S, '{"type":"user"}\n', ago(MINUTE));
      expect(await directory({exclude: [OTHER]})).toEqual(
        parse('{"type":"user"}\n'),
      );
    });

    it('Should read the live transcript when the other one is stale', async () => {
      await write(S, text('t1'), ago(MINUTE));
      await write(OTHER, text('t3'), ago(LIVE_WINDOW_MS + MINUTE));
      expect(await directory()).toEqual(expected('t1'));
    });

    it('Should read the newer of two stale transcripts', async () => {
      await write(S, text('t1'), ago(LIVE_WINDOW_MS + 5 * MINUTE));
      await write(OTHER, text('t3'), ago(LIVE_WINDOW_MS + MINUTE));
      expect(await directory()).toEqual(expected('t3'));
    });

    it('Should skip a candidate that vanished before its stat', async () => {
      await write(S, text('t1'), ago(MINUTE));
      await symlink(join(dirOf(ROOT), 'missing'), join(dirOf(ROOT), 'x.jsonl'));
      expect(await directory()).toEqual(expected('t1'));
    });

    it('Should skip a candidate that vanished before its owner scan', async () => {
      await write(S, text('t1'), ago(MINUTE));
      const gone = await write(OTHER, text('t3'), ago(2 * MINUTE));
      await vanishOnOpen(gone);
      expect(await directory()).toEqual(expected('t1'));
    });

    it('Should return null when its only candidate vanished before its owner scan', async () => {
      const gone = await write(S, text('t1'), ago(MINUTE));
      await vanishOnOpen(gone);
      expect(await directory()).toBeNull();
    });

    it('Should reject when the project dir is not a directory', async () => {
      await writeFile(dirOf(ROOT), 'x');
      await expect(directory()).rejects.toMatchObject({code: 'ENOTDIR'});
    });
  });
});
