import {parseReviewComments} from '../../../../src/infrastructure/github/review-comments-parser';

const INVALID = /^Resposta inesperada do GitHub$/;

const review = (over: Record<string, unknown> = {}) => ({
  id: 'PRR_1',
  author: {login: 'rev'},
  body: 'looks off',
  submittedAt: '2026-10-27T10:00:00Z',
  url: 'https://github.com/o/r/pull/7#pullrequestreview-1',
  ...over,
});

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'IC_1',
  author: {login: 'talker'},
  body: 'conversation',
  createdAt: '2026-10-27T09:00:00Z',
  url: 'https://github.com/o/r/pull/7#issuecomment-1',
  ...over,
});

const line = (over: Record<string, unknown> = {}) => ({
  id: 555,
  user: {login: 'liner'},
  body: 'rename this',
  path: 'src/a.ts',
  line: 7,
  original_line: 3,
  html_url: 'https://github.com/o/r/pull/7#discussion_r555',
  created_at: '2026-10-27T11:00:00Z',
  ...over,
});

const parse = (
  view: Record<string, unknown> = {},
  lines: unknown[] = [],
): ReturnType<typeof parseReviewComments> =>
  parseReviewComments(JSON.stringify(view), JSON.stringify(lines));

describe('parseReviewComments', () => {
  it('Should map a review with a null path and line', () => {
    expect(parse({reviews: [review()]})).toEqual([
      {
        id: 'PRR_1',
        author: 'rev',
        body: 'looks off',
        path: null,
        line: null,
        url: 'https://github.com/o/r/pull/7#pullrequestreview-1',
        createdAt: Date.parse('2026-10-27T10:00:00Z'),
      },
    ]);
  });

  it('Should map a conversation comment with a null path and line', () => {
    expect(parse({comments: [comment()]})).toEqual([
      {
        id: 'IC_1',
        author: 'talker',
        body: 'conversation',
        path: null,
        line: null,
        url: 'https://github.com/o/r/pull/7#issuecomment-1',
        createdAt: Date.parse('2026-10-27T09:00:00Z'),
      },
    ]);
  });

  it('Should map a line comment and stringify its numeric id', () => {
    expect(parse({}, [line()])).toEqual([
      {
        id: '555',
        author: 'liner',
        body: 'rename this',
        path: 'src/a.ts',
        line: 7,
        url: 'https://github.com/o/r/pull/7#discussion_r555',
        createdAt: Date.parse('2026-10-27T11:00:00Z'),
      },
    ]);
  });

  it('Should fall back to original_line when line is null', () => {
    expect(parse({}, [line({line: null})])[0]!.line).toBe(3);
  });

  it('Should keep a null line when line and original_line are both null', () => {
    expect(parse({}, [line({line: null, original_line: null})])[0]!.line).toBe(
      null,
    );
    expect(parse({}, [line({line: null, original_line: 'x'})])[0]!.line).toBe(
      null,
    );
  });

  it('Should use a null path when the line comment has none', () => {
    expect(parse({}, [line({path: undefined})])[0]!.path).toBeNull();
    expect(parse({}, [line({path: 4})])[0]!.path).toBeNull();
  });

  it('Should keep a string id of a line comment as is', () => {
    expect(parse({}, [line({id: 'abc'})])[0]!.id).toBe('abc');
  });

  it('Should merge reviews, comments and line comments sorted by createdAt', () => {
    const result = parse(
      {
        reviews: [review({submittedAt: '2026-10-27T10:00:00Z'})],
        comments: [comment({createdAt: '2026-10-27T12:00:00Z'})],
      },
      [line({created_at: '2026-10-27T09:00:00Z'})],
    );
    expect(result.map(c => c.id)).toEqual(['555', 'PRR_1', 'IC_1']);
  });

  it('Should treat a missing reviews or comments array as empty', () => {
    expect(parse({})).toEqual([]);
    expect(parse({reviews: 'x', comments: null})).toEqual([]);
  });

  it.each([
    ['id', undefined],
    ['id', 5],
    ['author', undefined],
    ['author', 'rev'],
    ['author', {login: 5}],
    ['body', undefined],
    ['body', 5],
    ['submittedAt', undefined],
    ['submittedAt', 'not a date'],
    ['submittedAt', 5],
    ['url', undefined],
    ['url', 5],
  ])('Should skip a review whose %s is %s', (field, value) => {
    expect(parse({reviews: [review({[field]: value}), review()]})).toHaveLength(
      1,
    );
  });

  it.each([
    ['id', undefined],
    ['author', undefined],
    ['body', undefined],
    ['createdAt', 'nope'],
    ['createdAt', undefined],
    ['url', undefined],
  ])('Should skip a conversation comment whose %s is %s', (field, value) => {
    expect(
      parse({comments: [comment({[field]: value}), comment()]}),
    ).toHaveLength(1);
  });

  it.each([
    ['id', undefined],
    ['id', null],
    ['user', undefined],
    ['user', {login: 5}],
    ['body', undefined],
    ['created_at', 'nope'],
    ['created_at', undefined],
    ['html_url', undefined],
  ])('Should skip a line comment whose %s is %s', (field, value) => {
    expect(parse({}, [line({[field]: value}), line()])).toHaveLength(1);
  });

  it('Should skip entries that are not objects', () => {
    expect(
      parse({reviews: [null, 3, 'x', [], review()], comments: [null]}, [
        null,
        'x',
        [],
        line(),
      ]),
    ).toHaveLength(2);
  });

  it.each(['{', '[]', 'null', '3'])(
    'Should reject %s as the pr view output',
    json => {
      expect(() => parseReviewComments(json, '[]')).toThrow(INVALID);
    },
  );

  it.each(['{', '{}', 'null', '3'])(
    'Should reject %s as the api output',
    json => {
      expect(() => parseReviewComments('{}', json)).toThrow(INVALID);
    },
  );
});
