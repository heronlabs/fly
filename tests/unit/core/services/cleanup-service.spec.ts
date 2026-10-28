import {PullRequest} from '../../../../src/core/domain/queue';
import {TaskRecord} from '../../../../src/core/domain/task';
import {Workspace, Worktree} from '../../../../src/core/domain/workspace';
import {SessionLauncher} from '../../../../src/core/interfaces/session-launcher';
import {TaskFiles} from '../../../../src/core/interfaces/task-files';
import {TaskStore} from '../../../../src/core/interfaces/task-store';
import {VcsGateway} from '../../../../src/core/interfaces/vcs-gateway';
import {CleanupService} from '../../../../src/core/services/cleanup-service';
import {QueueService} from '../../../../src/core/services/queue-service';
import {
  MappedSessions,
  SessionService,
} from '../../../../src/core/services/session-service';

const WT = 'talon/.worktrees/feat-x';
const PATH = '/r/talon/.worktrees/feat-x';
const NO_WORKTREE = 'Worktree não encontrado';
const CONFIRM = 'Confirme a limpeza de um PR fechado sem merge';

const worktree = (
  id: string,
  branch: string | null,
  over: Partial<Worktree> = {},
): Worktree => ({
  id,
  repoId: 'talon',
  path: `/r/${id}`,
  branch,
  head: 'h',
  isMain: false,
  ...over,
});
const workspace: Workspace = {
  root: '/r',
  repos: [{id: 'talon', name: 'talon', group: '', path: '/r/talon'}],
  worktrees: [
    worktree('talon', 'main', {isMain: true}),
    worktree(WT, 'feat-x'),
    worktree('talon/.worktrees/detached', null),
    worktree('ghost/.worktrees/y', 'y', {repoId: 'ghost'}),
  ],
};

const pull = (
  state: PullRequest['state'],
  headSha: string | null = 'pr-head',
): PullRequest =>
  ({number: 42, state, branch: 'feat-x', headSha}) as PullRequest;

const item = (
  worktreeId: string,
  name: string,
): MappedSessions['items'][number] => ({
  worktreeId,
  session: {
    name,
    cwd: `/r/${worktreeId}`,
    createdAt: 1,
    attachedClients: 0,
    options: {},
  },
});

const record = (over: Partial<TaskRecord> = {}): TaskRecord => ({
  id: 't1',
  repoPath: '/r/talon',
  worktreePath: PATH,
  branch: 'feat-x',
  base: 'main',
  model: null,
  promptFile: null,
  prNumber: 42,
  phase: 'ci',
  ciAttempts: 0,
  fixedSha: null,
  reviewSeenAt: null,
  review: null,
  outbox: null,
  pending: null,
  stop: null,
  createdAt: 1,
  ...over,
});

describe('CleanupService', () => {
  const currentWorkspace = vi.fn();
  const mapped = vi.fn();
  const sessions = {currentWorkspace, mapped} as unknown as SessionService;
  const kill = vi.fn();
  const launcher = {kill} as unknown as SessionLauncher;
  const listWorktrees = vi.fn();
  const removeWorktree = vi.fn();
  const branchExists = vi.fn();
  const deleteBranch = vi.fn();
  const deleteRemoteBranch = vi.fn();
  const isAncestor = vi.fn();
  const fetch = vi.fn();
  const status = vi.fn();
  const vcs = {
    isAncestor,
    fetch,
    status,
    listWorktrees,
    removeWorktree,
    branchExists,
    deleteBranch,
    deleteRemoteBranch,
  } as unknown as VcsGateway;
  const pullRequestFor = vi.fn();
  const queue = {pullRequestFor} as unknown as QueueService;
  const get = vi.fn();
  const remove = vi.fn();
  const tasks = {get, remove} as unknown as TaskStore;
  const removeFiles = vi.fn();
  const taskFiles = {remove: removeFiles} as unknown as TaskFiles;
  const calls: string[] = [];
  let service: CleanupService;

  const track = (name: string, fn: ReturnType<typeof vi.fn>) =>
    fn.mockImplementation(async () => void calls.push(name));
  const nothingRan = () => {
    for (const fn of [
      kill,
      listWorktrees,
      removeWorktree,
      branchExists,
      isAncestor,
      fetch,
      status,
      deleteBranch,
      deleteRemoteBranch,
      get,
      remove,
      removeFiles,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  };

  beforeEach(() => {
    vi.resetAllMocks();
    calls.length = 0;
    currentWorkspace.mockReturnValue(workspace);
    mapped.mockResolvedValue({
      tmux: 'ok',
      message: null,
      items: [
        item(WT, 'fly-a'),
        item('talon/.worktrees/other', 'fly-b'),
        item(WT, 'fly-c'),
      ],
    });
    pullRequestFor.mockReturnValue(pull('merged'));
    listWorktrees.mockResolvedValue([{path: PATH}, {path: '/r/talon'}]);
    branchExists.mockResolvedValue(true);
    isAncestor.mockResolvedValue(true);
    status.mockResolvedValue({});
    get.mockResolvedValue(record());
    track('kill', kill);
    track('removeWorktree', removeWorktree);
    track('deleteBranch', deleteBranch);
    track('deleteRemoteBranch', deleteRemoteBranch);
    track('removeFiles', removeFiles);
    track('removeRecord', remove);
    service = new CleanupService(
      sessions,
      launcher,
      vcs,
      queue,
      tasks,
      taskFiles,
    );
  });

  describe('a merged PR', () => {
    it('Should run every step in order', async () => {
      await service.clean(WT, {confirmed: false});

      expect(calls).toEqual([
        'kill',
        'kill',
        'removeWorktree',
        'deleteBranch',
        'deleteRemoteBranch',
        'removeFiles',
        'removeRecord',
      ]);
      expect(kill.mock.calls).toEqual([['fly-a'], ['fly-c']]);
      expect(pullRequestFor).toHaveBeenCalledWith(WT);
      expect(listWorktrees).toHaveBeenCalledWith('/r/talon');
      expect(removeWorktree).toHaveBeenCalledWith('/r/talon', PATH);
      expect(branchExists).toHaveBeenCalledWith('/r/talon', 'feat-x');
      expect(deleteBranch).toHaveBeenCalledWith('/r/talon', 'feat-x');
      expect(deleteRemoteBranch).toHaveBeenCalledWith('/r/talon', 'feat-x');
      expect(get).toHaveBeenCalledWith(PATH);
      expect(removeFiles).toHaveBeenCalledWith('t1');
      expect(remove).toHaveBeenCalledWith(PATH);
    });

    it('Should skip removeWorktree once the worktree is no longer listed', async () => {
      listWorktrees.mockResolvedValue([{path: '/r/talon'}]);

      await service.clean(WT, {confirmed: false});

      expect(removeWorktree).not.toHaveBeenCalled();
      expect(deleteBranch).toHaveBeenCalled();
    });

    it('Should skip deleteBranch when the branch is gone', async () => {
      branchExists.mockResolvedValue(false);

      await service.clean(WT, {confirmed: false});

      expect(deleteBranch).not.toHaveBeenCalled();
      expect(deleteRemoteBranch).toHaveBeenCalled();
      expect(remove).toHaveBeenCalled();
    });

    it('Should skip the record steps for a worktree without a record', async () => {
      get.mockResolvedValue(null);

      await service.clean(WT, {confirmed: false});

      expect(deleteRemoteBranch).toHaveBeenCalled();
      expect(removeFiles).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it("Should leave another branch's record at the path alone", async () => {
      get.mockResolvedValue(record({branch: 'old'}));

      await service.clean(WT, {confirmed: false});

      expect(removeFiles).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('Should kill nothing when no session is mapped', async () => {
      mapped.mockResolvedValue({tmux: 'ok', message: null, items: []});

      await service.clean(WT, {confirmed: false});

      expect(kill).not.toHaveBeenCalled();
      expect(removeWorktree).toHaveBeenCalled();
    });

    it('Should go on when tmux is not installed', async () => {
      mapped.mockResolvedValue({tmux: 'missing', message: 'x', items: []});

      await service.clean(WT, {confirmed: false});

      expect(removeWorktree).toHaveBeenCalled();
    });

    it('Should refuse when tmux cannot be listed, as a session may be alive', async () => {
      mapped.mockResolvedValue({tmux: 'error', message: 'boom', items: []});

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: boom'),
      );
      expect(removeWorktree).not.toHaveBeenCalled();
    });
  });

  describe('the local branch against the merged PR', () => {
    const wrote = () => {
      for (const fn of [
        kill,
        removeWorktree,
        deleteBranch,
        deleteRemoteBranch,
        removeFiles,
        remove,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    };

    it("Should require the branch to be an ancestor of the PR's head", async () => {
      await service.clean(WT, {confirmed: false});

      expect(isAncestor).toHaveBeenCalledExactlyOnceWith(
        '/r/talon',
        'refs/heads/feat-x',
        'pr-head',
      );
      expect(removeWorktree).toHaveBeenCalled();
    });

    it('Should refuse a diverged branch before any kill or write', async () => {
      isAncestor.mockResolvedValue(false);

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('O branch local não corresponde ao PR #42'),
      );
      wrote();
      expect(mapped).not.toHaveBeenCalled();
    });

    it('Should fetch an unknown PR head once and run when the branch then descends from it', async () => {
      isAncestor.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      await service.clean(WT, {confirmed: false});

      expect(fetch).toHaveBeenCalledExactlyOnceWith(
        '/r/talon',
        'refs/pull/42/head',
      );
      expect(isAncestor).toHaveBeenCalledTimes(2);
      expect(isAncestor).toHaveBeenLastCalledWith(
        '/r/talon',
        'refs/heads/feat-x',
        'pr-head',
      );
      expect(removeWorktree).toHaveBeenCalled();
    });

    it('Should not fetch when the branch already descends from the head', async () => {
      await service.clean(WT, {confirmed: false});

      expect(fetch).not.toHaveBeenCalled();
    });

    it('Should refuse a branch that still diverges after the fetch', async () => {
      isAncestor.mockResolvedValue(false);

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('O branch local não corresponde ao PR #42'),
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(isAncestor).toHaveBeenCalledTimes(2);
      wrote();
      expect(mapped).not.toHaveBeenCalled();
    });

    it('Should refuse as a mismatch when the fetch fails, without a second check', async () => {
      isAncestor.mockResolvedValue(false);
      fetch.mockRejectedValue(new Error('no network'));

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('O branch local não corresponde ao PR #42'),
      );
      expect(isAncestor).toHaveBeenCalledTimes(1);
      wrote();
      expect(mapped).not.toHaveBeenCalled();
    });

    it('Should refuse a PR without a head sha', async () => {
      pullRequestFor.mockReturnValue(pull('merged', null));

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('O branch local não corresponde ao PR #42'),
      );
      expect(isAncestor).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      wrote();
    });

    it('Should skip the check once the branch is deleted', async () => {
      branchExists.mockResolvedValue(false);
      isAncestor.mockResolvedValue(false);

      await service.clean(WT, {confirmed: false});

      expect(isAncestor).not.toHaveBeenCalled();
      expect(deleteBranch).not.toHaveBeenCalled();
      expect(deleteRemoteBranch).toHaveBeenCalled();
    });

    it.each([
      ['branchExists', branchExists],
      ['isAncestor', isAncestor],
    ])('Should prefix a failing %s', async (_name, step) => {
      step.mockRejectedValue(new Error('boom'));

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: boom'),
      );
      wrote();
    });
  });

  describe('uncommitted changes', () => {
    it('Should refuse a dirty listed worktree before any kill or write', async () => {
      status.mockResolvedValue({'a.ts': 'M', 'b.ts': '?'});

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: Ficaram mudanças sem commit: a.ts, b.ts'),
      );
      expect(status).toHaveBeenCalledWith(PATH);
      expect(kill).not.toHaveBeenCalled();
      expect(removeWorktree).not.toHaveBeenCalled();
      expect(deleteBranch).not.toHaveBeenCalled();
    });

    it('Should not read the status of a worktree that is no longer listed', async () => {
      listWorktrees.mockResolvedValue([{path: '/r/talon'}]);

      await service.clean(WT, {confirmed: false});

      expect(status).not.toHaveBeenCalled();
    });
  });

  describe('a closed PR', () => {
    beforeEach(() => pullRequestFor.mockReturnValue(pull('closed')));

    it('Should refuse without confirmation and call nothing', async () => {
      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error(CONFIRM),
      );
      expect(mapped).not.toHaveBeenCalled();
      nothingRan();
    });

    it('Should run with confirmation, without comparing the branch', async () => {
      isAncestor.mockResolvedValue(false);

      await service.clean(WT, {confirmed: true});

      expect(isAncestor).not.toHaveBeenCalled();
      expect(calls).toContain('removeWorktree');
      expect(calls.at(-1)).toBe('removeRecord');
    });
  });

  describe('refused', () => {
    it.each([
      ['an open PR', () => pullRequestFor.mockReturnValue(pull('open'))],
      ['no PR', () => pullRequestFor.mockReturnValue(null)],
      ['no workspace', () => currentWorkspace.mockReturnValue(null)],
    ])('Should refuse %s with no calls', async (_name, arrange) => {
      arrange();

      await expect(service.clean(WT, {confirmed: true})).rejects.toThrow(
        new Error(NO_WORKTREE),
      );
      nothingRan();
    });

    it.each([
      ['the main worktree', 'talon'],
      ['a detached worktree', 'talon/.worktrees/detached'],
      ['an unknown repo', 'ghost/.worktrees/y'],
      ['an unknown worktree', 'nope'],
    ])('Should refuse %s', async (_name, id) => {
      await expect(service.clean(id, {confirmed: true})).rejects.toThrow(
        new Error(NO_WORKTREE),
      );
      nothingRan();
    });
  });

  describe('a failing step', () => {
    it("Should reject with git's message and run nothing after it", async () => {
      removeWorktree.mockRejectedValue(
        new Error('contains modified or untracked files'),
      );

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: contains modified or untracked files'),
      );
      expect(deleteBranch).not.toHaveBeenCalled();
      expect(deleteRemoteBranch).not.toHaveBeenCalled();
      expect(removeFiles).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });

    it('Should not double the prefix of a message that has it', async () => {
      deleteBranch.mockRejectedValue(new Error('Falha ao limpar: x'));

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: x'),
      );
    });

    it('Should stringify a non-Error rejection', async () => {
      deleteRemoteBranch.mockRejectedValue('offline');

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: offline'),
      );
      expect(removeFiles).not.toHaveBeenCalled();
    });

    it.each([
      ['kill', kill],
      ['listWorktrees', listWorktrees],
      ['branchExists', branchExists],
      ['get', get],
      ['removeFiles', removeFiles],
    ])('Should reject when %s fails', async (_name, step) => {
      step.mockRejectedValue(new Error('boom'));

      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow(
        new Error('Falha ao limpar: boom'),
      );
      expect(remove).not.toHaveBeenCalled();
    });

    it('Should skip the steps already done when cleaning again', async () => {
      removeWorktree.mockRejectedValueOnce(new Error('dirty'));
      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow();
      deleteBranch.mockRejectedValueOnce(new Error('offline'));
      listWorktrees.mockResolvedValue([{path: '/r/talon'}]);
      await expect(service.clean(WT, {confirmed: false})).rejects.toThrow();
      branchExists.mockResolvedValue(false);

      await service.clean(WT, {confirmed: false});

      expect(removeWorktree).toHaveBeenCalledTimes(1);
      expect(deleteBranch).toHaveBeenCalledTimes(1);
      expect(deleteRemoteBranch).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});
