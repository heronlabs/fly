export const TASKS_FILE = 'tasks.json';
export const TASKS_DIR = 'tasks';
export const PROMPT_FILE_ENV = 'FLY_PROMPT_FILE';

export const MAX_PROMPT_CHARS = 100_000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const BRANCH_SUGGESTION_MAX = 40;
export const MAX_CI_ATTEMPTS = 3;
export const MAX_TITLE_CHARS = 72;

export const MODELS = ['opus', 'sonnet', 'haiku'] as const;

export const EXCERPT_CONTEXT_LINES = 60;
export const EXCERPT_TAIL_LINES = 200;
export const EXCERPT_MAX_CHARS = 20_000;

export const CONVENTIONAL_TITLE =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^()\s]+\))?!?: \S/;

export type TaskPhase =
  'working' | 'opening' | 'ci' | 'fixing' | 'reviewing' | 'stopped';

export type TaskStop = {
  kind: 'open' | 'ci' | 'infra' | 'conflict' | 'behind' | 'session';
  message: string;
  runIds?: string[];
};

export type TaskAction = {
  kind: 'open' | 'fix' | 'review';
  text?: string;
  sentAt?: number;
  headSha: string | null;
};

export type TaskRecord = {
  id: string;
  repoPath: string;
  worktreePath: string;
  branch: string;
  base: string;
  model: string | null;
  promptFile: string | null;
  prNumber: number | null;
  phase: TaskPhase;
  ciAttempts: number;
  fixedSha: string | null;
  reviewSeenAt: number | null;
  review: {count: number; state: 'queued' | 'sent' | 'done'} | null;
  outbox: TaskAction | null;
  pending: TaskAction | null;
  stop: TaskStop | null;
  createdAt: number;
};

export type NewTaskInput = {
  repoId: string;
  description: string;
  branch: string;
  model: string | null;
  attachments: string[];
};
