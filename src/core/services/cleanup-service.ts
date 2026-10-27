import {Injectable} from '@nestjs/common';

import {Repo, Worktree} from '../domain/workspace';
import {SessionLauncher} from '../interfaces/session-launcher';
import {TaskFiles} from '../interfaces/task-files';
import {TaskStore} from '../interfaces/task-store';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {QueueService} from './queue-service';
import {errorMessage, SessionService} from './session-service';

const NO_WORKTREE = 'Worktree não encontrado';
const CONFIRM = 'Confirme a limpeza de um PR fechado sem merge';
const FAILED = 'Falha ao limpar: ';

// P12: a gateway error already carrying the prefix keeps it once.
const failure = (error: unknown): Error => {
  const message = errorMessage(error);
  return new Error(message.startsWith(FAILED) ? message : FAILED + message);
};

@Injectable()
export class CleanupService {
  constructor(
    private readonly sessions: SessionService,
    private readonly launcher: SessionLauncher,
    private readonly vcs: VcsGateway,
    private readonly queue: QueueService,
    private readonly tasks: TaskStore,
    private readonly taskFiles: TaskFiles,
  ) {}

  // P12: removes a finished task's sessions, worktree, branches and record.
  // Every step is skipped once done, so a failed clean can be run again.
  async clean(
    worktreeId: string,
    options: {confirmed: boolean},
  ): Promise<void> {
    const {repo, worktree, branch} = this.locate(worktreeId, options);
    try {
      await this.removeAll(repo, worktree, branch);
    } catch (error) {
      throw failure(error);
    }
  }

  // Only a branch worktree outside the main checkout whose PR is merged, or
  // closed and confirmed, is cleaned; nothing is touched before this passes.
  private locate(
    worktreeId: string,
    {confirmed}: {confirmed: boolean},
  ): {repo: Repo; worktree: Worktree; branch: string} {
    const workspace = this.sessions.currentWorkspace();
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    const repo = workspace?.repos.find(r => r.id === worktree?.repoId);
    if (!worktree?.branch || worktree.isMain || !repo) {
      throw new Error(NO_WORKTREE);
    }
    const state = this.queue.pullRequestFor(worktreeId)?.state;
    if (state === 'closed' && !confirmed) throw new Error(CONFIRM);
    if (state !== 'merged' && state !== 'closed') throw new Error(NO_WORKTREE);
    return {repo, worktree, branch: worktree.branch};
  }

  private async removeAll(
    repo: Repo,
    worktree: Worktree,
    branch: string,
  ): Promise<void> {
    const {tmux, message, items} = await this.sessions.mapped();
    // Without a tmux listing, a live session would be left running.
    if (tmux === 'error') throw new Error(String(message));
    for (const {session, worktreeId} of items) {
      if (worktreeId === worktree.id) await this.launcher.kill(session.name);
    }
    const listed = await this.vcs.listWorktrees(repo.path);
    if (listed.some(w => w.path === worktree.path)) {
      await this.vcs.removeWorktree(repo.path, worktree.path);
    }
    if (await this.vcs.branchExists(repo.path, branch)) {
      await this.vcs.deleteBranch(repo.path, branch);
    }
    await this.vcs.deleteRemoteBranch(repo.path, branch);
    // A record of another branch at this path is not this task's.
    const record = await this.tasks.get(worktree.path);
    if (record?.branch === branch) {
      await this.taskFiles.remove(record.id);
      await this.tasks.remove(worktree.path);
    }
  }
}
