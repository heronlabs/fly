import type {QueueStatus} from '../domain/queue';
import {
  CONVENTIONAL_TITLE,
  MAX_TITLE_CHARS,
  TaskPhase,
  TaskRecord,
} from '../domain/task';
import type {TranscriptSummary} from '../domain/transcript';
import type {MultiplexerSession} from '../interfaces/session-launcher';

export type PrText = {title: string; body: string};

// Code points, so an emoji counts once.
export const isConventionalTitle = (title: string): boolean =>
  CONVENTIONAL_TITLE.test(title) && Array.from(title).length <= MAX_TITLE_CHARS;

const ATTACHMENTS = '\n\nArquivos anexados:\n';

// P9: what the session reads before writing the PR's title and body.
export const prRequest = (input: {
  template: string;
  prompt: string | null;
  outFile: string;
}): string => {
  // The attachments block lists local paths, which must not reach GitHub.
  const prompt = input.prompt?.split(ATTACHMENTS)[0] ?? null;
  const motivation =
    prompt === null
      ? ['- Motivation: write Motivation from this conversation.']
      : [
          '- Motivation: quote the original task under Motivation:',
          '',
          ...prompt.split('\n').map(line => `> ${line}`),
        ];
  return [
    `Write the pull request for this branch as JSON to ${input.outFile}: {"title": string, "body": string}.`,
    '',
    `- Title: Conventional Commits ("type(scope): summary", where type is one of build, chore, ci, docs, feat, fix, perf, refactor, revert, style or test), at most ${MAX_TITLE_CHARS} characters, describing the whole branch.`,
    "- Body: fill the template below section by section, in English, deleting each section's comment hints, and leaving a section empty only when it does not apply.",
    ...motivation,
    '',
    'Do not push and do not open the pull request: fly does both after this turn.',
    '',
    'Template:',
    '',
    input.template,
  ].join('\n');
};

// A session this young may still be starting up.
const MIN_SESSION_AGE_MS = 5000;

// P6: the session fly talks to takes a new instruction: its last turn ended
// with no question or agent open, or it was started without a prompt (no
// transcript yet) and is past start-up. createdAt is in seconds.
export const isSessionIdle = (
  summary: TranscriptSummary | null,
  session: MultiplexerSession,
  now: number,
): boolean => {
  if (summary !== null && summary.phase !== 'none') {
    return (
      summary.phase === 'turn-ended' &&
      !summary.asking &&
      summary.backgroundAgents === 0
    );
  }
  const {options} = session;
  return (
    options['@fly_task'] === undefined &&
    options['@fly_task_repo'] === undefined &&
    now - session.createdAt * 1000 >= MIN_SESSION_AGE_MS
  );
};

export const openInstruction = (requestFile: string): string =>
  `fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em ${requestFile}`;

// pr.json as the session wrote it; null when missing, not JSON, or without a
// string title and body.
export const parsePrText = (raw: string | null): PrText | null => {
  let parsed: unknown = null;
  try {
    // A missing file reads as the text "null", which parses to null.
    parsed = JSON.parse(String(raw));
  } catch {
    // Not JSON stays null.
  }
  const {title, body} = (parsed ?? {}) as Record<string, unknown>;
  return typeof title === 'string' && typeof body === 'string'
    ? {title, body}
    : null;
};

const PHASE_STATUS: Partial<Record<TaskPhase, QueueStatus>> = {
  opening: 'engineer',
  fixing: 'engineer',
  reviewing: 'engineer',
  stopped: 'waiting',
};

// P11: the lifecycle's own status, which overrides the PR and the sessions.
export const taskStatus = (task: TaskRecord | null): QueueStatus | null =>
  (task && PHASE_STATUS[task.phase]) ?? null;

// P6: fly talks to the newest live fly-started session; the first listed
// wins a tie.
export const newestFlySession = <T extends {session: MultiplexerSession}>(
  items: T[],
): T | null =>
  items.reduce<T | null>(
    (newest, item) =>
      item.session.options['@fly_session_id'] &&
      (newest === null || item.session.createdAt > newest.session.createdAt)
        ? item
        : newest,
    null,
  );
