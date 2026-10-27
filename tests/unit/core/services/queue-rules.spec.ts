import {PullRequest} from '../../../../src/core/domain/queue';
import {TaskPhase, TaskRecord} from '../../../../src/core/domain/task';
import {
  Activity,
  TranscriptSummary,
} from '../../../../src/core/domain/transcript';
import {
  classifyActivity,
  PRECEDENCE,
  pullRequestStatus,
  worktreeStatus,
} from '../../../../src/core/services/queue-rules';

const MIN = 60_000;
const now = 1_800_000_000_000;

const summary = (
  overrides: Partial<TranscriptSummary> = {},
): TranscriptSummary => ({
  phase: 'turn-ended',
  asking: false,
  openTools: 0,
  lastEventAt: now - 1000,
  wakeupAt: null,
  looping: false,
  lastTurnEndAt: now - 1000,
  backgroundAgents: 0,
  backgroundShells: [],
  launchCwd: null,
  ...overrides,
});

const pr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 1,
  url: 'https://github.com/o/r/pull/1',
  branch: 'feat-x',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  review: 'approved',
  checks: 'passing',
  title: 'Add x',
  checkRuns: [],
  headSha: null,
  behind: false,
  ...overrides,
});

describe('classifyActivity', () => {
  it.each<[string, TranscriptSummary | null, Activity]>([
    ['null summary', null, 'unknown'],
    ['phase none', summary({phase: 'none'}), 'unknown'],
    [
      'asking with a future wakeup',
      summary({asking: true, wakeupAt: now + 5 * MIN}),
      'waiting',
    ],
    [
      'mid-turn with an open tool, long silence',
      summary({
        phase: 'mid-turn',
        openTools: 1,
        lastEventAt: now - 120 * MIN,
      }),
      'running',
    ],
    [
      'mid-turn, no tools, 9min silence',
      summary({phase: 'mid-turn', lastEventAt: now - 9 * MIN}),
      'running',
    ],
    [
      'mid-turn, no tools, 11min silence',
      summary({phase: 'mid-turn', lastEventAt: now - 11 * MIN}),
      'unknown',
    ],
    [
      'mid-turn, no tools, null lastEventAt',
      summary({phase: 'mid-turn', lastEventAt: null}),
      'running',
    ],
    [
      'mid-turn, no tools, exactly 10min silence',
      summary({phase: 'mid-turn', lastEventAt: now - 10 * MIN}),
      'running',
    ],
    [
      'wakeup exactly 20min ago',
      summary({wakeupAt: now - 20 * MIN}),
      'scheduled',
    ],
    [
      'looping, turn ended exactly 1,500,000ms ago',
      summary({looping: true, lastTurnEndAt: now - 1_500_000}),
      'scheduled',
    ],
    [
      'shell launched exactly 60min ago',
      summary({backgroundShells: [now - 60 * MIN]}),
      'scheduled',
    ],
    ['wakeup in the future', summary({wakeupAt: now + 5 * MIN}), 'scheduled'],
    ['wakeup 19min ago', summary({wakeupAt: now - 19 * MIN}), 'scheduled'],
    ['wakeup 21min ago', summary({wakeupAt: now - 21 * MIN}), 'unknown'],
    [
      'looping, turn ended 24min ago',
      summary({looping: true, lastTurnEndAt: now - 24 * MIN}),
      'scheduled',
    ],
    [
      'looping, turn ended 26min ago',
      summary({looping: true, lastTurnEndAt: now - 26 * MIN}),
      'waiting',
    ],
    [
      'looping without a lastTurnEndAt',
      summary({looping: true, wakeupAt: null, lastTurnEndAt: null}),
      'waiting',
    ],
    ['background agent', summary({backgroundAgents: 1}), 'running'],
    [
      'shell launched 59min ago',
      summary({backgroundShells: [now - 59 * MIN]}),
      'scheduled',
    ],
    [
      'shell launched 61min ago',
      summary({backgroundShells: [now - 61 * MIN]}),
      'waiting',
    ],
    ['nothing pending', summary(), 'waiting'],
  ])('Should classify %s', (_name, input, expected) => {
    expect(classifyActivity(input, now)).toBe(expected);
  });
});

describe('classifyActivity near the epoch', () => {
  it('Should not treat a missing lastTurnEndAt as the epoch for a loop', () => {
    expect(
      classifyActivity(
        summary({looping: true, lastTurnEndAt: null, lastEventAt: null}),
        1000,
      ),
    ).toBe('waiting');
  });
});

describe('pullRequestStatus', () => {
  it.each<[string, PullRequest | null, ReturnType<typeof pullRequestStatus>]>([
    ['no PR', null, null],
    ['closed PR', pr({state: 'closed'}), null],
    ['merged PR', pr({state: 'merged'}), 'merged'],
    ['failing checks', pr({checks: 'failing'}), 'failed'],
    ['conflicting', pr({mergeable: 'conflicting'}), 'failed'],
    ['pending checks', pr({checks: 'pending'}), 'ci'],
    ['unknown mergeable', pr({mergeable: 'unknown'}), 'ci'],
    ['draft', pr({draft: true}), 'waiting'],
    ['review required', pr({review: 'required'}), 'waiting'],
    ['changes requested', pr({review: 'changes-requested'}), 'waiting'],
    ['approved and green', pr(), 'ready'],
    ['no checks, no review', pr({checks: 'none', review: 'none'}), 'ready'],
  ])('Should map %s', (_name, input, expected) => {
    expect(pullRequestStatus(input)).toBe(expected);
  });
});

describe('worktreeStatus', () => {
  const open = pr();
  it.each<
    [
      string,
      {
        activities: Activity[];
        pullRequest: PullRequest | null;
      },
      ReturnType<typeof worktreeStatus>,
    ]
  >([
    ['nothing', {activities: [], pullRequest: null}, 'idle'],
    [
      'merged PR alone',
      {activities: [], pullRequest: pr({state: 'merged'})},
      'merged',
    ],
    [
      'merged PR with a waiting session',
      {
        activities: ['waiting'],
        pullRequest: pr({state: 'merged'}),
      },
      'waiting',
    ],
    [
      'scheduled with an open pending PR',
      {
        activities: ['scheduled'],
        pullRequest: pr({checks: 'pending'}),
      },
      'ci',
    ],
    [
      'scheduled without a PR',
      {activities: ['scheduled'], pullRequest: null},
      'engineer',
    ],
    [
      'running with a failing PR',
      {
        activities: ['running'],
        pullRequest: pr({checks: 'failing'}),
      },
      'failed',
    ],
    [
      'running with a ready PR',
      {activities: ['running'], pullRequest: open},
      'ready',
    ],
    ['unknown', {activities: ['unknown'], pullRequest: null}, 'unknown'],
    [
      'waiting and running',
      {activities: ['waiting', 'running'], pullRequest: null},
      'waiting',
    ],
    [
      'unknown and scheduled with an open pending PR',
      {
        activities: ['unknown', 'scheduled'],
        pullRequest: pr({checks: 'pending'}),
      },
      'ci',
    ],
  ])('Should resolve %s', (_name, input, expected) => {
    expect(worktreeStatus({...input, task: null})).toBe(expected);
  });
});

describe('worktreeStatus with an unrecognised activity', () => {
  it('Should add no candidate for it', () => {
    expect(
      worktreeStatus({
        activities: ['' as Activity],
        pullRequest: null,
        task: null,
      }),
    ).toBe('idle');
  });
});

describe('worktreeStatus with a task record', () => {
  const task = (phase: TaskPhase): TaskRecord => ({
    id: 't1',
    repoPath: '/r/talon',
    worktreePath: '/r/talon/.worktrees/feat-x',
    branch: 'feat-x',
    base: 'main',
    model: null,
    promptFile: null,
    prNumber: 1,
    phase,
    ciAttempts: 0,
    fixedSha: null,
    reviewSeenAt: null,
    review: null,
    outbox: null,
    pending: null,
    stop: null,
    createdAt: 1,
  });
  const failing = pr({checks: 'failing'});

  it.each<[TaskPhase, Activity[], PullRequest | null, string]>([
    ['stopped', [], failing, 'waiting'],
    ['stopped', ['running'], null, 'waiting'],
    ['opening', ['waiting'], pr(), 'engineer'],
    ['fixing', [], failing, 'engineer'],
    ['reviewing', [], pr(), 'engineer'],
    ['ci', [], failing, 'failed'],
    ['working', ['waiting'], null, 'waiting'],
  ])(
    'Should resolve phase %s with activities %j',
    (phase, activities, pullRequest, expected) => {
      expect(
        worktreeStatus({
          activities,
          pullRequest,
          task: task(phase),
        }),
      ).toBe(expected);
    },
  );
});

describe('PRECEDENCE', () => {
  it('Should list every status from highest to lowest', () => {
    expect(PRECEDENCE).toEqual([
      'failed',
      'ready',
      'waiting',
      'engineer',
      'ci',
      'unknown',
      'idle',
      'merged',
    ]);
  });
});
