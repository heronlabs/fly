import {Injectable} from '@nestjs/common';

import {PullRequest} from '../domain/queue';
import {Repo, Worktree} from '../domain/workspace';
import {SessionLauncher} from '../interfaces/session-launcher';
import {TaskFiles} from '../interfaces/task-files';
import {TaskStore} from '../interfaces/task-store';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {assertClean} from './lifecycle-steps';
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
    const {repo, worktree, branch, pr} = this.locate(worktreeId, options);
    let matches: boolean;
    try {
      matches = await this.matchesPr(repo, branch, pr);
    } catch (error) {
      throw failure(error);
    }
    if (!matches) {
      throw new Error(`O branch local não corresponde ao PR #${pr.number}`);
    }
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
  ): {repo: Repo; worktree: Worktree; branch: string; pr: PullRequest} {
    const workspace = this.sessions.currentWorkspace();
    const worktree = workspace?.worktrees.find(w => w.id === worktreeId);
    const repo = workspace?.repos.find(r => r.id === worktree?.repoId);
    if (!worktree?.branch || worktree.isMain || !repo) {
      throw new Error(NO_WORKTREE);
    }
    const pr = this.queue.pullRequestFor(worktreeId);
    if (pr?.state === 'closed' && !confirmed) throw new Error(CONFIRM);
    if (pr?.state !== 'merged' && pr?.state !== 'closed') {
      throw new Error(NO_WORKTREE);
    }
    return {repo, worktree, branch: worktree.branch, pr};
  }

  // The PR is found by branch name, so a reused name or commits made after
  // the merge must not lose work: a merged PR's local branch holds nothing
  // beyond the PR's head. A deleted branch (a retry) has nothing to lose, and
  // a closed PR was confirmed by the user.
  private async matchesPr(
    repo: Repo,
    branch: string,
    pr: PullRequest,
  ): Promise<boolean> {
    if (pr.state !== 'merged') return true;
    if (!(await this.vcs.branchExists(repo.path, branch))) return true;
    return (
      pr.headSha !== null &&
      (await this.vcs.isAncestor(repo.path, `refs/heads/${branch}`, pr.headSha))
    );
  }

  private async removeAll(
    repo: Repo,
    worktree: Worktree,
    branch: string,
  ): Promise<void> {
    const {tmux, message, items} = await this.sessions.mapped();
    // Without a tmux listing, a live session would be left running.
    if (tmux === 'error') throw new Error(String(message));
    const listed = (await this.vcs.listWorktrees(repo.path)).some(
      w => w.path === worktree.path,
    );
    // Before any session dies; git's own refusal stays the fallback.
    if (listed) await assertClean(this.vcs, worktree.path);
    for (const {session, worktreeId} of items) {
      if (worktreeId === worktree.id) await this.launcher.kill(session.name);
    }
    if (listed) await this.vcs.removeWorktree(repo.path, worktree.path);
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
