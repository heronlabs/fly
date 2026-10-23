export type SearchQuery = {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
};
// [start, end) in UTF-16 code units.
export type SearchRange = [start: number, end: number];
export type SearchMatch = {
  line: number;
  // The first match in the whole line; null when the highlighter cannot
  // place it (a git regex that JavaScript reads differently).
  range: SearchRange | null;
  // The line cut to fit, and the matches inside the cut.
  preview: string;
  highlights: SearchRange[];
};
export type SearchFile = {path: string; matches: SearchMatch[]};
export type SearchResult = {
  files: SearchFile[];
  total: number;
  truncated: boolean;
};
