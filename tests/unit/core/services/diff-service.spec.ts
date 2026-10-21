import {DiffFile} from '../../../../src/core/domain/diff';
import {Workspace, Worktree} from '../../../../src/core/domain/workspace';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {baseOf, DiffService} from '../../../../src/core/services/diff-service';
import {SessionService} from '../../../../src/core/services/session-service';

const wt = (
  id: string,
  repoId: string,
  branch: string | null,
  isMain = false,
  head = 'h',
): Worktree => ({id, repoId, path: `/r/${id}`, branch, head, isMain});

const workspace: Workspace = {
  root: '/r',
  repos: [],
  worktrees: [
    wt('a', 'a', 'main', true),
    wt('a/feat', 'a', 'feat'),
    wt('b', 'b', null, true, 'deadbeef'),
    wt('b/feat', 'b', 'feat'),
    wt('c/feat', 'c', 'feat'),
  ],
};

const file = (lines: number): DiffFile => ({
  path: 'f.ts',
  oldPath: null,
  status: 'modified',
  binary: false,
  additions: lines,
  deletions: 0,
  lines,
  hunks: [{header: '@@', lines: []}],
  truncated: false,
});

describe('baseOf', () => {
  const at = (id: string): Worktree =>
    workspace.worktrees.find(w => w.id === id) as Worktree;

  it('Should be the branch of the main worktree of the same repo', () => {
    expect(baseOf(workspace, at('a/feat'))).toBe('main');
  });

  it('Should be the head of a detached main worktree', () => {
    expect(baseOf(workspace, at('b/feat'))).toBe('deadbeef');
  });

  it('Should be null for the main worktree itself', () => {
    expect(baseOf(workspace, at('a'))).toBeNull();
  });

  it('Should be null when the repo lists no main worktree', () => {
    expect(baseOf(workspace, at('c/feat'))).toBeNull();
  });
});

describe('DiffService', () => {
  const diff = vi.fn();
  const currentWorkspace = vi.fn();
  const service = new DiffService(
    {currentWorkspace} as unknown as SessionService,
    {diff} as unknown as VcsGateway,
  );

  beforeEach(() => {
    diff.mockReset();
    currentWorkspace.mockReset().mockReturnValue(workspace);
  });

  it('Should throw for an unknown worktree id', async () => {
    await expect(service.read('nope', 'live')).rejects.toThrow(
      'Worktree não encontrado',
    );
  });

  it('Should throw when no workspace is open', async () => {
    currentWorkspace.mockReturnValue(null);

    await expect(service.read('a', 'live')).rejects.toThrow(
      'Worktree não encontrado',
    );
  });

  it('Should give a null diff and no error for the main worktree in branch scope', async () => {
    expect(await service.read('a', 'branch')).toEqual({
      worktreeId: 'a',
      scope: 'branch',
      base: null,
      diff: null,
      error: null,
    });
    expect(diff).not.toHaveBeenCalled();
  });

  it('Should read the branch diff against the base', async () => {
    diff.mockResolvedValue([file(2)]);

    const result = await service.read('a/feat', 'branch');

    expect(diff).toHaveBeenCalledWith({
      worktreePath: '/r/a/feat',
      scope: 'branch',
      base: 'main',
    });
    expect(result).toEqual({
      worktreeId: 'a/feat',
      scope: 'branch',
      base: 'main',
      diff: {files: [file(2)], truncated: false},
      error: null,
    });
  });

  it('Should read the live diff, reporting the base too', async () => {
    diff.mockResolvedValue([]);

    const result = await service.read('a/feat', 'live');

    expect(diff).toHaveBeenCalledWith({
      worktreePath: '/r/a/feat',
      scope: 'live',
    });
    expect(result).toEqual({
      worktreeId: 'a/feat',
      scope: 'live',
      base: 'main',
      diff: {files: [], truncated: false},
      error: null,
    });
  });

  it('Should read the live diff of the main worktree with a null base', async () => {
    diff.mockResolvedValue([]);

    const result = await service.read('a', 'live');

    expect(result.base).toBeNull();
    expect(result.diff).toEqual({files: [], truncated: false});
  });

  it('Should cap the diff', async () => {
    diff.mockResolvedValue([file(501)]);

    const result = await service.read('a/feat', 'live');

    expect(result.diff?.files[0]).toMatchObject({truncated: true, hunks: []});
  });

  it('Should turn a gateway rejection into an error string', async () => {
    diff.mockRejectedValue(new Error('git falhou: boom'));

    expect(await service.read('a/feat', 'live')).toEqual({
      worktreeId: 'a/feat',
      scope: 'live',
      base: 'main',
      diff: null,
      error: 'git falhou: boom',
    });
  });
});
