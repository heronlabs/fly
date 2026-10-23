import type {SearchQuery} from '../../../../src/core/domain/search';
import type {GrepHit} from '../../../../src/core/interfaces/vcs-gateway';
import {
  emptySearch,
  highlighter,
  MAX_HITS_PER_FILE,
  MAX_SEARCH_HITS,
  PREVIEW_CHARS,
  PREVIEW_LEAD,
  previewOf,
  rangesOf,
  resultOf,
} from '../../../../src/core/services/search-rules';

const query = (text: string, over: Partial<SearchQuery> = {}): SearchQuery => ({
  text,
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  ...over,
});

const ranges = (text: string, q: SearchQuery) => rangesOf(text, highlighter(q));

describe('search rules', () => {
  it('Should cap at 2000 hits, 100 per file, and preview 200 chars with a 20-char lead', () => {
    expect(MAX_SEARCH_HITS).toBe(2000);
    expect(MAX_HITS_PER_FILE).toBe(100);
    expect(PREVIEW_CHARS).toBe(200);
    expect(PREVIEW_LEAD).toBe(20);
    expect(emptySearch).toEqual({files: [], total: 0, truncated: false});
  });

  describe('highlighter', () => {
    it('Should match a literal case-insensitively by default', () => {
      expect(ranges('Foo foo FOO', query('foo'))).toEqual([
        [0, 3],
        [4, 7],
        [8, 11],
      ]);
    });

    it('Should match only the exact case when case-sensitive', () => {
      expect(ranges('Foo foo', query('foo', {caseSensitive: true}))).toEqual([
        [4, 7],
      ]);
    });

    it('Should escape every regex character of a literal', () => {
      const special = '.*+?^${}()|[]\\/-bdsw';
      expect(ranges(`x${special}x axxbx`, query(special))).toEqual([[1, 21]]);
      expect(ranges('axb a.b a.b', query('a.b'))).toEqual([
        [4, 7],
        [8, 11],
      ]);
    });

    it('Should keep non-ASCII characters of a literal', () => {
      expect(ranges('maçã 😀 x', query('ã 😀'))).toEqual([[3, 7]]);
    });

    it('Should read the query as a regex with the regex flag', () => {
      expect(ranges('axb a.b', query('a.b', {regex: true}))).toEqual([
        [0, 3],
        [4, 7],
      ]);
    });

    it('Should bound a whole word on both sides by non-word characters', () => {
      expect(
        ranges('xfoo foox foo -foo', query('foo', {wholeWord: true})),
      ).toEqual([
        [10, 13],
        [15, 18],
      ]);
      expect(
        ranges('ab|cd abx', query('ab|cd', {wholeWord: true, regex: true})),
      ).toEqual([
        [0, 2],
        [3, 5],
      ]);
    });

    it('Should read each line of the query as its own pattern, like git', () => {
      expect(ranges('c|d x a.b axb', query('a.b\nc|d'))).toEqual([
        [0, 3],
        [6, 9],
      ]);
      expect(ranges('bar foo', query('f.o\nb.r', {regex: true}))).toEqual([
        [0, 3],
        [4, 7],
      ]);
      expect(
        ranges('foobar bar foo', query('foo\nbar', {wholeWord: true})),
      ).toEqual([
        [7, 10],
        [11, 14],
      ]);
    });

    it('Should give no highlighter for a regex JavaScript rejects', () => {
      expect(highlighter(query('(', {regex: true}))).toBeNull();
      expect(rangesOf('null', null)).toEqual([]);
    });
  });

  describe('rangesOf', () => {
    it('Should skip empty matches', () => {
      expect(ranges('baa', query('a*', {regex: true}))).toEqual([[1, 3]]);
    });

    it('Should find nothing in a line the pattern misses', () => {
      expect(ranges('abc', query('x'))).toEqual([]);
    });
  });

  describe('previewOf', () => {
    it('Should keep a short line whole', () => {
      expect(previewOf('const foo = 1;', [[6, 9]])).toEqual({
        preview: 'const foo = 1;',
        highlights: [[6, 9]],
      });
    });

    it('Should drop the indentation without an ellipsis', () => {
      expect(previewOf('    foo bar', [[8, 11]])).toEqual({
        preview: 'foo bar',
        highlights: [[4, 7]],
      });
      expect(previewOf('  plain', [])).toEqual({
        preview: 'plain',
        highlights: [],
      });
    });

    it('Should start the lead before a far match, behind an ellipsis', () => {
      const text = `${'a'.repeat(50)}foo`;
      expect(previewOf(text, [[50, 53]])).toEqual({
        preview: `…${'a'.repeat(20)}foo`,
        highlights: [[21, 24]],
      });
    });

    it('Should start at a match inside the indentation', () => {
      expect(previewOf('   x', [[1, 2]])).toEqual({
        preview: '  x',
        highlights: [[0, 1]],
      });
    });

    it('Should cut a long line, clip a crossing match and drop later ones', () => {
      const text = `foo${'b'.repeat(PREVIEW_CHARS - 4)}foofoo`;
      expect(text.length).toBe(PREVIEW_CHARS + 5);
      expect(
        previewOf(text, [
          [0, 3],
          [PREVIEW_CHARS - 1, PREVIEW_CHARS + 2],
          [PREVIEW_CHARS + 2, PREVIEW_CHARS + 5],
        ]),
      ).toEqual({
        preview: `${text.slice(0, PREVIEW_CHARS)}…`,
        highlights: [
          [0, 3],
          [PREVIEW_CHARS - 1, PREVIEW_CHARS],
        ],
      });
      expect(
        previewOf(text, [
          [0, 1],
          [PREVIEW_CHARS, PREVIEW_CHARS + 1],
        ]).highlights,
      ).toEqual([[0, 1]]);
    });

    it('Should not add an ellipsis to a line of exactly the preview length', () => {
      const text = 'x'.repeat(PREVIEW_CHARS);
      expect(previewOf(text, [[0, 1]]).preview).toBe(text);
    });
  });

  describe('resultOf', () => {
    const hit = (path: string, line: number, text = 'a foo'): GrepHit => ({
      path,
      line,
      text,
    });

    it('Should group hits by file in git order with ranges and previews', () => {
      expect(
        resultOf(
          [hit('b.ts', 2), hit('b.ts', 9, '  foo foo'), hit('a.ts', 1, 'x')],
          highlighter(query('foo')),
        ),
      ).toEqual({
        files: [
          {
            path: 'b.ts',
            matches: [
              {line: 2, range: [2, 5], preview: 'a foo', highlights: [[2, 5]]},
              {
                line: 9,
                range: [2, 5],
                preview: 'foo foo',
                highlights: [
                  [0, 3],
                  [4, 7],
                ],
              },
            ],
          },
          {
            path: 'a.ts',
            matches: [{line: 1, range: null, preview: 'x', highlights: []}],
          },
        ],
        total: 3,
        truncated: false,
      });
    });

    it('Should keep 100 hits of a file and flag the 101st', () => {
      const hits = Array.from({length: MAX_HITS_PER_FILE + 1}, (_, i) =>
        hit('a.ts', i + 1),
      );
      const result = resultOf([...hits, hit('b.ts', 1)], null);
      expect(result.files.map(f => [f.path, f.matches.length])).toEqual([
        ['a.ts', MAX_HITS_PER_FILE],
        ['b.ts', 1],
      ]);
      expect(result.total).toBe(MAX_HITS_PER_FILE + 1);
      expect(result.truncated).toBe(true);
    });

    it('Should keep 2000 hits in all and flag the rest', () => {
      const hits = Array.from({length: MAX_SEARCH_HITS + 1}, (_, i) =>
        hit(`f${Math.floor(i / 10)}.ts`, i),
      );
      const result = resultOf(hits, null);
      expect(result.total).toBe(MAX_SEARCH_HITS);
      expect(result.files).toHaveLength(MAX_SEARCH_HITS / 10);
      expect(result.truncated).toBe(true);
      expect(resultOf(hits.slice(0, MAX_SEARCH_HITS), null).truncated).toBe(
        false,
      );
    });

    it('Should give an empty result for no hits', () => {
      expect(resultOf([], null)).toEqual(emptySearch);
    });
  });
});
