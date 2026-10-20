import type {ReceiptResult} from './transcript';

export type QueueStatus =
  | 'idle'
  | 'engineer'
  | 'waiting'
  | 'ci'
  | 'failed'
  | 'ready'
  | 'merged'
  | 'unknown';

export type ChecksState = 'none' | 'pending' | 'passing' | 'failing';

export type PullRequest = {
  number: number;
  url: string;
  branch: string;
  state: 'open' | 'merged' | 'closed';
  draft: boolean;
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  review: 'approved' | 'changes-requested' | 'required' | 'none';
  checks: ChecksState;
};

export type WorktreeQueue = {
  worktreeId: string;
  status: QueueStatus;
  pullRequest: PullRequest | null;
  receipt: ReceiptResult | null;
};

export type QueueSnapshot = {
  github: 'ok' | 'missing' | 'error';
  message: string | null;
  worktrees: WorktreeQueue[];
};
