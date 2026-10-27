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
  title: 'Add x',
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
const RUN_IDS_NONE = {kind: 'run', runId: null, jobId: null};
const STATUS = {kind: 'status', conclusion: null, runId: null, jobId: null};

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
      title: 'Add x',
      checkRuns: [],
      headSha: null,
      behind: false,
    });
  });

  it('Should map a missing or non-string title to an empty string', () => {
    expect(parse({title: undefined}).title).toBe('');
    expect(parse({title: 3}).title).toBe('');
  });

  it('Should list check rows in rollup order with name, state and url', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        {...run('COMPLETED', 'SUCCESS'), name: 'build', detailsUrl: 'u1'},
        {...ctx('PENDING'), context: 'ci/legacy', targetUrl: null},
        {...run('IN_PROGRESS', null), name: 'lint', detailsUrl: 3},
        {...run('COMPLETED', 'FAILURE'), name: 'test', detailsUrl: 'u4'},
      ],
    });
    expect(checkRuns).toEqual([
      {
        ...RUN_IDS_NONE,
        name: 'build',
        state: 'passing',
        url: 'u1',
        conclusion: 'SUCCESS',
      },
      {...STATUS, name: 'ci/legacy', state: 'pending', url: null},
      {
        ...RUN_IDS_NONE,
        name: 'lint',
        state: 'pending',
        url: null,
        conclusion: null,
      },
      {
        ...RUN_IDS_NONE,
        name: 'test',
        state: 'failing',
        url: 'u4',
        conclusion: 'FAILURE',
      },
    ]);
  });

  it('Should read the run and job ids from the details url of a CheckRun', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        {
          ...run('COMPLETED', 'CANCELLED'),
          name: 'build',
          detailsUrl:
            'https://github.com/o/r/actions/runs/40097015929/job/121586961078',
        },
      ],
    });
    expect(checkRuns).toEqual([
      {
        kind: 'run',
        name: 'build',
        state: 'failing',
        url: 'https://github.com/o/r/actions/runs/40097015929/job/121586961078',
        conclusion: 'CANCELLED',
        runId: '40097015929',
        jobId: '121586961078',
      },
    ]);
  });

  it.each([
    'https://github.com/o/r/actions/runs/1',
    'https://ci.example/x/actions/runs/12/job/ab',
    'https://github.com/o/r/actions/runs/12/job/34/extra',
    'https://github.com/o/r/runs/12/job/34',
    'prefix/actions/runs/12/jobs/34',
  ])('Should leave the ids null when the details url is %s', detailsUrl => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        {...run('COMPLETED', 'FAILURE'), name: 'n', detailsUrl},
      ],
    });
    expect(checkRuns[0]).toMatchObject({runId: null, jobId: null});
  });

  it('Should map a non-string conclusion of a CheckRun to null', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [{...run('IN_PROGRESS', null), name: 'n'}],
    });
    expect(checkRuns[0]!.conclusion).toBeNull();
    const other = parse({
      statusCheckRollup: [{...run('COMPLETED', 5 as never), name: 'n'}],
    });
    expect(other.checkRuns[0]!.conclusion).toBeNull();
  });

  it('Should map headRefOid to headSha and anything else to null', () => {
    expect(parse({headRefOid: 'abc123'}).headSha).toBe('abc123');
    expect(parse({headRefOid: 5}).headSha).toBeNull();
    expect(parse({headRefOid: undefined}).headSha).toBeNull();
  });

  it.each([
    ['BEHIND', true],
    ['CLEAN', false],
    ['DIRTY', false],
    [null, false],
    [undefined, false],
  ])('Should map mergeStateStatus %s to behind %s', (status, expected) => {
    expect(parse({mergeStateStatus: status}).behind).toBe(expected);
  });

  it('Should not read ids from the target url of a StatusContext', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        {
          ...ctx('FAILURE'),
          context: 'c',
          targetUrl: 'https://github.com/o/r/actions/runs/1/job/2',
        },
      ],
    });
    expect(checkRuns[0]).toMatchObject({runId: null, jobId: null});
  });

  it('Should read StatusContext url from targetUrl', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [{...ctx('SUCCESS'), context: 'c', targetUrl: 't'}],
    });
    expect(checkRuns).toEqual([
      {...STATUS, name: 'c', state: 'passing', url: 't'},
    ]);
  });

  it('Should not read a CheckRun name from context nor a StatusContext name from name', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        {...run('COMPLETED', 'SUCCESS'), context: 'c'},
        {...ctx('SUCCESS'), name: 'n'},
      ],
    });
    expect(checkRuns).toEqual([]);
  });

  it('Should drop rows without a string name or a known state', () => {
    const {checkRuns} = parse({
      statusCheckRollup: [
        run('COMPLETED', 'SUCCESS'),
        {...run('COMPLETED', 'SUCCESS'), name: 4},
        {...ctx('WEIRD'), context: 'x'},
        {__typename: 'Weird', name: 'y'},
        'z',
        null,
      ],
    });
    expect(checkRuns).toEqual([]);
  });

  it.each([null, undefined, 'x', {}])(
    'Should map a non-array rollup (%s) to no rows',
    rollup => {
      expect(parse({statusCheckRollup: rollup}).checkRuns).toEqual([]);
    },
  );

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

  it('Should skip a PR from a fork', () => {
    expect(
      parsePrList(
        JSON.stringify([pr({isCrossRepository: true}), pr({number: 8})]),
      ).map(p => p.number),
    ).toEqual([8]);
  });

  it.each([false, undefined, 'true', 1])(
    'Should keep a PR whose isCrossRepository is %s',
    value => {
      expect(parse({isCrossRepository: value}).number).toBe(7);
    },
  );

  it.each(['{', '{}', 'null'])('Should throw on %s', json => {
    expect(() => parsePrList(json)).toThrow('Resposta inválida do gh');
  });
});
