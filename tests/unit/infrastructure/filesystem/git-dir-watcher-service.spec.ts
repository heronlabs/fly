import {EventEmitter} from 'node:events';

import {Logger} from '@nestjs/common';

import {GitDirWatcherService} from '../../../../src/infrastructure/filesystem/git-dir-watcher-service';

const fsMock = vi.hoisted(() => ({watch: vi.fn(), existsSync: vi.fn()}));
vi.mock('node:fs', () => fsMock);

class FakeWatcher extends EventEmitter {
  close = vi.fn();
}

type Registered = {
  dir: string;
  watcher: FakeWatcher;
  fire: (event?: string, filename?: string | null) => void;
};

describe('GitDirWatcherService', () => {
  const service = new GitDirWatcherService();
  let registered: Registered[];
  let existing: Set<string>;

  const at = (dir: string) => registered.filter(r => r.dir === dir);
  const first = (dir: string): Registered => {
    const found = at(dir)[0];
    if (!found) throw new Error(`no watcher for ${dir}`);
    return found;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    registered = [];
    existing = new Set();
    fsMock.existsSync.mockImplementation((p: string) => existing.has(p));
    fsMock.watch.mockImplementation(
      (dir: string, _opts: unknown, listener: Registered['fire']) => {
        const watcher = new FakeWatcher();
        registered.push({dir, watcher, fire: listener});
        return watcher;
      },
    );
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Should watch .git and .git/worktrees non-persistently when both exist', () => {
    existing.add('/r/.git/worktrees');

    service.watch(['/r'], vi.fn());

    expect(registered.map(r => r.dir)).toEqual([
      '/r/.git',
      '/r/.git/worktrees',
    ]);
    expect(fsMock.watch).toHaveBeenCalledWith(
      '/r/.git',
      {persistent: false},
      expect.any(Function),
    );
  });

  it('Should debounce a burst of events into a single onChange after 300 ms', () => {
    existing.add('/r/.git/worktrees');
    const onChange = vi.fn();
    service.watch(['/r'], onChange);

    first('/r/.git').fire();
    vi.advanceTimersByTime(200);
    first('/r/.git/worktrees').fire();
    vi.advanceTimersByTime(299);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Should attach the worktrees watcher once a later .git event finds the dir', () => {
    const onChange = vi.fn();
    service.watch(['/r'], onChange);
    expect(at('/r/.git/worktrees')).toHaveLength(0);

    first('/r/.git').fire();
    expect(at('/r/.git/worktrees')).toHaveLength(0);

    existing.add('/r/.git/worktrees');
    first('/r/.git').fire();
    first('/r/.git').fire();

    expect(at('/r/.git/worktrees')).toHaveLength(1);
    first('/r/.git/worktrees').fire();
    vi.advanceTimersByTime(300);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Should ignore .git events for files other than HEAD and worktrees', () => {
    const onChange = vi.fn();
    service.watch(['/r'], onChange);

    for (const name of ['index', 'FETCH_HEAD', 'ORIG_HEAD'])
      first('/r/.git').fire('change', name);
    vi.advanceTimersByTime(300);

    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['HEAD', 'worktrees', null])(
    'Should react to the %s .git event',
    name => {
      const onChange = vi.fn();
      service.watch(['/r'], onChange);

      first('/r/.git').fire('change', name);
      vi.advanceTimersByTime(300);

      expect(onChange).toHaveBeenCalledTimes(1);
    },
  );

  it('Should treat an undefined filename as unnamed', () => {
    const onChange = vi.fn();
    service.watch(['/r'], onChange);

    first('/r/.git').fire('change');
    vi.advanceTimersByTime(300);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Should call onChange on the 15 s safety tick', () => {
    const onChange = vi.fn();
    service.watch([], onChange);

    vi.advanceTimersByTime(14_999);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15_000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Should log and swallow a synchronous fs.watch throw', () => {
    fsMock.watch.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    expect(() => service.watch(['/r'], vi.fn())).not.toThrow();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('Should log a non-Error throw from fs.watch', () => {
    fsMock.watch.mockImplementation(() => {
      throw 'weird';
    });

    expect(() => service.watch(['/r'], vi.fn())).not.toThrow();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('weird'),
    );
  });

  it('Should log and swallow watcher error events', () => {
    service.watch(['/r'], vi.fn());

    expect(() =>
      first('/r/.git').watcher.emit('error', new Error('EPERM')),
    ).not.toThrow();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('Should close every watcher, the interval and the pending debounce on dispose', () => {
    existing.add('/r/.git/worktrees');
    const onChange = vi.fn();
    const dispose = service.watch(['/r'], onChange);

    first('/r/.git').fire();
    dispose();
    vi.advanceTimersByTime(60_000);

    expect(onChange).not.toHaveBeenCalled();
    for (const r of registered)
      expect(r.watcher.close).toHaveBeenCalledTimes(1);
  });

  it('Should ignore events and not attach watchers after dispose', () => {
    const onChange = vi.fn();
    const dispose = service.watch(['/r'], onChange);
    dispose();

    existing.add('/r/.git/worktrees');
    first('/r/.git').fire();
    vi.advanceTimersByTime(1_000);

    expect(at('/r/.git/worktrees')).toHaveLength(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
