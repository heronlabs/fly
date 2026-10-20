export type Receipt = {
  summary: string;
  filesChanged: string[];
  verification: Record<string, 'pass' | 'fail' | 'skipped'>;
  notes?: string;
};

export type ReceiptResult =
  {kind: 'valid'; receipt: Receipt} | {kind: 'invalid'; problems: string[]};

export type TranscriptSummary = {
  phase: 'none' | 'mid-turn' | 'turn-ended';
  /** An AskUserQuestion tool_use is open. */
  asking: boolean;
  openTools: number;
  /** Milliseconds since epoch. */
  lastEventAt: number | null;
  /** `toolUseResult.scheduledFor`, in milliseconds. */
  wakeupAt: number | null;
  looping: boolean;
  lastTurnEndAt: number | null;
  backgroundAgents: number;
  /** Launch times (ms) of shells with no completion yet. */
  backgroundShells: number[];
  launchCwd: string | null;
  worktreePath: string | null;
  receipt: ReceiptResult | null;
};

export type Activity = 'waiting' | 'running' | 'scheduled' | 'unknown';
