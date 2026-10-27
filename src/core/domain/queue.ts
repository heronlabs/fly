import type {TaskPhase, TaskRecord, TaskStop} from './task';
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

export type CheckRun = {
  name: string;
  state: 'passing' | 'pending' | 'failing';
  url: string | null;
  kind: 'run' | 'status';
  conclusion: string | null;
  runId: string | null;
  jobId: string | null;
};

export type PullRequest = {
  number: number;
  url: string;
  branch: string;
  state: 'open' | 'merged' | 'closed';
  draft: boolean;
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  review: 'approved' | 'changes-requested' | 'required' | 'none';
  checks: ChecksState;
  title: string;
  checkRuns: CheckRun[];
  headSha: string | null;
  behind: boolean;
};

export type ReviewComment = {
  id: string;
  author: string;
  body: string;
  path: string | null;
  line: number | null;
  url: string;
  createdAt: number;
};

// What the PR tab shows of a worktree's task record.
export type TaskView = {
  phase: TaskPhase;
  ciAttempts: number;
  stop: TaskStop | null;
  review: TaskRecord['review'];
};

export type WorktreeQueue = {
  worktreeId: string;
  status: QueueStatus;
  pullRequest: PullRequest | null;
  receipt: ReceiptResult | null;
  task: TaskView | null;
  canOpenPr: boolean;
};

export type QueueSnapshot = {
  github: 'ok' | 'missing' | 'error';
  message: string | null;
  worktrees: WorktreeQueue[];
};
