import {QueueStatus} from '../../../../src/core/domain/queue';
import {TaskPhase, TaskRecord} from '../../../../src/core/domain/task';
import {MultiplexerSession} from '../../../../src/core/interfaces/session-launcher';
import {
  isConventionalTitle,
  newestFlySession,
  openInstruction,
  parsePrText,
  prRequest,
  taskStatus,
} from '../../../../src/core/services/task-rules';

const TEMPLATE = '## Description\n\n<!--\n  hint\n-->\n\n## Motivation\n';

const record = (phase: TaskPhase): TaskRecord => ({
  id: 't1',
  repoPath: '/r/talon',
  worktreePath: '/r/talon/.worktrees/feat-x',
  branch: 'feat-x',
  base: 'main',
  model: null,
  promptFile: null,
  prNumber: null,
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

describe('isConventionalTitle', () => {
  it.each([
    ['feat: add x', true],
    ['fix(ui)!: y', true],
    ['Feat: x', false],
    ['feat:x', false],
    ['update stuff', false],
    [`feat: ${'a'.repeat(66)}`, true],
    [`feat: ${'a'.repeat(67)}`, false],
    // 72 code points, 73 UTF-16 units.
    [`feat: ${'a'.repeat(65)}🚀`, true],
  ])('Should judge %j as %s', (title, expected) => {
    expect(isConventionalTitle(title)).toBe(expected);
  });
});

describe('prRequest', () => {
  const rules = [
    '- Title: Conventional Commits ("type(scope): summary", where type is one of build, chore, ci, docs, feat, fix, perf, refactor, revert, style or test), at most 72 characters, describing the whole branch.',
    "- Body: fill the template below section by section, in English, deleting each section's comment hints, and leaving a section empty only when it does not apply.",
  ];
  const head =
    'Write the pull request for this branch as JSON to /d/tasks/t1/pr.json: {"title": string, "body": string}.';
  const tail = [
    'Do not push and do not open the pull request: fly does both after this turn.',
    '',
    'Template:',
    '',
    TEMPLATE,
  ];

  it('Should quote the original task under Motivation', () => {
    expect(
      prRequest({
        template: TEMPLATE,
        prompt: 'line1\nline2',
        outFile: '/d/tasks/t1/pr.json',
      }),
    ).toBe(
      [
        head,
        '',
        ...rules,
        '- Motivation: quote the original task under Motivation:',
        '',
        '> line1',
        '> line2',
        '',
        ...tail,
      ].join('\n'),
    );
  });

  it('Should ask for Motivation from the conversation without a prompt', () => {
    const text = prRequest({
      template: TEMPLATE,
      prompt: null,
      outFile: '/d/tasks/t1/pr.json',
    });
    expect(text).toBe(
      [
        head,
        '',
        ...rules,
        '- Motivation: write Motivation from this conversation.',
        '',
        ...tail,
      ].join('\n'),
    );
    expect(text).toContain('write Motivation from this conversation');
  });
});

describe('openInstruction', () => {
  it('Should name the request file in the Open instruction', () => {
    expect(openInstruction('/d/tasks/t1/pr-request.md')).toBe(
      'fly: commite o que estiver pendente (Conventional Commits, sem push) e siga as instruções em /d/tasks/t1/pr-request.md',
    );
  });
});

describe('parsePrText', () => {
  it.each([
    ['missing', null],
    ['not JSON', 'nope'],
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a string', '"feat: x"'],
    ['a numeric title', '{"title": 1, "body": "b"}'],
    ['no body', '{"title": "feat: x"}'],
    ['a numeric body', '{"title": "feat: x", "body": 2}'],
  ])('Should read %s as no PR text', (_name, raw) => {
    expect(parsePrText(raw)).toBeNull();
  });

  it('Should keep only the title and the body', () => {
    expect(
      parsePrText('{"title": "feat: x", "body": "", "draft": true}'),
    ).toEqual({title: 'feat: x', body: ''});
  });
});

describe('taskStatus', () => {
  it.each<[TaskPhase | null, QueueStatus | null]>([
    ['opening', 'engineer'],
    ['fixing', 'engineer'],
    ['reviewing', 'engineer'],
    ['stopped', 'waiting'],
    ['working', null],
    ['ci', null],
    [null, null],
  ])('Should map phase %s to %s', (phase, expected) => {
    expect(taskStatus(phase === null ? null : record(phase))).toBe(expected);
  });
});

describe('newestFlySession', () => {
  const item = (
    name: string,
    createdAt: number,
    sessionId?: string,
  ): {session: MultiplexerSession} => ({
    session: {
      name,
      cwd: '/r',
      createdAt,
      attachedClients: 0,
      options: sessionId === undefined ? {} : {'@fly_session_id': sessionId},
    },
  });

  it('Should be null without a fly session', () => {
    expect(newestFlySession([item('ext', 5)])).toBeNull();
    expect(newestFlySession([])).toBeNull();
  });

  it('Should pick the newest fly session, skipping newer external ones', () => {
    const items = [
      item('old', 1, 's1'),
      item('ext', 9),
      item('new', 3, 's2'),
      item('mid', 2, 's3'),
    ];
    expect(newestFlySession(items)?.session.name).toBe('new');
  });

  it('Should keep the first of two started in the same second', () => {
    const items = [item('a', 3, 's1'), item('b', 3, 's2')];
    expect(newestFlySession(items)?.session.name).toBe('a');
  });
});
