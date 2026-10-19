import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

import {GitDirWatcherService} from '../../../src/infrastructure/filesystem/git-dir-watcher-service';

describe('GitDirWatcherService (real git)', () => {
  let dir: string;

  const git = (...args: string[]) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=fly-test',
        '-c',
        'user.email=fly-test@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      {cwd: dir, stdio: 'pipe'},
    );

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-watch-')));
    git('init', '-b', 'main');
    git('commit', '--allow-empty', '-m', 'init');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should fire onChange within 2 s after git worktree add', async () => {
    const service = new GitDirWatcherService();
    let fired = 0;
    const dispose = service.watch([dir], () => {
      fired += 1;
    });
    try {
      await sleep(500);
      fired = 0;

      git('worktree', 'add', '.worktrees/feat-a', '-b', 'feat-a');
      const deadline = Date.now() + 2_000;
      while (fired === 0 && Date.now() < deadline) await sleep(50);

      expect(fired).toBeGreaterThan(0);

      // second worktree: .git/worktrees now exists and must be seen live
      await sleep(600);
      fired = 0;
      git('worktree', 'add', '.worktrees/feat-b', '-b', 'feat-b');
      const deadline2 = Date.now() + 2_000;
      while (fired === 0 && Date.now() < deadline2) await sleep(50);

      expect(fired).toBeGreaterThan(0);
    } finally {
      dispose();
    }
  });

  it('Should not fire within 1 s after dispose', async () => {
    const service = new GitDirWatcherService();
    let fired = 0;
    const dispose = service.watch([dir], () => {
      fired += 1;
    });
    await sleep(500);
    dispose();
    fired = 0;

    git('worktree', 'add', '.worktrees/feat-a', '-b', 'feat-a');
    await sleep(1_000);

    expect(fired).toBe(0);
  });
});
