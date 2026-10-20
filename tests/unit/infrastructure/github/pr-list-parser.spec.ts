import {parsePrList} from '../../../../src/infrastructure/github/pr-list-parser';

const pr = (over: Record<string, unknown> = {}) => ({
  number: 7,
  url: 'https://github.com/o/r/pull/7',
  headRefName: 'feat-x',
  state: 'OPEN',
  isDraft: false,
  mergeable: 'MERGEABLE',
  reviewDecision: 'APPROVED',
  statusCheckRollup: [],
  ...over,
});

const parse = (over: Record<string, unknown> = {}) =>
  parsePrList(JSON.stringify([pr(over)]))[0]!;

const run = (status: string, conclusion: string | null) => ({
  __typename: 'CheckRun',
  status,
  conclusion,
});
const ctx = (state: string) => ({__typename: 'StatusContext', state});

describe('parsePrList', () => {
  it('Should map the basic fields', () => {
    expect(parse()).toEqual({
      number: 7,
      url: 'https://github.com/o/r/pull/7',
      branch: 'feat-x',
      state: 'open',
      draft: false,
      mergeable: 'mergeable',
      review: 'approved',
      checks: 'none',
    });
  });

  it('Should return an empty list for []', () => {
    expect(parsePrList('[]')).toEqual([]);
  });

  it.each([
    ['OPEN', 'open'],
    ['MERGED', 'merged'],
    ['CLOSED', 'closed'],
  ])('Should map state %s to %s', (state, expected) => {
    expect(parse({state}).state).toBe(expected);
  });

  it('Should map isDraft to draft', () => {
    expect(parse({isDraft: true}).draft).toBe(true);
  });

  it.each([
    ['MERGEABLE', 'mergeable'],
    ['CONFLICTING', 'conflicting'],
    ['UNKNOWN', 'unknown'],
    [null, 'unknown'],
  ])('Should map mergeable %s to %s', (mergeable, expected) => {
    expect(parse({mergeable}).mergeable).toBe(expected);
  });

  it.each([
    ['APPROVED', 'approved'],
    ['CHANGES_REQUESTED', 'changes-requested'],
    ['REVIEW_REQUIRED', 'required'],
    ['', 'none'],
    [null, 'none'],
  ])('Should map reviewDecision %s to %s', (reviewDecision, expected) => {
    expect(parse({reviewDecision}).review).toBe(expected);
  });

  it('Should map a null rollup to none', () => {
    expect(parse({statusCheckRollup: null}).checks).toBe('none');
  });

  it('Should map a missing rollup to none', () => {
    expect(parse({statusCheckRollup: undefined}).checks).toBe('none');
  });

  it.each(['SUCCESS', 'NEUTRAL', 'SKIPPED'])(
    'Should treat a completed CheckRun %s as passing',
    conclusion => {
      expect(
        parse({statusCheckRollup: [run('COMPLETED', conclusion)]}).checks,
      ).toBe('passing');
    },
  );

  it.each(['FAILURE', 'CANCELLED', 'TIMED_OUT', null])(
    'Should treat a completed CheckRun %s as failing',
    conclusion => {
      expect(
        parse({statusCheckRollup: [run('COMPLETED', conclusion)]}).checks,
      ).toBe('failing');
    },
  );

  it('Should treat a CheckRun IN_PROGRESS plus a SUCCESS as pending', () => {
    expect(
      parse({
        statusCheckRollup: [
          run('IN_PROGRESS', null),
          run('COMPLETED', 'SUCCESS'),
        ],
      }).checks,
    ).toBe('pending');
  });

  it.each([
    ['SUCCESS', 'passing'],
    ['PENDING', 'pending'],
    ['EXPECTED', 'pending'],
    ['FAILURE', 'failing'],
    ['ERROR', 'failing'],
  ])('Should map StatusContext %s to %s', (state, expected) => {
    expect(parse({statusCheckRollup: [ctx(state)]}).checks).toBe(expected);
  });

  it('Should ignore a StatusContext with an unknown state', () => {
    expect(parse({statusCheckRollup: [ctx('WAT')]}).checks).toBe('none');
  });

  it('Should ignore a StatusContext without a string state', () => {
    expect(
      parse({statusCheckRollup: [{__typename: 'StatusContext'}]}).checks,
    ).toBe('none');
  });

  it('Should let failing beat pending', () => {
    expect(
      parse({
        statusCheckRollup: [run('IN_PROGRESS', null), ctx('FAILURE')],
      }).checks,
    ).toBe('failing');
  });

  it('Should ignore unknown typenames and non-object entries', () => {
    expect(
      parse({
        statusCheckRollup: [{__typename: 'Weird', state: 'FAILURE'}, 'x', null],
      }).checks,
    ).toBe('none');
  });

  it('Should skip non-object PR entries and entries missing core fields', () => {
    const json = JSON.stringify([null, 3, {number: 'x'}, pr()]);
    expect(parsePrList(json)).toHaveLength(1);
  });

  it.each([
    ['number', '7'],
    ['url', 5],
    ['headRefName', 5],
    ['state', ['OPEN']],
  ])('Should skip a PR whose %s has the wrong type', (field, value) => {
    expect(parsePrList(JSON.stringify([pr({[field]: value})]))).toEqual([]);
  });

  it('Should skip array entries', () => {
    expect(parsePrList(JSON.stringify([[], pr()]))).toHaveLength(1);
  });

  it('Should treat a non-string reviewDecision as none', () => {
    expect(parse({reviewDecision: ['APPROVED']}).review).toBe('none');
  });

  it('Should ignore a StatusContext whose state is not a string', () => {
    expect(
      parse({
        statusCheckRollup: [{__typename: 'StatusContext', state: ['FAILURE']}],
      }).checks,
    ).toBe('none');
  });

  it('Should map a non-array rollup to none', () => {
    expect(parse({statusCheckRollup: 'FAILURE'}).checks).toBe('none');
  });

  it('Should skip PRs with an unknown state', () => {
    expect(parsePrList(JSON.stringify([pr({state: 'WAT'})]))).toEqual([]);
  });

  it.each(['{', '{}', 'null'])('Should throw on %s', json => {
    expect(() => parsePrList(json)).toThrow('Resposta inválida do gh');
  });
});
