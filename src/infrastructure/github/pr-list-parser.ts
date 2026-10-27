import type {CheckRun, ChecksState, PullRequest} from '../../core/domain/queue';

const INVALID = 'Resposta inválida do gh';

type Check = 'passing' | 'pending' | 'failing';

const STATES: Record<string, PullRequest['state']> = {
  OPEN: 'open',
  MERGED: 'merged',
  CLOSED: 'closed',
};

const REVIEWS: Record<string, PullRequest['review']> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes-requested',
  REVIEW_REQUIRED: 'required',
};

const PASSING_CONCLUSIONS = new Set<unknown>(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

const CONTEXT_STATES: Record<string, Check> = {
  SUCCESS: 'passing',
  PENDING: 'pending',
  EXPECTED: 'pending',
  FAILURE: 'failing',
  ERROR: 'failing',
};

// Object(value) === value is true only for objects: null and primitives fail.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Object(value) === value && !Array.isArray(value);

const classifyCheck = (entry: unknown): Check | null => {
  if (!isRecord(entry)) {
    return null;
  }
  if (entry.__typename === 'CheckRun') {
    if (entry.status !== 'COMPLETED') {
      return 'pending';
    }
    return PASSING_CONCLUSIONS.has(entry.conclusion) ? 'passing' : 'failing';
  }
  if (entry.__typename === 'StatusContext') {
    return typeof entry.state === 'string'
      ? (CONTEXT_STATES[entry.state] ?? null)
      : null;
  }
  return null;
};

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const JOB_URL = /\/actions\/runs\/(\d+)\/job\/(\d+)$/;

const mapCheckRun = (entry: unknown): CheckRun | null => {
  const state = classifyCheck(entry);
  if (!state || !isRecord(entry)) {
    return null;
  }
  const isRun = entry.__typename === 'CheckRun';
  const name = stringOrNull(isRun ? entry.name : entry.context);
  if (name === null) {
    return null;
  }
  const url = stringOrNull(isRun ? entry.detailsUrl : entry.targetUrl);
  const ids = isRun ? JOB_URL.exec(String(url)) : null;
  return {
    name,
    state,
    url,
    kind: isRun ? 'run' : 'status',
    conclusion: isRun ? stringOrNull(entry.conclusion) : null,
    runId: ids?.[1] ?? null,
    jobId: ids?.[2] ?? null,
  };
};

const mapCheckRuns = (rollup: unknown): CheckRun[] =>
  Array.isArray(rollup) ? rollup.flatMap(e => mapCheckRun(e) ?? []) : [];

const aggregateChecks = (rollup: unknown): ChecksState => {
  if (!Array.isArray(rollup)) {
    return 'none';
  }
  const states = rollup.map(classifyCheck);
  if (states.includes('failing')) {
    return 'failing';
  }
  if (states.includes('pending')) {
    return 'pending';
  }
  return states.includes('passing') ? 'passing' : 'none';
};

const mapReview = (value: unknown): PullRequest['review'] =>
  typeof value === 'string' ? (REVIEWS[value] ?? 'none') : 'none';

const mapMergeable = (value: unknown): PullRequest['mergeable'] => {
  if (value === 'MERGEABLE') {
    return 'mergeable';
  }
  return value === 'CONFLICTING' ? 'conflicting' : 'unknown';
};

const mapPullRequest = (entry: unknown): PullRequest | null => {
  if (
    !isRecord(entry) ||
    typeof entry.number !== 'number' ||
    typeof entry.url !== 'string' ||
    typeof entry.headRefName !== 'string' ||
    typeof entry.state !== 'string'
  ) {
    return null;
  }
  const state = STATES[entry.state];
  if (!state) {
    return null;
  }
  return {
    number: entry.number,
    url: entry.url,
    branch: entry.headRefName,
    state,
    draft: entry.isDraft === true,
    mergeable: mapMergeable(entry.mergeable),
    review: mapReview(entry.reviewDecision),
    checks: aggregateChecks(entry.statusCheckRollup),
    title: stringOrNull(entry.title) ?? '',
    checkRuns: mapCheckRuns(entry.statusCheckRollup),
    headSha: stringOrNull(entry.headRefOid),
    behind: entry.mergeStateStatus === 'BEHIND',
  };
};

const parseArray = (json: string): unknown[] => {
  try {
    const data: unknown = JSON.parse(json);
    if (Array.isArray(data)) {
      return data;
    }
  } catch {
    // Invalid JSON is reported below, exactly like a non-array.
  }
  throw new Error(INVALID);
};

export const parsePrList = (json: string): PullRequest[] =>
  parseArray(json).flatMap(entry => mapPullRequest(entry) ?? []);
