import {parseWorktreePorcelain} from '../../../../src/infrastructure/git/worktree-porcelain-parser';

const sha1 = '1111111111111111111111111111111111111111';
const sha2 = '2222222222222222222222222222222222222222';
const sha3 = '3333333333333333333333333333333333333333';

describe('parseWorktreePorcelain', () => {
  it('Should parse main, branch, detached and locked blocks', () => {
    const sample = [
      'worktree /Users/x/heronlabs/talon',
      `HEAD ${sha1}`,
      'branch refs/heads/main',
      '',
      'worktree /Users/x/heronlabs/talon/.worktrees/feat-x',
      `HEAD ${sha2}`,
      'branch refs/heads/feat-x',
      '',
      'worktree /Users/x/heronlabs/talon/.worktrees/detached one',
      `HEAD ${sha3}`,
      'detached',
      'locked',
      '',
    ].join('\n');

    expect(parseWorktreePorcelain(sample)).toEqual([
      {
        path: '/Users/x/heronlabs/talon',
        head: sha1,
        branch: 'main',
        isMain: true,
        locked: false,
      },
      {
        path: '/Users/x/heronlabs/talon/.worktrees/feat-x',
        head: sha2,
        branch: 'feat-x',
        isMain: false,
        locked: false,
      },
      {
        path: '/Users/x/heronlabs/talon/.worktrees/detached one',
        head: sha3,
        branch: null,
        isMain: false,
        locked: true,
      },
    ]);
  });

  it('Should keep spaces and unicode in paths', () => {
    const out = [
      'worktree /tmp/ação do bob/repo',
      `HEAD ${sha1}`,
      'branch refs/heads/main',
      '',
    ].join('\n');

    expect(parseWorktreePorcelain(out)[0]?.path).toBe('/tmp/ação do bob/repo');
  });

  it('Should treat a locked line with a reason as locked and ignore unknown lines', () => {
    const out = [
      'worktree /r',
      `HEAD ${sha1}`,
      'branch refs/heads/main',
      '',
      'worktree /r/w',
      `HEAD ${sha2}`,
      'branch refs/heads/w',
      'locked some reason',
      'prunable gitdir file points to non-existent location',
    ].join('\n');

    expect(parseWorktreePorcelain(out)).toEqual([
      {path: '/r', head: sha1, branch: 'main', isMain: true, locked: false},
      {path: '/r/w', head: sha2, branch: 'w', isMain: false, locked: true},
    ]);
  });

  it('Should skip bare blocks and return [] for empty output', () => {
    const out = [
      'worktree /r.git',
      'bare',
      '',
      'worktree /r/w',
      `HEAD ${sha2}`,
      'branch refs/heads/w',
      '',
    ].join('\n');

    expect(parseWorktreePorcelain(out)).toEqual([
      {path: '/r/w', head: sha2, branch: 'w', isMain: false, locked: false},
    ]);
    expect(parseWorktreePorcelain('')).toEqual([]);
  });

  it('Should default head to empty and branch to null when lines are missing, and tolerate CRLF', () => {
    expect(parseWorktreePorcelain('worktree /r\r\n\r\n')).toEqual([
      {path: '/r', head: '', branch: null, isMain: true, locked: false},
    ]);
  });
});
