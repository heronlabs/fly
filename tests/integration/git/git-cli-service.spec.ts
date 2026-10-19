import {execFileSync} from 'node:child_process';
import {mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {GitCliService} from '../../../src/infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from '../../../src/infrastructure/process/exec-command-runner-service';

describe('GitCliService (real git)', () => {
  let dir: string;

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-git-')));
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should list the main worktree and an added worktree', async () => {
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
    git('init', '-b', 'main');
    git('commit', '--allow-empty', '-m', 'init');
    git('worktree', 'add', '.worktrees/feat-a', '-b', 'feat-a');

    const service = new GitCliService(new ExecCommandRunnerService());
    const result = await service.listWorktrees(dir);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({path: dir, branch: 'main', isMain: true});
    expect(result[1]).toMatchObject({
      path: join(dir, '.worktrees', 'feat-a'),
      branch: 'feat-a',
      isMain: false,
    });
  });
});
