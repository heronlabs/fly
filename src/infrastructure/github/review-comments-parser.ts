import type {ReviewComment} from '../../core/domain/queue';
import {type Fields, isRecord, stringOrNull} from './json-fields';

const INVALID = 'Resposta inesperada do GitHub';

const login = (user: unknown): string | null =>
  isRecord(user) ? stringOrNull(user.login) : null;

const epoch = (value: unknown): number | null => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
};

const idOf = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  return stringOrNull(value);
};

// `gh pr view` reviews and conversation comments differ in the time key and
// in the link: gh gives a review no url, so it falls back to the PR's own.
const mapConversation = (
  entry: unknown,
  timeKey: string,
  fallbackUrl: string | null,
): ReviewComment | null => {
  if (!isRecord(entry)) return null;
  const id = stringOrNull(entry.id);
  const author = login(entry.author);
  const body = stringOrNull(entry.body);
  const url = stringOrNull(entry.url) ?? fallbackUrl;
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
  const body = stringOrNull(entry.body);
  const url = stringOrNull(entry.html_url);
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
    path: stringOrNull(entry.path),
    line: typeof line === 'number' ? line : null,
    url,
    createdAt,
  };
};

// Stryker disable next-line ArrayDeclaration: a stand-in entry is skipped as a non-object
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const parseInputs = (
  viewJson: string,
  linesJson: string,
): {view: Fields; lines: unknown[]} => {
  try {
    const view: unknown = JSON.parse(viewJson);
    const lines: unknown = JSON.parse(linesJson);
    if (isRecord(view) && Array.isArray(lines)) return {view, lines};
  } catch {
    // Unparseable JSON falls through to the rejection below.
  }
  throw new Error(INVALID);
};

export const parseReviewComments = (
  viewJson: string,
  linesJson: string,
): ReviewComment[] => {
  const {view, lines} = parseInputs(viewJson, linesJson);
  return [
    ...list(view.reviews).flatMap(
      e => mapConversation(e, 'submittedAt', stringOrNull(view.url)) ?? [],
    ),
    ...list(view.comments).flatMap(
      e => mapConversation(e, 'createdAt', null) ?? [],
    ),
    ...lines.flatMap(e => mapLineComment(e) ?? []),
  ].sort((a, b) => a.createdAt - b.createdAt);
};
