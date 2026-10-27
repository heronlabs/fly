import {TaskRecord} from '../domain/task';
import {PrGateway} from '../interfaces/pr-gateway';
import {TaskFiles} from '../interfaces/task-files';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {QueueService} from './queue-service';
import {errorMessage} from './session-service';
import {isConventionalTitle, parsePrText} from './task-rules';

export const PR_FILE = 'pr.json';
const BODY_FILE = 'pr-body.md';

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
