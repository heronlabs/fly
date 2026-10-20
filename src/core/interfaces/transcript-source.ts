import type {TranscriptSummary} from '../domain/transcript';

export abstract class TranscriptSource {
  /** The transcript a fly-started session writes, following /clear successors; null until it exists. */
  abstract forSession(input: {
    launchCwd: string;
    sessionId: string;
  }): Promise<TranscriptSummary | null>;
  /** D8a best effort for a session fly did not start. */
  abstract forDirectory(input: {
    cwd: string;
    since: number;
    exclude: string[];
    now: number;
  }): Promise<TranscriptSummary | 'ambiguous' | null>;
}
