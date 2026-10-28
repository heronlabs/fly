import {Workspace, Worktree} from '../../../../src/core/domain/workspace';
import {FileStat, FileStore} from '../../../../src/core/interfaces/file-store';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {MAX_FILE_BYTES} from '../../../../src/core/services/file-rules';
import {
  CHANGED_ON_DISK,
  FileService,
  NOT_A_FILE,
  OUTSIDE_WORKTREE,
} from '../../../../src/core/services/file-service';
import {SessionService} from '../../../../src/core/services/session-service';

const worktree: Worktree = {
  id: 'a/feat',
  repoId: 'a',
  path: '/r/a/feat',
  branch: 'feat',
  head: 'h',
  isMain: false,
};
const workspace: Workspace = {root: '/r', repos: [], worktrees: [worktree]};

const dir = (name: string) => ({name, isDirectory: true, isFile: false});
const file = (name: string) => ({name, isDirectory: false, isFile: true});
const fileStat = (overrides: Partial<FileStat> = {}): FileStat => ({
  size: 3,
  mtimeMs: 100,
  isFile: true,
  isDirectory: false,
  ...overrides,
});
const enoent = (path: string) =>
  Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
    code: 'ENOENT',
  });

describe('FileService', () => {
  const currentWorkspace = vi.fn();
  const readDir = vi.fn();
  const realPath = vi.fn();
  const exists = vi.fn();
  const readText = vi.fn();
  const writeText = vi.fn();
  const createText = vi.fn();
  const stat = vi.fn();
  const status = vi.fn();
  const grep = vi.fn();
  const files: FileStore = {
    readDir,
    realPath,
    exists,
    readText,
    writeText,
    createText,
    stat,
    rename: vi.fn(),
  };
  const vcs: VcsGateway = {
    listWorktrees: vi.fn(),
    resolveBase: vi.fn(),
    diff: vi.fn(),
    status,
    grep,
    defaultBranch: vi.fn(),
    fetch: vi.fn(),
    validBranchName: vi.fn(),
    branchExists: vi.fn(),
    addWorktree: vi.fn(),
    headSha: vi.fn(),
    aheadCount: vi.fn(),
    push: vi.fn(),
    removeWorktree: vi.fn(),
    isAncestor: vi.fn(),
    deleteBranch: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    ensureIgnored: vi.fn(),
  };
  const service = new FileService(
    {currentWorkspace} as unknown as SessionService,
    files,
    vcs,
  );
  // realPath answers `real` for `path` and the path itself for anything else.
  const linking = (path: string, real: string) =>
    realPath.mockImplementation(async (p: string) => (p === path ? real : p));

  beforeEach(() => {
    currentWorkspace.mockReturnValue(workspace);
    realPath.mockImplementation(async (p: string) => p);
    exists.mockResolvedValue(true);
    stat.mockResolvedValue(fileStat());
    readText.mockResolvedValue('abc');
    writeText.mockResolvedValue(undefined);
    createText.mockResolvedValue(undefined);
    readDir.mockResolvedValue([]);
    status.mockResolvedValue({});
  });

  it('Should expose the pt-BR error copy', () => {
    expect(OUTSIDE_WORKTREE).toBe('Caminho fora do worktree');
    expect(NOT_A_FILE).toBe('Não é um arquivo');
    expect(CHANGED_ON_DISK).toBe(
      'Arquivo mudou no disco; recarregue antes de salvar',
    );
  });

  describe('worktree lookup', () => {
    it('Should throw for an unknown worktree id and touch nothing', async () => {
      await expect(service.list('nope', '')).rejects.toThrow(
        new Error('Worktree não encontrado'),
      );
      await expect(service.read('nope', 'a.ts')).rejects.toThrow(
        'Worktree não encontrado',
      );
      await expect(
        service.write('nope', 'a.ts', 'x', 'lf', null),
      ).rejects.toThrow('Worktree não encontrado');
      await expect(service.poll('nope', ['a.ts'])).rejects.toThrow(
        'Worktree não encontrado',
      );
      await expect(
        service.search('nope', {
          text: '',
          caseSensitive: false,
          wholeWord: false,
          regex: false,
        }),
      ).rejects.toThrow('Worktree não encontrado');
      expect(realPath).not.toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
      expect(grep).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should throw when no workspace is open', async () => {
      currentWorkspace.mockReturnValue(null);

      await expect(service.read('a/feat', 'a.ts')).rejects.toThrow(
        'Worktree não encontrado',
      );
    });
  });

  describe('list', () => {
    it('Should list the root with hidden names filtered, directories first', async () => {
      readDir.mockResolvedValue([
        file('b.ts'),
        dir('.git'),
        dir('src'),
        dir('node_modules'),
        file('A.md'),
        {name: 'link', isDirectory: false, isFile: false},
      ]);

      expect(await service.list('a/feat', '')).toEqual([
        {name: 'src', kind: 'dir'},
        {name: 'A.md', kind: 'file'},
        {name: 'b.ts', kind: 'file'},
      ]);
      expect(readDir).toHaveBeenCalledExactlyOnceWith('/r/a/feat');
      expect(realPath.mock.calls).toEqual([['/r/a/feat'], ['/r/a/feat']]);
    });

    it('Should list a sub directory', async () => {
      readDir.mockResolvedValue([file('z.ts'), dir('.worktrees'), dir('lib')]);

      expect(await service.list('a/feat', 'src/app')).toEqual([
        {name: 'lib', kind: 'dir'},
        {name: 'z.ts', kind: 'file'},
      ]);
      expect(readDir).toHaveBeenCalledExactlyOnceWith('/r/a/feat/src/app');
    });
  });

  describe('read', () => {
    it('Should read a text file with LF line breaks', async () => {
      readText.mockResolvedValue('a\nb\n');
      stat.mockResolvedValue(fileStat({mtimeMs: 123}));

      expect(await service.read('a/feat', 'src/a.ts')).toEqual({
        kind: 'text',
        path: 'src/a.ts',
        text: 'a\nb\n',
        eol: 'lf',
        mtimeMs: 123,
      });
      expect(stat).toHaveBeenCalledExactlyOnceWith('/r/a/feat/src/a.ts');
      expect(readText).toHaveBeenCalledExactlyOnceWith('/r/a/feat/src/a.ts');
    });

    it('Should normalise CRLF to LF and report the crlf EOL', async () => {
      readText.mockResolvedValue('a\r\nb\r\n');

      expect(await service.read('a/feat', 'w.bat')).toEqual({
        kind: 'text',
        path: 'w.bat',
        text: 'a\nb\n',
        eol: 'crlf',
        mtimeMs: 100,
      });
    });

    it('Should read a file of exactly the size cap as text', async () => {
      stat.mockResolvedValue(fileStat({size: MAX_FILE_BYTES}));

      expect(await service.read('a/feat', 'big.txt')).toMatchObject({
        kind: 'text',
        text: 'abc',
      });
    });

    it('Should report a file over the size cap as large without reading it', async () => {
      stat.mockResolvedValue(fileStat({size: MAX_FILE_BYTES + 1}));

      expect(await service.read('a/feat', 'big.txt')).toEqual({
        kind: 'large',
        path: 'big.txt',
        bytes: MAX_FILE_BYTES + 1,
      });
      expect(readText).not.toHaveBeenCalled();
    });

    it('Should report a file with a NUL as binary', async () => {
      readText.mockResolvedValue('PNG\0data');

      expect(await service.read('a/feat', 'logo.png')).toEqual({
        kind: 'binary',
        path: 'logo.png',
      });
    });

    it('Should reject a directory without reading it', async () => {
      stat.mockResolvedValue(fileStat({isFile: false, isDirectory: true}));

      await expect(service.read('a/feat', 'src')).rejects.toThrow(
        new Error('Não é um arquivo'),
      );
      expect(readText).not.toHaveBeenCalled();
    });

    it('Should reject when the file is deleted between stat and read', async () => {
      readText.mockRejectedValue(enoent('/r/a/feat/gone.ts'));

      await expect(service.read('a/feat', 'gone.ts')).rejects.toThrow(/ENOENT/);
    });
  });

  describe('write', () => {
    it("Should write the text with the file's EOL and return the new mtime", async () => {
      stat
        .mockResolvedValueOnce(fileStat({mtimeMs: 100}))
        .mockResolvedValueOnce(fileStat({mtimeMs: 200}));

      expect(
        await service.write('a/feat', 'src/a.ts', 'x\ny\n', 'crlf', 100),
      ).toEqual({mtimeMs: 200});
      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        '/r/a/feat/src/a.ts',
        'x\r\ny\r\n',
      );
      expect(stat.mock.calls).toEqual([
        ['/r/a/feat/src/a.ts'],
        ['/r/a/feat/src/a.ts'],
      ]);
      expect(createText).not.toHaveBeenCalled();
      expect(readDir).not.toHaveBeenCalled();
    });

    it('Should write LF text unchanged', async () => {
      await service.write('a/feat', 'a.ts', 'x\ny\n', 'lf', 100);

      expect(writeText).toHaveBeenCalledExactlyOnceWith(
        '/r/a/feat/a.ts',
        'x\ny\n',
      );
    });

    it('Should refuse to write when the mtime on disk differs', async () => {
      stat.mockResolvedValue(fileStat({mtimeMs: 150}));

      await expect(
        service.write('a/feat', 'a.ts', 'x', 'lf', 100),
      ).rejects.toThrow(
        new Error('Arquivo mudou no disco; recarregue antes de salvar'),
      );
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should skip the guard when no mtime is expected', async () => {
      stat.mockResolvedValue(fileStat({mtimeMs: 150}));

      expect(await service.write('a/feat', 'a.ts', 'x', 'lf', null)).toEqual({
        mtimeMs: 150,
      });
      expect(writeText).toHaveBeenCalledExactlyOnceWith('/r/a/feat/a.ts', 'x');
      expect(stat).toHaveBeenCalledOnce();
    });

    it("Should create a missing file exclusively, after checking the parent's real path, without the guard", async () => {
      exists.mockResolvedValue(false);
      stat.mockResolvedValue(fileStat({mtimeMs: 150}));

      expect(
        await service.write('a/feat', 'src/new.ts', 'x\ny\n', 'crlf', 100),
      ).toEqual({mtimeMs: 150});
      expect(exists).toHaveBeenCalledExactlyOnceWith('/r/a/feat/src/new.ts');
      expect(realPath.mock.calls).toEqual([['/r/a/feat'], ['/r/a/feat/src']]);
      expect(createText).toHaveBeenCalledExactlyOnceWith(
        '/r/a/feat/src/new.ts',
        'x\r\ny\r\n',
      );
      expect(stat).toHaveBeenCalledExactlyOnceWith('/r/a/feat/src/new.ts');
      expect(writeText).not.toHaveBeenCalled();
      expect(readDir).not.toHaveBeenCalled();
    });

    it('Should report a changed disk when the exclusive create finds the name taken', async () => {
      exists.mockResolvedValue(false);
      createText.mockRejectedValue(
        Object.assign(new Error('EEXIST: file already exists'), {
          code: 'EEXIST',
        }),
      );

      await expect(
        service.write('a/feat', 'src/new.ts', 'x', 'lf', null),
      ).rejects.toThrow(
        new Error('Arquivo mudou no disco; recarregue antes de salvar'),
      );
      expect(writeText).not.toHaveBeenCalled();
      expect(stat).not.toHaveBeenCalled();
    });

    it('Should let any other create failure propagate unchanged', async () => {
      exists.mockResolvedValue(false);
      const denied = Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      });
      createText.mockRejectedValue(denied);

      await expect(
        service.write('a/feat', 'src/new.ts', 'x', 'lf', null),
      ).rejects.toBe(denied);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should refuse a new file whose parent really lives outside the worktree', async () => {
      exists.mockResolvedValue(false);
      linking('/r/a/feat/out', '/elsewhere/out');

      await expect(
        service.write('a/feat', 'out/new.ts', 'x', 'lf', null),
      ).rejects.toThrow(new Error('Caminho fora do worktree'));
      expect(createText).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('poll', () => {
    it('Should return the git flags and the mtime of each open path', async () => {
      status.mockResolvedValue({'src/a.ts': 'M', 'new.ts': 'A'});
      stat.mockImplementation(async (path: string) => {
        if (path === '/r/a/feat/gone.ts') throw enoent(path);
        return fileStat({mtimeMs: path.length});
      });

      expect(
        await service.poll('a/feat', ['src/a.ts', 'gone.ts', '../x']),
      ).toEqual({
        flags: {'src/a.ts': 'M', 'new.ts': 'A'},
        mtimes: {
          'src/a.ts': '/r/a/feat/src/a.ts'.length,
          'gone.ts': null,
          '../x': null,
        },
        error: null,
      });
      expect(status).toHaveBeenCalledExactlyOnceWith('/r/a/feat');
    });

    it('Should return empty flags and the git error, still with the mtimes', async () => {
      status.mockRejectedValue(new Error('git falhou: boom'));

      expect(await service.poll('a/feat', ['a.ts'])).toEqual({
        flags: {},
        mtimes: {'a.ts': 100},
        error: 'git falhou: boom',
      });
    });

    it('Should give a null mtime for an open path that resolves outside the worktree', async () => {
      linking('/r/a/feat/link.ts', '/elsewhere/x');

      expect(await service.poll('a/feat', ['link.ts'])).toEqual({
        flags: {},
        mtimes: {'link.ts': null},
        error: null,
      });
      expect(stat).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const query = {
      text: 'foo',
      caseSensitive: false,
      wholeWord: false,
      regex: false,
    };

    it('Should grep the worktree with one hit over the per-file cap and group the hits', async () => {
      grep.mockResolvedValue([
        {path: 'src/a.ts', line: 3, text: 'const Foo = 1;'},
      ]);

      expect(await service.search('a/feat', query)).toEqual({
        files: [
          {
            path: 'src/a.ts',
            matches: [
              {
                line: 3,
                range: [6, 9],
                preview: 'const Foo = 1;',
                highlights: [[6, 9]],
              },
            ],
          },
        ],
        total: 1,
        truncated: false,
      });
      expect(grep).toHaveBeenCalledExactlyOnceWith({
        worktreePath: '/r/a/feat',
        query,
        maxPerFile: 101,
      });
    });

    it('Should highlight with the query options', async () => {
      grep.mockResolvedValue([{path: 'a.ts', line: 1, text: 'Foo foo'}]);

      const result = await service.search('a/feat', {
        ...query,
        caseSensitive: true,
      });

      expect(result.files[0]?.matches[0]?.highlights).toEqual([[4, 7]]);
    });

    it('Should return an empty result for an empty query without git', async () => {
      expect(await service.search('a/feat', {...query, text: ''})).toEqual({
        files: [],
        total: 0,
        truncated: false,
      });
      expect(grep).not.toHaveBeenCalled();
    });

    it('Should propagate a git failure', async () => {
      grep.mockRejectedValue(new Error('git falhou: bad regex'));

      await expect(service.search('a/feat', query)).rejects.toThrow(
        'git falhou: bad regex',
      );
    });
  });

  describe('containment', () => {
    it('Should refuse an unsafe relative path and touch nothing', async () => {
      await expect(service.read('a/feat', '../x')).rejects.toThrow(
        new Error('Caminho inválido'),
      );
      await expect(service.list('a/feat', '/etc')).rejects.toThrow(
        'Caminho inválido',
      );
      await expect(
        service.write('a/feat', 'a/../../x', 'x', 'lf', null),
      ).rejects.toThrow('Caminho inválido');
      expect(realPath).not.toHaveBeenCalled();
      expect(stat).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should refuse to read a symlinked file that points outside', async () => {
      linking('/r/a/feat/link.ts', '/elsewhere/x');

      await expect(service.read('a/feat', 'link.ts')).rejects.toThrow(
        new Error('Caminho fora do worktree'),
      );
      expect(stat).not.toHaveBeenCalled();
      expect(readText).not.toHaveBeenCalled();
    });

    it('Should refuse to list a symlinked directory that points outside', async () => {
      linking('/r/a/feat/linked', '/elsewhere/x');

      await expect(service.list('a/feat', 'linked')).rejects.toThrow(
        'Caminho fora do worktree',
      );
      expect(readDir).not.toHaveBeenCalled();
    });

    it('Should refuse to write over a symlinked file that points outside', async () => {
      linking('/r/a/feat/link.ts', '/elsewhere/x');

      await expect(
        service.write('a/feat', 'link.ts', 'x', 'lf', null),
      ).rejects.toThrow('Caminho fora do worktree');
      expect(realPath).toHaveBeenLastCalledWith('/r/a/feat/link.ts');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('Should refuse a sibling directory that shares the worktree name as a prefix', async () => {
      linking('/r/a/feat/x', '/r/a/feat-other/x');

      await expect(service.read('a/feat', 'x')).rejects.toThrow(
        'Caminho fora do worktree',
      );
    });

    it('Should compare real paths when the worktree itself is behind a symlink', async () => {
      realPath.mockImplementation(async (p: string) => `/private${p}`);

      expect(await service.read('a/feat', 'a.ts')).toMatchObject({
        kind: 'text',
      });
      expect(stat).toHaveBeenCalledExactlyOnceWith('/r/a/feat/a.ts');
    });
  });
});
