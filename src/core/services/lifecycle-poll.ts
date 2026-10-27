import {PullRequest, ReviewComment} from '../domain/queue';
import {MAX_CI_ATTEMPTS, TaskRecord, TaskStop} from '../domain/task';
import {PrGateway} from '../interfaces/pr-gateway';
import {TaskFiles} from '../interfaces/task-files';
import {stopped} from './lifecycle-steps';
import {
  fixInstruction,
  logExcerpt,
  reviewFile,
  reviewInstruction,
} from './task-rules';

// What the poll steps call, handed over by LifecycleService.
export type PollGateways = {prs: PrGateway; taskFiles: TaskFiles};

type HeadedPullRequest = PullRequest & {headSha: string};

// Ruling: an open PR that is not the record's becomes it, with no action
// pending: one the session opened by itself, one fly created but failed to
// record, or a newer PR on the branch. Only a stopped record carries a stop.
const adoptable = (record: TaskRecord, pr: PullRequest): boolean => {
  if (pr.number === record.prNumber || record.pending !== null) return false;
  const kind = record.stop?.kind;
  return (
    record.prNumber !== null ||
    record.phase === 'working' ||
    kind === 'open' ||
    kind === 'session'
  );
};

// An adopted PR starts its CI loop and its review forwarding from scratch.
const adopt = (
  record: TaskRecord,
  pr: PullRequest,
  now: number,
): TaskRecord => ({
  ...record,
  prNumber: pr.number,
  phase: 'ci',
  reviewSeenAt: now,
  ciAttempts: 0,
  fixedSha: null,
  review: null,
  outbox: null,
  stop: null,
  pending: null,
});

const blocker = (pr: PullRequest, base: string): TaskStop | null => {
  if (pr.mergeable === 'conflicting') {
    return {kind: 'conflict', message: `Conflito com ${base}`};
  }
  return pr.behind
    ? {kind: 'behind', message: `Branch atrás de ${base}`}
    : null;
};

// P10 steps 3 and 4: green checks clear a CI stop; a conflict or a branch
// behind its base stops, and clears by itself, unless another stop holds.
const stopAfter = (
  {stop, base}: TaskRecord,
  pr: PullRequest,
): TaskStop | null => {
  switch (stop?.kind) {
    case 'ci':
    case 'infra':
      return pr.checks === 'passing' ? blocker(pr, base) : stop;
    case undefined:
    case 'conflict':
    case 'behind':
      return blocker(pr, base);
    default:
      // open, session, review: only the user clears them.
      return stop;
  }
};

// P10 step 5: a fix from the failed jobs' logs, or the stop that replaces it.
// Null when gh could not give a log; the next poll tries again.
const fixOrStop = async (
  {prs, taskFiles}: PollGateways,
  record: TaskRecord,
  pr: HeadedPullRequest,
): Promise<TaskRecord | null> => {
  const failing = pr.checkRuns.filter(c => c.state === 'failing');
  const jobIds = failing.flatMap(c =>
    c.kind === 'run' && c.conclusion === 'FAILURE' && c.jobId !== null
      ? [c.jobId]
      : [],
  );
  let logs: {jobId: string; raw: string | null}[];
  try {
    logs = await Promise.all(
      jobIds.map(async jobId => ({
        jobId,
        raw: await prs.failedLog(record.repoPath, jobId),
      })),
    );
  } catch {
    return null;
  }
  const found = logs.flatMap(({jobId, raw}) =>
    raw === null ? [] : [{jobId, raw}],
  );
  if (found.length === 0) {
    return stopped(record, {
      kind: 'infra',
      message: `Falha de infraestrutura na CI: ${failing.map(c => c.name).join(', ')}`,
      runIds: [...new Set(failing.flatMap(c => c.runId ?? []))],
    });
  }
  if (record.ciAttempts >= MAX_CI_ATTEMPTS) {
    return stopped(record, {
      kind: 'ci',
      message: `CI falhou ${MAX_CI_ATTEMPTS} vezes; parei de corrigir`,
    });
  }
  const sha7 = pr.headSha.slice(0, 7);
  const files = await Promise.all(
    found.map(({jobId, raw}) =>
      taskFiles.write(record.id, `ci-${jobId}-${sha7}.log`, logExcerpt(raw)),
    ),
  );
  const text = fixInstruction(pr.number, record.ciAttempts + 1, files);
  return {...record, outbox: {kind: 'fix', text, headSha: pr.headSha}};
};

// P10 step 6: the comments left since the newest one forwarded. One that
// cannot be read is tried again on the next poll.
const forwardReview = async (
  {prs, taskFiles}: PollGateways,
  record: TaskRecord,
  pr: PullRequest,
  now: number,
): Promise<TaskRecord> => {
  const seenAt = record.reviewSeenAt;
  if (seenAt === null) return {...record, reviewSeenAt: now};
  let comments: ReviewComment[];
  try {
    comments = await prs.reviewComments(record.repoPath, pr.number);
  } catch {
    return record;
  }
  const fresh = comments.filter(
    c => c.createdAt > seenAt && c.body.trim() !== '',
  );
  if (fresh.length === 0) return record;
  const newest = Math.max(...fresh.map(c => c.createdAt));
  const file = await taskFiles.write(
    record.id,
    `review-${pr.number}-${newest}.md`,
    reviewFile(fresh),
  );
  return {
    ...record,
    outbox: {
      kind: 'review',
      text: reviewInstruction(pr.number, file),
      headSha: pr.headSha,
    },
    reviewSeenAt: newest,
    review: {count: fresh.length, state: 'queued'},
  };
};

// P10 steps 3 to 6 on a record free to act on its open PR. A fix and a
// review never travel together: the comments wait for the next poll.
const watch = async (
  gateways: PollGateways,
  record: TaskRecord,
  pr: PullRequest,
  now: number,
): Promise<TaskRecord | null> => {
  // GitHub recomputes mergeability after the base moves: until it knows, a
  // conflict or behind stop holds and nothing new is set.
  if (pr.mergeable === 'unknown') return record;
  const stop = stopAfter(record, pr);
  let next = stop
    ? stopped(record, stop)
    : {...record, phase: 'ci' as const, stop};
  if (pr.checks === 'passing') next = {...next, ciAttempts: 0, fixedSha: null};
  if (stop) return next;
  const {headSha} = pr;
  if (
    pr.checks === 'failing' &&
    headSha !== null &&
    headSha !== next.fixedSha
  ) {
    // Step 5 waits for every check of the head, so one fix carries all of
    // its failed jobs.
    if (pr.checkRuns.some(c => c.state === 'pending')) return next;
    return fixOrStop(gateways, next, {...pr, headSha});
  }
  return forwardReview(gateways, next, pr, now);
};

// P10 for one record and the PR the queue shows for its worktree: the record
// as this poll leaves it, or null when it must be left for the next poll.
export const pollRecord = async (
  gateways: PollGateways,
  record: TaskRecord,
  pr: PullRequest | null,
  now: number,
): Promise<TaskRecord | null> => {
  if (pr?.state === 'open' && adoptable(record, pr)) {
    return watch(gateways, adopt(record, pr, now), pr, now);
  }
  if (record.prNumber === null) return record;
  // Ruling: a PR closed unmerged brings "Abrir PR" back; a merged one waits
  // for the cleanup.
  if (pr?.state === 'closed' && record.pending === null) {
    return {
      ...record,
      phase: 'working',
      prNumber: null,
      stop: null,
      outbox: null,
      ciAttempts: 0,
      fixedSha: null,
      review: null,
    };
  }
  if (pr?.state !== 'open' || record.pending || record.outbox) return record;
  return watch(gateways, record, pr, now);
};
