import {TaskAction, TaskRecord, TaskStop} from '../domain/task';
import {PrGateway} from '../interfaces/pr-gateway';
import {TaskFiles} from '../interfaces/task-files';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {QueueService} from './queue-service';
import {errorMessage} from './session-service';
import {isConventionalTitle, parsePrText} from './task-rules';

export const PR_FILE = 'pr.json';
const BODY_FILE = 'pr-body.md';

export const SESSION_GONE: TaskStop = {
  kind: 'session',
  message: 'A sessão do worktree foi encerrada',
};

export const stopped = (record: TaskRecord, stop: TaskStop): TaskRecord => ({
  ...record,
  phase: 'stopped',
  stop,
  pending: null,
});

const reviewAs = (
  record: TaskRecord,
  state: 'sent' | 'done',
): TaskRecord['review'] => record.review && {...record.review, state};

// What the open steps call, handed over by LifecycleService.
export type OpenGateways = {
  vcs: VcsGateway;
  prs: PrGateway;
  queue: QueueService;
  taskFiles: TaskFiles;
};

// A gateway error already carrying the stop's prefix keeps it once.
const prefixed = (prefix: string, error: unknown): string => {
  const message = errorMessage(error);
  return message.startsWith(prefix) ? message : prefix + message;
};

// The session's turn left nothing uncommitted; otherwise throws the stop's
// message with the files left.
export const assertClean = async (
  vcs: VcsGateway,
  path: string,
): Promise<void> => {
  const dirty = Object.keys(await vcs.status(path));
  if (dirty.length > 0) {
    throw new Error(`Ficaram mudanças sem commit: ${dirty.join(', ')}`);
  }
};

export const pushBranch = async (
  vcs: VcsGateway,
  path: string,
  branch: string,
): Promise<void> => {
  try {
    await vcs.push(path, branch);
  } catch (error) {
    throw new Error(prefixed('git push falhou: ', error));
  }
};

// P8 on turn done: the first failed check throws the stop's message.
export const createPullRequest = async (
  {vcs, prs, queue, taskFiles}: OpenGateways,
  record: TaskRecord,
  path: string,
): Promise<number> => {
  await assertClean(vcs, path);
  if ((await vcs.aheadCount(path, `origin/${record.base}`)) === 0) {
    throw new Error(
      `Nada para abrir: o branch não tem commits à frente de ${record.base}`,
    );
  }
  const text = parsePrText(await taskFiles.read(record.id, PR_FILE));
  if (!text) {
    throw new Error('A sessão não escreveu o título e o corpo do PR');
  }
  if (!isConventionalTitle(text.title)) {
    throw new Error(
      `Título fora do padrão Conventional Commits: ${text.title}`,
    );
  }
  await pushBranch(vcs, path, record.branch);
  const bodyFile = await taskFiles.write(record.id, BODY_FILE, text.body);
  try {
    const {number} = await prs.create({
      cwd: path,
      title: text.title,
      bodyFile,
      base: record.base,
      head: record.branch,
    });
    // The list shows the PR at once, so the button does not come back.
    await queue.refreshPullRequests().catch(() => undefined);
    return number;
  } catch (error) {
    throw new Error(prefixed('gh pr create falhou: ', error));
  }
};

// P10 once an outbox is typed: the turn that follows settles it, and a fix
// counts as an attempt for the PR head that failed.
export const sentRecord = (
  record: TaskRecord,
  outbox: TaskAction,
  headSha: string,
  now: number,
): TaskRecord => {
  const pending = {kind: outbox.kind, sentAt: now, headSha};
  return outbox.kind === 'fix'
    ? {
        ...record,
        outbox: null,
        pending,
        phase: 'fixing',
        ciAttempts: record.ciAttempts + 1,
        fixedSha: outbox.headSha,
      }
    : {
        ...record,
        outbox: null,
        pending,
        phase: 'reviewing',
        review: reviewAs(record, 'sent'),
      };
};

// P10 on the turn done of a fix or a review: its commits are pushed and the
// CI is watched again. A fix with no commit, a dirty tree or a failed push
// stops; a review with no commit is done, the model may have judged that the
// comments need no change. A review's stop is not a CI one, so green checks
// never clear it.
export const settleTurn = async (
  vcs: VcsGateway,
  record: TaskRecord,
  pending: TaskAction,
  path: string,
): Promise<TaskRecord> => {
  const fix = pending.kind === 'fix';
  try {
    await assertClean(vcs, path);
    if ((await vcs.headSha(path)) !== pending.headSha) {
      await pushBranch(vcs, path, record.branch);
    } else if (fix) {
      return stopped(record, {
        kind: 'ci',
        message: 'A sessão não commitou uma correção',
      });
    }
    return {
      ...record,
      phase: 'ci',
      pending: null,
      review: fix ? record.review : reviewAs(record, 'done'),
    };
  } catch (error) {
    return stopped(record, {
      kind: fix ? 'ci' : 'session',
      message: errorMessage(error),
    });
  }
};
