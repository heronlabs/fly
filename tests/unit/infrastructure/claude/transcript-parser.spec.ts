import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import type {TranscriptSummary} from '../../../../src/core/domain/transcript';
import {
  parseTaskNotification,
  TranscriptParser,
} from '../../../../src/infrastructure/claude/transcript-parser';

const FIXTURES = join(__dirname, '../../../fixtures/transcripts');

const EMPTY: TranscriptSummary = {
  phase: 'none',
  asking: false,
  openTools: 0,
  lastEventAt: null,
  wakeupAt: null,
  looping: false,
  lastTurnEndAt: null,
  backgroundAgents: 0,
  backgroundShells: [],
  launchCwd: null,
  worktreePath: null,
  receipt: null,
};

const fixture = (id: string): string[] =>
  readFileSync(join(FIXTURES, `${id}.jsonl`), 'utf8').split('\n');

const line = (record: unknown): string => JSON.stringify(record);

const parserWith = (...ids: string[]): TranscriptParser => {
  const parser = new TranscriptParser();
  for (const id of ids) {
    for (const text of fixture(id)) parser.push(text);
  }
  return parser;
};

const parse = (...ids: string[]): TranscriptSummary =>
  parserWith(...ids).summary();

const pushAll = (parser: TranscriptParser, ...lines: string[]) => {
  for (const text of lines) parser.push(text);
  return parser.summary();
};

const toolUse = (id: string, name: string) =>
  line({
    type: 'assistant',
    message: {content: [{type: 'tool_use', id, name, input: {}}]},
  });

const toolResult = (
  id: string,
  toolUseResult: unknown,
  extra: Record<string, unknown> = {},
) =>
  line({
    type: 'user',
    ...extra,
    message: {content: [{type: 'tool_result', tool_use_id: id, content: ''}]},
    toolUseResult,
  });

const prompt = (content: unknown, extra: Record<string, unknown> = {}) =>
  line({type: 'user', ...extra, message: {role: 'user', content}});

const at = (iso: string) => Date.parse(iso);

describe('TranscriptParser', () => {
  it('Should read a finished turn with nothing pending (T1)', () => {
    expect(parse('t1')).toEqual({
      ...EMPTY,
      phase: 'turn-ended',
      lastEventAt: at('2026-10-20T10:00:04.200Z'),
      lastTurnEndAt: at('2026-10-20T10:00:04.200Z'),
      launchCwd: '/Users/u/w/repo',
    });
  });

  it('Should move lastEventAt only on lines that map to an event', () => {
    const parser = new TranscriptParser();
    const [assistant, stopHook] = fixture('t1');

    expect(pushAll(parser, assistant!, stopHook!).lastEventAt).toBe(
      at('2026-10-20T10:00:04.000Z'),
    );
  });

  it('Should keep lastEventAt when a mapped line has no usable timestamp', () => {
    const parser = parserWith('t1');

    const summary = pushAll(
      parser,
      prompt('hi', {timestamp: 'garbage'}),
      prompt('hi', {timestamp: 5}),
    );

    expect(summary.phase).toBe('mid-turn');
    expect(summary.lastEventAt).toBe(at('2026-10-20T10:00:04.200Z'));
  });

  it('Should ask while an AskUserQuestion is open and stop once answered (T2, T2b)', () => {
    expect(parse('t2')).toMatchObject({
      phase: 'mid-turn',
      asking: true,
      openTools: 1,
    });
    expect(parse('t2', 't2b')).toMatchObject({
      phase: 'mid-turn',
      asking: false,
      openTools: 0,
    });
  });

  it('Should close a declined question whose toolUseResult is a string', () => {
    const parser = parserWith('t2');

    const summary = pushAll(
      parser,
      toolResult('toolu_ask1', 'Error: x', {timestamp: '2026-10-20T11:00:00Z'}),
    );

    expect(summary).toMatchObject({
      phase: 'mid-turn',
      asking: false,
      openTools: 0,
      lastEventAt: at('2026-10-20T11:00:00Z'),
    });
  });

  it('Should keep a long Bash open and clear it on interrupt (T3, T10)', () => {
    expect(parse('t3')).toMatchObject({
      phase: 'mid-turn',
      openTools: 1,
      asking: false,
    });
    expect(parse('t3', 't10')).toMatchObject({
      phase: 'turn-ended',
      openTools: 0,
    });
  });

  it('Should treat the tool-use interrupt variant as an interrupt', () => {
    const summary = pushAll(
      parserWith('t3'),
      prompt([
        {type: 'text', text: '[Request interrupted by user for tool use]'},
      ]),
    );

    expect(summary).toMatchObject({phase: 'turn-ended', openTools: 0});
  });

  it('Should hold a scheduled wakeup after the turn ends (T4)', () => {
    expect(parse('t4')).toMatchObject({
      phase: 'turn-ended',
      wakeupAt: 1792491605000,
      looping: true,
      openTools: 0,
      lastEventAt: at('2026-10-20T10:00:05.300Z'),
      lastTurnEndAt: at('2026-10-20T10:00:05.300Z'),
    });
  });

  it('Should consume the wakeup when it fires (T4, T5)', () => {
    expect(parse('t4', 't5')).toMatchObject({
      phase: 'mid-turn',
      wakeupAt: null,
      looping: true,
      lastEventAt: at('2026-10-20T10:20:05.400Z'),
    });
  });

  it('Should end the fired turn and keep looping (T4, T5, T6)', () => {
    expect(parse('t4', 't5', 't6')).toMatchObject({
      phase: 'turn-ended',
      wakeupAt: null,
      looping: true,
      lastTurnEndAt: at('2026-10-20T10:20:30.000Z'),
    });
  });

  it('Should keep lastTurnEndAt when a turn_duration has no timestamp', () => {
    expect(parse('t6', 't8')).toMatchObject({
      phase: 'turn-ended',
      lastTurnEndAt: at('2026-10-20T10:20:30.000Z'),
    });
  });

  it('Should stop the loop and drop the wakeup (T7)', () => {
    expect(parse('t7')).toMatchObject({
      phase: 'turn-ended',
      looping: false,
      wakeupAt: null,
    });
    expect(parse('t4', 't7')).toMatchObject({looping: false, wakeupAt: null});
  });

  it('Should read wakeup fields only from a ScheduleWakeup result with a numeric scheduledFor', () => {
    const summary = pushAll(
      new TranscriptParser(),
      toolUse('toolu_b', 'Bash'),
      toolResult('toolu_b', {scheduledFor: 1792491605000}),
      toolUse('toolu_w', 'ScheduleWakeup'),
      toolResult('toolu_w', {scheduledFor: 'soon'}),
      toolResult('toolu_gone', {scheduledFor: 1792491605000}),
    );

    expect(summary).toMatchObject({wakeupAt: null, looping: false});
  });

  it('Should count background agents from the latest turn_duration (T8)', () => {
    const parser = parserWith('t8');
    expect(parser.summary().backgroundAgents).toBe(1);

    expect(
      pushAll(parser, '{"type":"system","subtype":"agents_killed"}')
        .backgroundAgents,
    ).toBe(0);
    expect(parse('t8', 't1').backgroundAgents).toBe(0);
  });

  it('Should register a background shell and drop it on its notification (T9, T9b)', () => {
    expect(parse('t9')).toMatchObject({
      phase: 'turn-ended',
      backgroundShells: [0],
    });
    expect(parse('t9', 't9b')).toMatchObject({
      phase: 'mid-turn',
      backgroundShells: [],
    });
  });

  it('Should date a shell by its line, else the last event, else 0', () => {
    expect(parse('t1', 't9').backgroundShells).toEqual([
      at('2026-10-20T10:00:04.200Z'),
    ]);

    const summary = pushAll(
      new TranscriptParser(),
      toolResult(
        'toolu_bg2',
        {backgroundTaskId: 'bx2'},
        {timestamp: '2026-10-20T12:00:00.000Z'},
      ),
    );
    expect(summary.backgroundShells).toEqual([at('2026-10-20T12:00:00.000Z')]);
  });

  it('Should count a taskId only for an open Monitor', () => {
    const summary = pushAll(
      new TranscriptParser(),
      toolUse('toolu_m1', 'Monitor'),
      toolResult('toolu_m1', {taskId: 'm1'}),
      toolUse('toolu_m2', 'Monitor'),
      toolResult('toolu_m2', {taskId: 7}),
      toolUse('toolu_a1', 'Agent'),
      toolResult('toolu_a1', {taskId: 'a1'}),
      toolResult('toolu_none', {taskId: 'n1'}),
    );

    expect(summary.backgroundShells).toHaveLength(1);
  });

  it('Should drop shells only on a notification with a status that matches an id', () => {
    const parser = new TranscriptParser();
    pushAll(
      parser,
      toolUse('toolu_m1', 'Monitor'),
      toolResult('toolu_m1', {taskId: 'm1'}),
      toolResult('toolu_bg1', {backgroundTaskId: 'bx1'}),
      toolResult('toolu_bg2', {backgroundTaskId: 'bx2'}),
    );

    const event = pushAll(
      parser,
      prompt(
        '<task-notification>\n<task-id>m1</task-id>\n<event>tick</event>\n</task-notification>',
      ),
    );
    expect(event.backgroundShells).toHaveLength(3);

    const unrelated = pushAll(
      parser,
      prompt(
        '<task-notification>\n<tool-use-id>toolu_x</tool-use-id>\n<status>completed</status>\n</task-notification>',
      ),
    );
    expect(unrelated.backgroundShells).toHaveLength(3);

    const byTaskId = pushAll(
      parser,
      prompt(
        '<task-notification>\n<task-id>m1</task-id>\n<status>completed</status>\n</task-notification>',
      ),
    );
    expect(byTaskId.backgroundShells).toHaveLength(2);

    const byToolUseId = pushAll(
      parser,
      prompt(
        '<task-notification>\n<task-id>other</task-id>\n<tool-use-id>toolu_bg1</tool-use-id>\n<status>killed</status>\n</task-notification>',
      ),
    );
    expect(byToolUseId.backgroundShells).toHaveLength(1);
  });

  it('Should end an API error turn (T11)', () => {
    expect(parse('t11').phase).toBe('turn-ended');
  });

  it('Should end on a local command and resume on a skill command (T12, T12b)', () => {
    expect(parse('t12').phase).toBe('turn-ended');
    expect(parse('t12', 't12b').phase).toBe('mid-turn');
  });

  it('Should stay mid-turn when a Stop hook continues the turn (T13)', () => {
    expect(parse('t13').phase).toBe('mid-turn');
  });

  it('Should ignore meta, compact summary and transcript-only user lines', () => {
    const summary = pushAll(
      new TranscriptParser(),
      prompt('caveat', {isMeta: true, timestamp: '2026-10-20T10:00:00Z'}),
      prompt('summary', {isCompactSummary: true}),
      prompt([{type: 'text', text: 'x'}], {isVisibleInTranscriptOnly: true}),
    );

    expect(summary).toEqual(EMPTY);
  });

  it('Should read any other user array content as a prompt', () => {
    expect(
      pushAll(new TranscriptParser(), prompt([{type: 'image'}])).phase,
    ).toBe('mid-turn');
    expect(
      pushAll(
        new TranscriptParser(),
        prompt([
          'x',
          {type: 'text', text: 5},
          {type: 'text', text: 'please continue'},
          {type: 'tool_result', tool_use_id: 9},
        ]),
      ).phase,
    ).toBe('mid-turn');
  });

  it('Should open only well-formed tool_use blocks', () => {
    const summary = pushAll(
      new TranscriptParser(),
      line({
        type: 'assistant',
        message: {
          content: [
            'x',
            {type: 'text', text: 'hi'},
            {type: 'tool_use', id: 5, name: 'Bash'},
            {type: 'tool_use', id: 'toolu_n', name: 5},
            {type: 'tool_use', id: 'toolu_ok', name: 'Bash'},
          ],
        },
      }),
    );

    expect(summary).toMatchObject({phase: 'mid-turn', openTools: 1});
  });

  it('Should close every tool_result on one line', () => {
    const summary = pushAll(
      new TranscriptParser(),
      toolUse('toolu_1', 'Read'),
      toolUse('toolu_2', 'AskUserQuestion'),
      line({
        type: 'user',
        message: {
          content: [
            {type: 'tool_result', tool_use_id: 'toolu_1', content: ''},
            {type: 'tool_result', tool_use_id: 'toolu_2', content: ''},
          ],
        },
      }),
    );

    expect(summary).toMatchObject({openTools: 0, asking: false});
  });

  it('Should bind the worktree from the first .worktrees cwd and never move it (W1)', () => {
    const parser = parserWith('w1');
    expect(parser.summary()).toMatchObject({
      launchCwd: '/Users/u/w/repo',
      worktreePath: '/Users/u/w/repo/.worktrees/feat-add-retry',
    });

    expect(
      pushAll(parser, prompt('x', {cwd: '/Users/u/w/repo/.worktrees/other'})),
    ).toMatchObject({
      launchCwd: '/Users/u/w/repo',
      worktreePath: '/Users/u/w/repo/.worktrees/feat-add-retry',
    });
  });

  it('Should bind only the first segment under .worktrees and skip an empty one', () => {
    const summary = pushAll(
      new TranscriptParser(),
      '{"type":"mode","cwd":"/r"}',
      '{"type":"mode","cwd":"/r/.worktrees/"}',
      '{"type":"mode","cwd":"/r/src"}',
      '{"type":"mode","cwd":"/r/.worktrees/feat-x/sub"}',
    );

    expect(summary).toMatchObject({
      phase: 'none',
      launchCwd: '/r',
      worktreePath: '/r/.worktrees/feat-x',
    });
  });

  it('Should take launchCwd from the first line carrying a string cwd', () => {
    const parser = new TranscriptParser();
    expect(
      pushAll(parser, '{"type":"mode"}', '{"type":"mode","cwd":5}'),
    ).toEqual(EMPTY);

    expect(pushAll(parser, ...fixture('t1')).launchCwd).toBe('/Users/u/w/repo');
  });

  it('Should count JSON failures as skipped and leave the state unchanged', () => {
    const parser = new TranscriptParser();

    expect(pushAll(parser, 'not json', '{"type":')).toEqual(EMPTY);
    expect(parser.skipped).toBe(2);
  });

  it('Should ignore blank and non-object lines without counting them', () => {
    const parser = new TranscriptParser();

    expect(pushAll(parser, '', '   ', '[1,2]', '42', 'null', '"s"')).toEqual(
      EMPTY,
    );
    expect(parser.skipped).toBe(0);
  });

  it('Should ignore unknown types and unmapped system subtypes', () => {
    const summary = pushAll(
      new TranscriptParser(),
      '{"type":"future-thing","timestamp":"2026-10-20T10:00:00Z"}',
      '{"type":"api-request-blob","uuid":"b1","timestamp":"2026-10-20T10:00:00Z"}',
      '{"type":"system","subtype":"compact_boundary","timestamp":"2026-10-20T10:00:00Z"}',
    );

    expect(summary).toEqual(EMPTY);
  });

  it('Should leave the state unchanged on a wrong-typed message or content', () => {
    const parser = new TranscriptParser();

    expect(() =>
      pushAll(
        parser,
        '{"type":"user","message":"x"}',
        '{"type":"user","message":{"content":5}}',
        '{"type":"assistant","message":"x"}',
        '{"type":"assistant","message":{"content":"x"}}',
      ),
    ).not.toThrow();
    expect(parser.summary()).toEqual(EMPTY);
  });

  it('Should return a fresh summary each time', () => {
    const parser = parserWith('t9');
    const first = parser.summary();
    first.backgroundShells.push(99);

    expect(parser.summary().backgroundShells).toEqual([0]);
  });
});

describe('parseTaskNotification', () => {
  it('Should read the tags of a background shell notification (T9b)', () => {
    const [text] = fixture('t9b');
    const content = (JSON.parse(text!) as {message: {content: string}}).message
      .content;

    expect(parseTaskNotification(content)).toEqual({
      taskId: 'bx1',
      toolUseId: 'toolu_bg1',
      status: 'completed',
      result: null,
    });
  });

  it('Should return null ids and status for a Monitor event', () => {
    expect(
      parseTaskNotification(
        '<task-notification>\n<task-id>m1</task-id>\n<event>line</event>\n</task-notification>',
      ),
    ).toEqual({taskId: 'm1', toolUseId: null, status: null, result: null});
  });

  it('Should keep the result inner text raw', () => {
    expect(
      parseTaskNotification(
        '<task-notification>\n<status>completed</status>\n<result>a &amp; b\n```json\n{"x":1}\n```\n</result>\n</task-notification>',
      )?.result,
    ).toBe('a &amp; b\n```json\n{"x":1}\n```\n');
  });

  it('Should return null for text that is not a task notification', () => {
    expect(parseTaskNotification('hello')).toBeNull();
  });
});
