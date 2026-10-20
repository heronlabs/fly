import {DirEntry, FileStore} from '../../../../src/core/interfaces/file-store';
import {
  VcsGateway,
  WorktreeInfo,
} from '../../../../src/core/interfaces/vcs-gateway';
import {WorkspaceService} from '../../../../src/core/services/workspace-service';

const root = '/ws';
const dir = (name: string): DirEntry => ({
  name,
  isDirectory: true,
  isFile: false,
});
const file = (name: string): DirEntry => ({
  name,
  isDirectory: false,
  isFile: true,
});
const wt = (
  path: string,
  branch: string | null,
  isMain: boolean,
  head = 'abc',
): WorktreeInfo => ({path, head, branch, isMain, locked: false});

describe('WorkspaceService', () => {
  let tree: Record<string, DirEntry[]>;
  const readDir = vi.fn(async (path: string) => {
    const entries = tree[path];
    if (!entries) throw new Error(`ENOENT ${path}`);
    return entries;
  });
  const realPath = vi.fn();
  const listWorktrees = vi.fn();
  const service = new WorkspaceService(
    {readDir, realPath} as unknown as FileStore,
    {listWorktrees} as unknown as VcsGateway,
  );

  beforeEach(() => {
    tree = {};
    realPath.mockReset();
    realPath.mockImplementation(async (p: string) => p);
    listWorktrees.mockReset();
    listWorktrees.mockImplementation(async (path: string) => [
      wt(path, 'main', true),
    ]);
  });

  it('Should find repos at depth 1 and 2 and group them by parent dir', async () => {
    tree = {
      [root]: [dir('talon'), dir('ai'), dir('actions')],
      [`${root}/talon`]: [dir('.git')],
      [`${root}/ai`]: [dir('supera'), dir('code-sessions')],
      [`${root}/ai/supera`]: [dir('.git')],
      [`${root}/ai/code-sessions`]: [dir('.git')],
      [`${root}/actions`]: [dir('action-s3-publish')],
      [`${root}/actions/action-s3-publish`]: [dir('.git')],
    };

    const ws = await service.discover(root);

    expect(ws.repos.map(r => r.id)).toEqual([
      'actions/action-s3-publish',
      'ai/code-sessions',
      'ai/supera',
      'talon',
    ]);
    expect(ws.repos[3]).toMatchObject({
      name: 'talon',
      group: '',
      path: `${root}/talon`,
    });
    expect(ws.repos[0]?.group).toBe('actions');
    expect(ws.repos[0]?.name).toBe('action-s3-publish');
  });

  it('Should ignore hidden dirs, node_modules and .git files (linked worktrees)', async () => {
    tree = {
      [root]: [
        dir('.worktrees'),
        dir('node_modules'),
        dir('.hidden'),
        file('f'),
      ],
      [`${root}/.worktrees`]: [dir('x')],
      [`${root}/.worktrees/x`]: [file('.git')],
      [`${root}/node_modules`]: [dir('pkg')],
      [`${root}/node_modules/pkg`]: [dir('.git')],
      [`${root}/.hidden`]: [dir('.git')],
    };

    expect(await service.discover(root)).toEqual({
      root,
      repos: [],
      worktrees: [],
    });
  });

  it('Should skip hidden, node_modules and .git-file dirs at depth 2', async () => {
    tree = {
      [root]: [dir('g')],
      [`${root}/g`]: [dir('.h'), dir('node_modules'), dir('linked'), file('x')],
      [`${root}/g/.h`]: [dir('.git')],
      [`${root}/g/node_modules`]: [dir('.git')],
      [`${root}/g/linked`]: [file('.git')],
    };

    expect((await service.discover(root)).repos).toEqual([]);
  });

  it('Should not descend below depth 2', async () => {
    tree = {
      [root]: [dir('a')],
      [`${root}/a`]: [dir('b')],
      [`${root}/a/b`]: [dir('c')],
      [`${root}/a/b/c`]: [dir('.git')],
    };

    expect((await service.discover(root)).repos).toEqual([]);
  });

  it('Should not descend into a depth-1 dir that is itself a repo', async () => {
    tree = {
      [root]: [dir('talon')],
      [`${root}/talon`]: [dir('.git'), dir('sub')],
      [`${root}/talon/sub`]: [dir('.git')],
    };

    const ws = await service.discover(root);

    expect(ws.repos.map(r => r.id)).toEqual(['talon']);
    expect(readDir).not.toHaveBeenCalledWith(`${root}/talon/sub`);
  });

  it('Should not treat the root itself as a repo', async () => {
    tree = {[root]: [dir('.git')]};

    expect((await service.discover(root)).repos).toEqual([]);
  });

  it('Should skip unreadable subdirectories', async () => {
    tree = {
      [root]: [dir('locked'), dir('talon')],
      [`${root}/talon`]: [dir('.git')],
    };

    const ws = await service.discover(root);

    expect(ws.repos.map(r => r.id)).toEqual(['talon']);
  });

  it('Should skip an unreadable depth-2 directory and keep its siblings', async () => {
    tree = {
      [root]: [dir('g')],
      [`${root}/g`]: [dir('locked'), dir('ok')],
      [`${root}/g/ok`]: [dir('.git')],
    };

    const ws = await service.discover(root);

    expect(ws.repos.map(r => r.id)).toEqual(['g/ok']);
  });

  it('Should normalise a root with a trailing slash', async () => {
    tree = {
      [root]: [dir('talon')],
      [`${root}/talon`]: [dir('.git')],
    };

    const ws = await service.discover(`${root}/`);

    expect(ws.root).toBe(`${root}/`);
    expect(ws.repos[0]).toMatchObject({id: 'talon', path: `${root}/talon`});
  });

  it('Should attach worktrees with ids relative to root and main first', async () => {
    tree = {[root]: [dir('talon')], [`${root}/talon`]: [dir('.git')]};
    listWorktrees.mockResolvedValue([
      wt(`${root}/talon/.worktrees/feat`, 'feat', false),
      wt(`${root}/talon`, 'main', true),
    ]);

    const ws = await service.discover(root);

    expect(listWorktrees).toHaveBeenCalledWith(`${root}/talon`);
    expect(ws.worktrees.map(w => w.id)).toEqual([
      'talon',
      'talon/.worktrees/feat',
    ]);
    expect(ws.worktrees[1]).toEqual({
      id: 'talon/.worktrees/feat',
      repoId: 'talon',
      path: `${root}/talon/.worktrees/feat`,
      branch: 'feat',
      head: 'abc',
      isMain: false,
    });
  });

  it('Should order non-main worktrees by branch, falling back to head', async () => {
    tree = {[root]: [dir('talon')], [`${root}/talon`]: [dir('.git')]};
    listWorktrees.mockResolvedValue([
      wt(`${root}/w/z`, 'zeta', false),
      wt(`${root}/w/d`, null, false, 'bbb'),
      wt(`${root}/w/a`, 'alpha', false),
      wt(`${root}/talon`, 'main', true),
    ]);

    const ws = await service.discover(root);

    expect(ws.worktrees.map(w => w.branch ?? w.head)).toEqual([
      'main',
      'alpha',
      'bbb',
      'zeta',
    ]);
  });

  it('Should order worktrees by repo id first', async () => {
    tree = {
      [root]: [dir('b'), dir('a')],
      [`${root}/b`]: [dir('.git')],
      [`${root}/a`]: [dir('.git')],
    };

    const ws = await service.discover(root);

    expect(ws.worktrees.map(w => w.repoId)).toEqual(['a', 'b']);
  });

  it('Should record the error on the repo and keep the others when listWorktrees rejects', async () => {
    tree = {
      [root]: [dir('talon'), dir('ai')],
      [`${root}/talon`]: [dir('.git')],
      [`${root}/ai`]: [dir('supera')],
      [`${root}/ai/supera`]: [dir('.git')],
    };
    listWorktrees.mockImplementation(async (path: string) => {
      if (path === `${root}/talon`) throw new Error('boom');
      return [wt(path, 'main', true)];
    });

    const ws = await service.discover(root);

    expect(ws.repos.find(r => r.id === 'talon')?.error).toBe('boom');
    expect(ws.repos.find(r => r.id === 'ai/supera')?.error).toBeUndefined();
    expect(ws.worktrees.some(w => w.repoId === 'talon')).toBe(false);
    expect(ws.worktrees.some(w => w.repoId === 'ai/supera')).toBe(true);
    expect(ws.worktrees.map(w => w.repoId)).toEqual(['ai/supera']);
  });

  it('Should stringify a non-Error rejection', async () => {
    tree = {[root]: [dir('talon')], [`${root}/talon`]: [dir('.git')]};
    listWorktrees.mockRejectedValue('nope');

    const ws = await service.discover(root);

    expect(ws.repos[0]?.error).toBe('nope');
  });

  it('Should return an empty workspace for a root without repos', async () => {
    tree = {[root]: []};

    expect(await service.discover(root)).toEqual({
      root,
      repos: [],
      worktrees: [],
    });
  });

  it('Should compute ids against the real path of a symlinked root', async () => {
    realPath.mockResolvedValue('/real/root');
    tree = {
      '/real/root': [dir('talon')],
      '/real/root/talon': [dir('.git')],
    };
    listWorktrees.mockResolvedValue([
      wt('/real/root/talon/.worktrees/feat', 'feat', false),
      wt('/real/root/talon', 'main', true),
    ]);

    const ws = await service.discover('/link/root');

    expect(realPath).toHaveBeenCalledWith('/link/root');
    expect(ws.root).toBe('/link/root');
    expect(ws.worktrees.map(w => w.id)).toEqual([
      'talon',
      'talon/.worktrees/feat',
    ]);
    expect(ws.worktrees.some(w => w.id.startsWith('..'))).toBe(false);
  });
});
