import {defaultConfig} from '../../../../src/core/domain/settings';
import {ConfigStore} from '../../../../src/core/interfaces/config-store';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {LaunchService} from '../../../../src/core/services/launch-service';

const realPath = vi.fn();
const stat = vi.fn();
const listWorktrees = vi.fn();
const load = vi.fn();
const service = new LaunchService(
  {realPath, stat} as unknown as FileStore,
  {listWorktrees} as unknown as VcsGateway,
  {load} as unknown as ConfigStore,
);

const dir = {size: 0, mtimeMs: 0, isFile: false, isDirectory: true};
const real: Record<string, string> = {
  '/link/w/fly': '/w/fly',
  '/link/w': '/w',
  '/x': '/x',
};

beforeEach(() => {
  realPath.mockImplementation(async (path: string) => {
    const target = real[path];
    if (target === undefined) throw new Error(`ENOENT: ${path}`);
    return target;
  });
  stat.mockResolvedValue(dir);
  load.mockResolvedValue({...defaultConfig, recentRoots: []});
  listWorktrees.mockRejectedValue(new Error('not a git repository'));
});

describe('LaunchService', () => {
  it('Should return the real path of a folder', async () => {
    expect(await service.folder('/link/w/fly')).toBe('/w/fly');
    expect(stat).toHaveBeenCalledWith('/w/fly');
  });

  it('Should refuse a missing path', async () => {
    await expect(service.folder('/gone')).rejects.toThrow(
      'Pasta não encontrada: /gone',
    );
  });

  it('Should refuse a path that is not a directory', async () => {
    stat.mockResolvedValue({...dir, isFile: true, isDirectory: false});
    await expect(service.folder('/x')).rejects.toThrow(
      'Pasta não encontrada: /x',
    );
  });

  it('Should plan with the real recent roots and the folder worktrees', async () => {
    load.mockResolvedValue({
      ...defaultConfig,
      recentRoots: ['/gone', '/link/w'],
    });
    listWorktrees.mockResolvedValue([
      {path: '/w/fly', head: 'h', branch: 'main', isMain: true, locked: false},
    ]);

    expect(await service.plan('/link/w/fly')).toEqual({
      root: '/link/w',
      base: '/w',
      folder: '/w/fly',
      worktree: '/w/fly',
      worktreeId: 'fly',
    });
    expect(listWorktrees).toHaveBeenCalledWith('/w/fly');
  });

  it('Should plan a folder outside git as its own root', async () => {
    expect(await service.plan('/x')).toEqual({
      root: '/x',
      base: '/x',
      folder: '/x',
      worktree: null,
      worktreeId: null,
    });
  });

  it('Should not plan a missing folder', async () => {
    await expect(service.plan('/gone')).rejects.toThrow(
      'Pasta não encontrada: /gone',
    );
    expect(load).not.toHaveBeenCalled();
  });
});
