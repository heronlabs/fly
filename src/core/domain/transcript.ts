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
};

export type Activity = 'waiting' | 'running' | 'scheduled' | 'unknown';
