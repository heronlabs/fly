import type {ReviewComment} from '../../core/domain/queue';

const INVALID = 'Resposta inesperada do GitHub';

type Fields = Record<string, unknown>;

// Object(value) === value is true only for objects: null and primitives fail.
const isRecord = (value: unknown): value is Fields =>
  Object(value) === value && !Array.isArray(value);

// Stryker disable BlockStatement: an emptied catch yields undefined, rejected by the caller like null
const parseJson = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
};
// Stryker restore BlockStatement

const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const login = (user: unknown): string | null =>
  isRecord(user) ? text(user.login) : null;

const epoch = (value: unknown): number | null => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
};

const idOf = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  return text(value);
};

// `gh pr view` reviews and conversation comments differ only in the time key.
const mapConversation = (
  entry: unknown,
  timeKey: string,
): ReviewComment | null => {
  if (!isRecord(entry)) return null;
  const id = text(entry.id);
  const author = login(entry.author);
  const body = text(entry.body);
  const url = text(entry.url);
  const createdAt = epoch(entry[timeKey]);
  if (
    id === null ||
    author === null ||
    body === null ||
    url === null ||
    createdAt === null
  ) {
    return null;
  }
  return {id, author, body, path: null, line: null, url, createdAt};
};

const mapLineComment = (entry: unknown): ReviewComment | null => {
  if (!isRecord(entry)) return null;
  const id = idOf(entry.id);
  const author = login(entry.user);
  const body = text(entry.body);
  const url = text(entry.html_url);
  const createdAt = epoch(entry.created_at);
  if (
    id === null ||
    author === null ||
    body === null ||
    url === null ||
    createdAt === null
  ) {
    return null;
  }
  const line = entry.line ?? entry.original_line;
  return {
    id,
    author,
    body,
    path: text(entry.path),
    line: typeof line === 'number' ? line : null,
    url,
    createdAt,
  };
};

// Stryker disable next-line ArrayDeclaration: a stand-in entry is skipped as a non-object
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const parseReviewComments = (
  viewJson: string,
  linesJson: string,
): ReviewComment[] => {
  const view = parseJson(viewJson);
  const lines = parseJson(linesJson);
  if (!isRecord(view) || !Array.isArray(lines)) {
    throw new Error(INVALID);
  }
  return [
    ...list(view.reviews).flatMap(e => mapConversation(e, 'submittedAt') ?? []),
    ...list(view.comments).flatMap(e => mapConversation(e, 'createdAt') ?? []),
    ...lines.flatMap(e => mapLineComment(e) ?? []),
  ].sort((a, b) => a.createdAt - b.createdAt);
};
