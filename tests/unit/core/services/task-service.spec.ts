import {NewTaskInput} from '../../../../src/core/domain/task';
import {Workspace} from '../../../../src/core/domain/workspace';
import {FileStore} from '../../../../src/core/interfaces/file-store';
import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {PrGateway} from '../../../../src/core/interfaces/pr-gateway';
import {TaskFiles} from '../../../../src/core/interfaces/task-files';
import {TaskStore} from '../../../../src/core/interfaces/task-store';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {SessionService} from '../../../../src/core/services/session-service';
import {TaskService} from '../../../../src/core/services/task-service';

const mainPath = '/r/talon';
const workspace: Workspace = {
  root: '/r',
  repos: [{id: 'talon', name: 'talon', group: '', path: mainPath}],
  worktrees: [],
};

describe('TaskService', () => {
  const hex = vi.fn();
  const uuid = vi.fn();
  const ids = {hex, uuid} as unknown as IdGenerator;
  const currentWorkspace = vi.fn();
  const sessions = {currentWorkspace} as unknown as SessionService;
  const validBranchName = vi.fn();
  const branchExists = vi.fn();
  const defaultBranch = vi.fn();
  const fetch = vi.fn();
  const addWorktree = vi.fn();
  const ensureIgnored = vi.fn();
  const vcs = {
    validBranchName,
    branchExists,
    defaultBranch,
    fetch,
    addWorktree,
    ensureIgnored,
  } as unknown as VcsGateway;
  const prDefaultBranch = vi.fn();
  const prs = {defaultBranch: prDefaultBranch} as unknown as PrGateway;
  const exists = vi.fn();
  const stat = vi.fn();
  const files = {exists, stat} as unknown as FileStore;
  const save = vi.fn();
  const tasks = {save} as unknown as TaskStore;
  const write = vi.fn();
  const copyIn = vi.fn();
  const taskFiles = {write, copyIn} as unknown as TaskFiles;
  const launch = vi.fn();
  const calls: string[] = [];
  let service: TaskService;

  const input = (over: Partial<NewTaskInput> = {}): NewTaskInput => ({
    repoId: 'talon',
    description: 'Faz X\ncom exemplo',
    branch: 'feat-x',
    model: null,
    attachments: [],
    ...over,
  });

  beforeEach(() => {
    vi.resetAllMocks();
    hex.mockReturnValue('abc123');
    uuid.mockReturnValue('u1');
    currentWorkspace.mockReturnValue(workspace);
    calls.length = 0;
    const track = (
      name: string,
      fn: ReturnType<typeof vi.fn>,
      value: unknown,
    ) =>
      fn.mockImplementation(async () => {
        calls.push(name);
        return value;
      });
    track('validBranchName', validBranchName, true);
    track('branchExists', branchExists, false);
    track('exists', exists, false);
    track('defaultBranch', defaultBranch, 'main');
    track('fetch', fetch, undefined);
    track('addWorktree', addWorktree, undefined);
    track('ensureIgnored', ensureIgnored, undefined);
    track('copyIn', copyIn, '/u/tasks/u1/attachments/spec.md');
    track('write', write, '/u/tasks/u1/prompt.md');
    track('launch', launch, 'sess-1');
    track('save', save, undefined);
    stat.mockResolvedValue({size: 10, isFile: true});
    (sessions as unknown as {launch: typeof launch}).launch = launch;
    service = new TaskService(sessions, ids, vcs, prs, files, tasks, taskFiles);
  });

  describe('create', () => {
    it('Should fail without a workspace', async () => {
      currentWorkspace.mockReturnValue(null);
      await expect(service.create(input())).rejects.toThrow(
        'Nenhuma pasta aberta',
      );
    });

    it('Should fail for an unknown repo', async () => {
      await expect(service.create(input({repoId: 'nope'}))).rejects.toThrow(
        'Repositório não encontrado',
      );
    });

    it('Should fail for a blank description', async () => {
      await expect(
        service.create(input({description: ' \n '})),
      ).rejects.toThrow('Descreva a tarefa');
    });
  });

  describe('create on the worktree flow', () => {
    const path = '/r/talon/.worktrees/feat-x';

    it('Should create the worktree from the fetched default branch and start claude in it', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(1234);
      const name = await service.create(
        input({attachments: ['/d/spec.md'], model: 'opus'}),
      );
      vi.useRealTimers();
      expect(name).toBe('sess-1');
      expect(calls).toEqual([
        'validBranchName',
        'branchExists',
        'exists',
        'defaultBranch',
        'fetch',
        'addWorktree',
        'ensureIgnored',
        'copyIn',
        'write',
        'launch',
        'save',
      ]);
      expect(validBranchName).toHaveBeenCalledWith(mainPath, 'feat-x');
      expect(branchExists).toHaveBeenCalledWith(mainPath, 'feat-x');
      expect(exists).toHaveBeenCalledWith(path);
      expect(defaultBranch).toHaveBeenCalledWith(mainPath);
      expect(fetch).toHaveBeenCalledWith(mainPath, 'main');
      expect(addWorktree).toHaveBeenCalledWith({
        repoPath: mainPath,
        path,
        branch: 'feat-x',
        base: 'origin/main',
      });
      expect(ensureIgnored).toHaveBeenCalledWith(mainPath, '.worktrees');
      expect(copyIn).toHaveBeenCalledWith('u1', '/d/spec.md');
      expect(write).toHaveBeenCalledWith(
        'u1',
        'prompt.md',
        'Faz X\ncom exemplo\n\nArquivos anexados:\n- /u/tasks/u1/attachments/spec.md',
      );
      expect(launch).toHaveBeenCalledWith('talon/.worktrees/feat-x', path, {
        promptFile: '/u/tasks/u1/prompt.md',
        model: 'opus',
        task: 'Faz X com exemplo',
      });
      expect(save).toHaveBeenCalledWith({
        id: 'u1',
        repoPath: mainPath,
        worktreePath: path,
        branch: 'feat-x',
        base: 'main',
        model: 'opus',
        promptFile: '/u/tasks/u1/prompt.md',
        prNumber: null,
        phase: 'working',
        ciAttempts: 0,
        fixedSha: null,
        reviewSeenAt: null,
        review: null,
        outbox: null,
        pending: null,
        stop: null,
        createdAt: 1234,
      });
    });

    it('Should write a bare prompt without attachments, cleaned and trimmed', async () => {
      await service.create(input({description: '  a\u0007 $(x) "q"\r\n  '}));
      expect(copyIn).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith('u1', 'prompt.md', 'a $(x) "q"');
    });

    it('Should list every attachment copy in order', async () => {
      copyIn.mockResolvedValueOnce('/p/a').mockResolvedValueOnce('/p/b');
      await service.create(input({attachments: ['/d/a', '/d/b']}));
      expect(write.mock.calls[0]?.[2]).toBe(
        'Faz X\ncom exemplo\n\nArquivos anexados:\n- /p/a\n- /p/b',
      );
    });

    it('Should label the session with the first 200 code points', async () => {
      await service.create(input({description: `${'a'.repeat(199)}🚀bbb`}));
      expect(launch.mock.calls[0]?.[2].task).toBe(`${'a'.repeat(199)}🚀`);
    });

    it('Should fall back to gh for the default branch', async () => {
      defaultBranch.mockResolvedValue(null);
      prDefaultBranch.mockResolvedValue('trunk');
      await service.create(input());
      expect(prDefaultBranch).toHaveBeenCalledWith(mainPath);
      expect(fetch).toHaveBeenCalledWith(mainPath, 'trunk');
      expect(addWorktree.mock.calls[0]?.[0].base).toBe('origin/trunk');
      expect(save.mock.calls[0]?.[0].base).toBe('trunk');
    });

    it('Should not ask gh when git knows the default branch', async () => {
      await service.create(input());
      expect(prDefaultBranch).not.toHaveBeenCalled();
    });

    it('Should accept exactly the maximum prompt and attachment size', async () => {
      stat.mockResolvedValue({size: 20 * 1024 * 1024, isFile: true});
      await service.create(
        input({description: 'a'.repeat(100_000), attachments: ['/d/a']}),
      );
      expect(addWorktree).toHaveBeenCalled();
    });

    const rejected: [string, Partial<NewTaskInput>, () => void, string][] = [
      [
        'an invalid branch name',
        {},
        () => validBranchName.mockResolvedValue(false),
        'Nome de branch inválido',
      ],
      [
        'an existing branch',
        {},
        () => branchExists.mockResolvedValue(true),
        'O branch feat-x já existe',
      ],
      [
        'an existing folder',
        {},
        () => exists.mockResolvedValue(true),
        `Já existe uma pasta em ${path}`,
      ],
      ['an unknown model', {model: 'gpt'}, () => undefined, 'Modelo inválido'],
      [
        'a prompt over the limit',
        {description: 'a'.repeat(100_001)},
        () => undefined,
        'Prompt muito longo (máx. 100000 caracteres)',
      ],
      [
        'an attachment over the limit',
        {attachments: ['/d/ok.md', '/d/big.bin']},
        () =>
          stat.mockImplementation(async (p: string) => ({
            size: p === '/d/big.bin' ? 20 * 1024 * 1024 + 1 : 1,
            isFile: true,
          })),
        'Arquivo maior que 20 MB: big.bin',
      ],
      [
        'an attachment that is not a file',
        {attachments: ['/d/ok.md', '/d/Pasta.app']},
        () =>
          stat.mockImplementation(async (p: string) => ({
            size: 1,
            isFile: p !== '/d/Pasta.app',
          })),
        'Não é um arquivo: Pasta.app',
      ],
      [
        'a blank description',
        {description: ' \n '},
        () => undefined,
        'Descreva a tarefa',
      ],
    ];
    it.each(rejected)(
      'Should reject %s before anything is created',
      async (_label, over, arrange, message) => {
        arrange();
        await expect(service.create(input(over))).rejects.toThrow(message);
        expect(fetch).not.toHaveBeenCalled();
        expect(defaultBranch).not.toHaveBeenCalled();
        expect(addWorktree).not.toHaveBeenCalled();
        expect(ensureIgnored).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(copyIn).not.toHaveBeenCalled();
        expect(launch).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
      },
    );

    it.each(['opus', 'sonnet', 'haiku', null])(
      'Should accept the model %s',
      async model => {
        await service.create(input({model}));
        expect(launch.mock.calls[0]?.[2].model).toBe(model);
      },
    );

    it('Should stop at a failed fetch without a worktree', async () => {
      fetch.mockRejectedValue(new Error('git fetch falhou: offline'));
      await expect(service.create(input())).rejects.toThrow(
        'git fetch falhou: offline',
      );
      expect(addWorktree).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should leave the worktree and show the error when the prompt cannot be written', async () => {
      write.mockRejectedValue(new Error('disco cheio'));
      await expect(service.create(input())).rejects.toThrow('disco cheio');
      expect(addWorktree).toHaveBeenCalled();
      expect(launch).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should leave the worktree and show the error when the session cannot start', async () => {
      launch.mockRejectedValue(new Error('tmux caiu'));
      await expect(service.create(input())).rejects.toThrow('tmux caiu');
      expect(addWorktree).toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('Should treat a /supera:ship prompt like any prompt', async () => {
      const name = await service.create(
        input({description: '/supera:ship faz x'}),
      );
      expect(name).toBe('sess-1');
      expect(addWorktree).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(
        'u1',
        'prompt.md',
        '/supera:ship faz x',
      );
      expect(launch.mock.calls[0]?.[2].task).toBe('/supera:ship faz x');
    });
  });
});
