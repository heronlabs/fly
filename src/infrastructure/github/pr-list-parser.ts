import type {ChecksState, PullRequest} from '../../core/domain/queue';

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

const PASSING_CONCLUSIONS = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);

const CONTEXT_STATES: Record<string, Check> = {
  SUCCESS: 'passing',
  PENDING: 'pending',
  EXPECTED: 'pending',
  FAILURE: 'failing',
  ERROR: 'failing',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const classifyCheck = (entry: unknown): Check | null => {
  if (!isRecord(entry)) {
    return null;
  }
  if (entry.__typename === 'CheckRun') {
    if (entry.status !== 'COMPLETED') {
      return 'pending';
    }
    return typeof entry.conclusion === 'string' &&
      PASSING_CONCLUSIONS.has(entry.conclusion)
      ? 'passing'
      : 'failing';
  }
  if (entry.__typename === 'StatusContext') {
    return typeof entry.state === 'string'
      ? (CONTEXT_STATES[entry.state] ?? null)
      : null;
  }
  return null;
};

const aggregateChecks = (rollup: unknown): ChecksState => {
  const states = (Array.isArray(rollup) ? rollup : []).map(classifyCheck);
  if (states.includes('failing')) {
    return 'failing';
  }
  if (states.includes('pending')) {
    return 'pending';
  }
  return states.includes('passing') ? 'passing' : 'none';
};

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
  const decision =
    typeof entry.reviewDecision === 'string' ? entry.reviewDecision : '';
  return {
    number: entry.number,
    url: entry.url,
    branch: entry.headRefName,
    state,
    draft: entry.isDraft === true,
    mergeable: mapMergeable(entry.mergeable),
    review: REVIEWS[decision] ?? 'none',
    checks: aggregateChecks(entry.statusCheckRollup),
  };
};

export const parsePrList = (json: string): PullRequest[] => {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(INVALID);
  }
  if (!Array.isArray(data)) {
    throw new Error(INVALID);
  }
  return data.flatMap(entry => mapPullRequest(entry) ?? []);
};
