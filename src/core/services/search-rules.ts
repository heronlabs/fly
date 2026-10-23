import {
  SearchMatch,
  SearchQuery,
  SearchRange,
  SearchResult,
} from '../domain/search';
import {GrepHit} from '../interfaces/vcs-gateway';

export const MAX_SEARCH_HITS = 2000;
export const MAX_HITS_PER_FILE = 100;
export const PREVIEW_CHARS = 200;
export const PREVIEW_LEAD = 20;

export const emptySearch: SearchResult = {
  files: [],
  total: 0,
  truncated: false,
};

// Highlights what git matched, in JavaScript. Like git, each line of the
// query is a pattern of its own. A literal has every non-word character
// escaped (an identity escape without the u flag); a regex that JavaScript
// rejects yields no highlighter.
export const highlighter = (query: SearchQuery): RegExp | null => {
  const source = query.text
    .split('\n')
    .map(part => (query.regex ? part : part.replace(/\W/g, '\\$&')))
    .join('|');
  try {
    return new RegExp(
      query.wholeWord ? `(?<!\\w)(?:${source})(?!\\w)` : source,
      query.caseSensitive ? 'g' : 'gi',
    );
  } catch {
    return null;
  }
};

export const rangesOf = (
  text: string,
  pattern: RegExp | null,
): SearchRange[] =>
  pattern
    ? [...text.matchAll(pattern)]
        .filter(match => match[0] !== '')
        .map(match => [match.index, match.index + match[0].length])
    : [];

// Starts a little before the first match, past the indentation, and marks
// cut content with an ellipsis.
export const previewOf = (
  text: string,
  ranges: SearchRange[],
): {preview: string; highlights: SearchRange[]} => {
  const indent = text.length - text.trimStart().length;
  const first = ranges[0]?.[0] ?? indent;
  const start = Math.min(first, Math.max(indent, first - PREVIEW_LEAD));
  const end = start + PREVIEW_CHARS;
  const prefix = start > indent ? '…' : '';
  const shift = prefix.length - start;
  return {
    preview: `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
    highlights: ranges
      .filter(([from]) => from < end)
      .map(([from, to]) => [from + shift, Math.min(to, end) + shift]),
  };
};

const matchOf = (hit: GrepHit, pattern: RegExp | null): SearchMatch => {
  const ranges = rangesOf(hit.text, pattern);
  return {
    line: hit.line,
    range: ranges[0] ?? null,
    ...previewOf(hit.text, ranges),
  };
};

// Groups the hits by file in git's order, at most MAX_HITS_PER_FILE per file
// and MAX_SEARCH_HITS in all; git is asked for one more per file, so a file
// over the cap is detected.
export const resultOf = (
  hits: GrepHit[],
  pattern: RegExp | null,
): SearchResult => {
  const files = new Map<string, SearchMatch[]>();
  let total = 0;
  let truncated = false;
  for (const hit of hits) {
    const matches = files.get(hit.path) ?? [];
    if (total >= MAX_SEARCH_HITS || matches.length >= MAX_HITS_PER_FILE) {
      truncated = true;
      continue;
    }
    matches.push(matchOf(hit, pattern));
    files.set(hit.path, matches);
    total += 1;
  }
  return {
    files: [...files].map(([path, matches]) => ({path, matches})),
    total,
    truncated,
  };
};
