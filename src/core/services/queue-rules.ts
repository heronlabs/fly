import type {PullRequest, QueueStatus} from '../domain/queue';
import type {Activity, TranscriptSummary} from '../domain/transcript';

export const WAKEUP_GRACE_MS = 20 * 60_000;
export const LOOP_FALLBACK_MS = 1_500_000;
export const SHELL_WINDOW_MS = 60 * 60_000;
export const STALL_MS = 10 * 60_000;

// Highest priority first.
export const PRECEDENCE: readonly QueueStatus[] = [
  'failed',
  'ready',
  'waiting',
  'engineer',
  'ci',
  'unknown',
  'idle',
  'merged',
];

export const classifyActivity = (
  summary: TranscriptSummary | null,
  now: number,
): Activity => {
  if (summary === null || summary.phase === 'none') return 'unknown';
  if (summary.asking) return 'waiting';
  if (summary.phase === 'mid-turn') {
    const stalled =
      summary.openTools === 0 &&
      summary.lastEventAt !== null &&
      now - summary.lastEventAt > STALL_MS;
    return stalled ? 'unknown' : 'running';
  }
  if (summary.wakeupAt !== null) {
    return now <= summary.wakeupAt + WAKEUP_GRACE_MS ? 'scheduled' : 'unknown';
  }
  if (
    summary.looping &&
    summary.lastTurnEndAt !== null &&
    now <= summary.lastTurnEndAt + LOOP_FALLBACK_MS
  ) {
    return 'scheduled';
  }
  if (summary.backgroundAgents > 0) return 'running';
  if (summary.backgroundShells.some(at => now - at <= SHELL_WINDOW_MS)) {
    return 'scheduled';
  }
  return 'waiting';
};

export const pullRequestStatus = (
  pr: PullRequest | null,
): QueueStatus | null => {
  if (pr === null || pr.state === 'closed') return null;
  if (pr.state === 'merged') return 'merged';
  if (pr.checks === 'failing' || pr.mergeable === 'conflicting') {
    return 'failed';
  }
  if (pr.checks === 'pending' || pr.mergeable === 'unknown') return 'ci';
  if (
    pr.draft ||
    pr.review === 'required' ||
    pr.review === 'changes-requested'
  ) {
    return 'waiting';
  }
  return 'ready';
};

export const worktreeStatus = (input: {
  activities: Activity[];
  pullRequest: PullRequest | null;
  hasPlan: boolean;
}): QueueStatus => {
  const prOpen = input.pullRequest?.state === 'open';
  // null (no PR status) is in the set but never in PRECEDENCE.
  const candidates = new Set<QueueStatus | null>([
    pullRequestStatus(input.pullRequest),
  ]);
  for (const activity of input.activities) {
    if (activity === 'waiting') candidates.add('waiting');
    else if (activity === 'running') candidates.add('engineer');
    else if (activity === 'scheduled') {
      // Beside an open PR, the PR's own status already stands for it: every status
      // pullRequestStatus returns for an open PR (failed, ready, waiting, ci) ranks
      // at or above ci in PRECEDENCE, so a ci candidate would never change the result.
      if (!prOpen) candidates.add('engineer');
    } else candidates.add(input.hasPlan ? 'engineer' : 'unknown');
  }
  return PRECEDENCE.find(status => candidates.has(status)) ?? 'idle';
};
