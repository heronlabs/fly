import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {QueueStatus, ReviewComment} from '../../../../src/core/domain/queue';
import {
  EXCERPT_MAX_CHARS,
  TaskPhase,
  TaskRecord,
} from '../../../../src/core/domain/task';
import {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {MultiplexerSession} from '../../../../src/core/interfaces/session-launcher';
import {
  fixInstruction,
  isConventionalTitle,
  isSessionIdle,
  logExcerpt,
  newestFlySession,
  openInstruction,
  parsePrText,
  prRequest,
  reviewFile,
  reviewInstruction,
  taskStatus,
} from '../../../../src/core/services/task-rules';

const FIXTURES = join(__dirname, '../../../fixtures/gh');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

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

  it('Should keep the attachments block, and its local paths, out of the quote', () => {
    const text = prRequest({
      template: TEMPLATE,
      prompt: 'line1\nline2\n\nArquivos anexados:\n- /data/tasks/t1/a.png',
      outFile: '/d/tasks/t1/pr.json',
    });
    expect(text).toContain('> line1\n> line2\n\nDo not push');
    expect(text).not.toContain('/data/tasks');
    expect(text).not.toContain('Arquivos anexados');
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

describe('isSessionIdle', () => {
  const summary = (over: Partial<TranscriptSummary> = {}) =>
    ({
      phase: 'turn-ended',
      asking: false,
      backgroundAgents: 0,
      ...over,
    }) as TranscriptSummary;
  const session = (
    createdAt: number,
    options: Record<string, string> = {},
  ): MultiplexerSession => ({
    name: 's',
    cwd: '/r',
    createdAt,
    attachedClients: 0,
    options,
  });

  it.each<[string, Partial<TranscriptSummary>, boolean]>([
    ['a turn that ended', {}, true],
    ['a turn in progress', {phase: 'mid-turn'}, false],
    ['a question open', {asking: true}, false],
    ['a background agent', {backgroundAgents: 1}, false],
  ])('Should read %s from the transcript', (_name, over, expected) => {
    expect(isSessionIdle(summary(over), session(1), 1_000_000)).toBe(expected);
  });

  it('Should not look at start-up for a session with a turn', () => {
    expect(
      isSessionIdle(summary({phase: 'mid-turn'}), session(100), 100_000),
    ).toBe(false);
  });

  it.each([
    ['no transcript', null],
    ['no turn yet', summary({phase: 'none'})],
  ])('Should take %s as idle at 5 s old, not before', (_name, value) => {
    expect(isSessionIdle(value, session(100), 104_999)).toBe(false);
    expect(isSessionIdle(value, session(100), 105_000)).toBe(true);
  });

  it.each(['@fly_task', '@fly_task_repo'])(
    'Should not take a %s session without a transcript as idle',
    key => {
      expect(isSessionIdle(null, session(100, {[key]: 'x'}), 200_000)).toBe(
        false,
      );
    },
  );
});

describe('logExcerpt', () => {
  // A gh --log-failed line: job, step, then the stamped text.
  const line = (text: string, step = 'Run pnpm test:unit') =>
    `test\t${step}\t2026-10-20T12:01:00.0000000Z ${text}`;
  const log = (texts: string[]) => texts.map(t => line(t)).join('\n') + '\n';
  const numbered = (from: number, to: number) =>
    Array.from({length: to - from + 1}, (_, i) => `l${from + i}`);

  it('Should keep only the text of a failed step, clean of stamps, BOM and colour codes', () => {
    const excerpt = logExcerpt(fixture('log-failed-steps.txt'));
    const lines = excerpt.split('\n');

    expect(lines).toHaveLength(34);
    expect(lines[0]).toBe('##[group]Run pnpm test:unit');
    expect(lines[1]).toBe('pnpm test:unit');
    expect(lines[6]).toBe('');
    expect(lines).toContain('Expected:\t1\tReceived:\t0');
    expect(lines.at(-1)).toBe('##[error]Process completed with exit code 1.');
    expect(excerpt).not.toMatch(
      /2026-10-20T|\uFEFF|\^\[\[|Run pnpm test:unit\t/,
    );
  });

  it('Should keep the 60 lines before the error of a whole job log', () => {
    const excerpt = logExcerpt(fixture('log-failed-unknown-step.txt'));
    const lines = excerpt.split('\n');

    expect(lines).toHaveLength(61);
    expect(lines[0]).toMatch(/^line 640: Mutant 640 /);
    expect(lines.at(-2)).toMatch(/^line 699: /);
    expect(lines.at(-1)).toBe('##[error]Process completed with exit code 1.');
    expect(excerpt).not.toContain('line 639:');
    expect(excerpt).not.toContain('line 701:');
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX_CHARS);
  });

  it('Should keep the last 200 lines without any error', () => {
    expect(logExcerpt(log(numbered(1, 300)))).toBe(
      numbered(101, 300).join('\n'),
    );
  });

  it('Should merge the windows of two errors 10 lines apart', () => {
    const texts = numbered(1, 100);
    texts[69] = '##[error]a';
    texts[79] = '##[error]b';
    expect(logExcerpt(log(texts))).toBe(texts.slice(9, 80).join('\n'));
  });

  it.each<[string, number, string]>([
    ['adjacent windows into one', 61, 'l1'],
    ['windows a line apart with a mark', 62, '…'],
  ])('Should join %s', (_name, gap, between) => {
    const texts = numbered(1, 200);
    texts[69] = '##[error]a';
    texts[69 + gap] = '##[error]b';
    const lines = logExcerpt(log(texts)).split('\n');
    expect(lines).toHaveLength(gap === 61 ? 122 : 123);
    expect(lines[61]).toBe(gap === 61 ? texts[70] : between);
  });

  it('Should keep the tail 20 000 characters of a longer window', () => {
    const texts = [
      ...Array.from({length: 60}, (_, i) => `${i}`.padEnd(840, 'x')),
      '##[error]y',
    ];
    const whole = texts.join('\n');
    expect(whole.length).toBeGreaterThan(50_000);

    const excerpt = logExcerpt(log(texts));

    expect(excerpt).toHaveLength(EXCERPT_MAX_CHARS);
    expect(excerpt).toBe(whole.slice(-EXCERPT_MAX_CHARS));
  });

  it.each([
    ['a stamp with no text', 'test\tstep\t2026-10-20T12:01:00.0000000Z', ''],
    ['an empty text', 'test\tstep\t2026-10-20T12:01:00.0000000Z ', ''],
    ['a tab-less line, kept whole', 'plain line', 'plain line'],
    ['a line with one tab, kept whole', 'one\ttab', 'one\ttab'],
    ['real colour codes', line('\u001b[31mred\u001b[0m text'), 'red text'],
    [
      'text after the first space',
      line(' indented  twice'),
      ' indented  twice',
    ],
  ])('Should read %s', (_name, raw, text) => {
    expect(logExcerpt(`${raw}\n${line('##[error]x')}`)).toBe(
      `${text}\n##[error]x`,
    );
  });

  it('Should take an error marker only at the start of the text', () => {
    expect(logExcerpt(log([...numbered(1, 70), 'see ##[error]']))).toBe(
      [...numbered(1, 70), 'see ##[error]'].join('\n'),
    );
    expect(logExcerpt(log([...numbered(1, 70), '##[error]x', 'after']))).toBe(
      [...numbered(11, 70), '##[error]x'].join('\n'),
    );
  });
});

describe('fixInstruction', () => {
  it('Should name the attempt and the log files in the Fix instruction', () => {
    expect(
      fixInstruction(42, 2, ['/d/ci-1-abc1234.log', '/d/ci-2-abc1234.log']),
    ).toBe(
      'fly: a CI do PR #42 falhou (tentativa 2 de 3). Logs: /d/ci-1-abc1234.log, /d/ci-2-abc1234.log. Corrija, rode as verificações locais e commite (Conventional Commits, sem push).',
    );
  });
});

describe('reviewInstruction', () => {
  it('Should name the comments file in the Review instruction', () => {
    expect(reviewInstruction(42, '/d/review-42-7.md')).toBe(
      'fly: há comentários de review novos no PR #42 em /d/review-42-7.md. Avalie cada um, corrija o que fizer sentido e commite (Conventional Commits, sem push).',
    );
  });
});

describe('reviewFile', () => {
  const comment = (over: Partial<ReviewComment>): ReviewComment => ({
    id: '1',
    author: 'ana',
    body: 'Renomeie.',
    path: null,
    line: null,
    url: 'https://github.com/o/r/pull/42#c1',
    createdAt: 1,
    ...over,
  });

  it('Should write one block per comment with where it was left', () => {
    expect(
      reviewFile([
        comment({path: 'src/a.ts', line: 3}),
        comment({author: 'bia', path: 'src/b.ts', body: 'Arquivo todo.\nSim.'}),
        comment({author: 'caio', url: 'u3'}),
      ]),
    ).toBe(
      [
        '### ana — src/a.ts:3',
        '',
        'Renomeie.',
        '',
        'https://github.com/o/r/pull/42#c1',
        '',
        '### bia — src/b.ts',
        '',
        'Arquivo todo.',
        'Sim.',
        '',
        'https://github.com/o/r/pull/42#c1',
        '',
        '### caio — PR',
        '',
        'Renomeie.',
        '',
        'u3',
        '',
      ].join('\n'),
    );
  });
});
