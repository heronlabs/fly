import {
  claudeCommand,
  cleanPrompt,
  normalizePrompt,
  sessionName,
  sessionPrefix,
} from '../../../../src/core/services/session-naming';

describe('session naming', () => {
  it.each([
    ['workloads', 'workloads'],
    ['workloads/sub/leaf', 'workloads-sub-leaf'],
    ['workloads/.worktrees/foo-bar-baz', 'workloads-foo-bar-baz'],
    ['foo.bar/baz.qux', 'foo-bar-baz-qux'],
    ['Workloads/MyProject', 'workloads-myproject'],
    ['project', 'project'],
    ['.hidden/.also-hidden', ''],
    ['Ação Bob/x:y', 'ação-bob-x-y'],
    ['../outside/wt', 'outside-wt'],
    ['/workloads//sub/', 'workloads-sub'],
    ['a::b  c..d', 'a-b-c-d'],
  ])('Should derive prefix of %s as %s', (path, prefix) =>
    expect(sessionPrefix(path)).toBe(prefix),
  );

  it('Should join the prefix and the hex into a session name', () =>
    expect(sessionName('repo-wt', 'abc123')).toBe('repo-wt-abc123'));

  it('Should fall back to fly for an empty prefix', () =>
    expect(sessionName('', 'abc123')).toBe('fly-abc123'));
});

describe('claudeCommand', () => {
  it('Should build the plain claude command', () =>
    expect(claudeCommand({sessionId: 'u1'})).toBe(
      'claude --dangerously-skip-permissions --session-id u1; exit',
    ));

  it('Should read the prompt from a file and pass the model', () =>
    expect(
      claudeCommand({sessionId: 'u', promptFile: true, model: 'opus'}),
    ).toBe(
      'claude --dangerously-skip-permissions --session-id u --model opus -- "$(cat "$FLY_PROMPT_FILE")"; exit',
    ));

  it('Should leave out --model without a model', () => {
    expect(claudeCommand({sessionId: 'u', promptFile: true})).toBe(
      'claude --dangerously-skip-permissions --session-id u -- "$(cat "$FLY_PROMPT_FILE")"; exit',
    );
    expect(claudeCommand({sessionId: 'u', model: null})).toBe(
      'claude --dangerously-skip-permissions --session-id u; exit',
    );
  });
});

describe('normalizePrompt', () => {
  it('Should collapse whitespace and trim', () =>
    expect(normalizePrompt("  fix it's\n  bug ")).toBe("fix it's bug"));

  it('Should turn control characters into spaces', () =>
    expect(normalizePrompt('a\x03b\x1bc\x7fd\u0085e')).toBe('a b c d e'));
});

describe('cleanPrompt', () => {
  it('Should drop control characters except newline and tab', () =>
    expect(cleanPrompt('a\u0007b\n\tc\r\n')).toBe('ab\n\tc\n'));

  it('Should drop DEL and C1 controls and keep quotes and dollars', () =>
    expect(cleanPrompt('a\x7fb\u0085c "$x" `y`')).toBe('abc "$x" `y`'));
});
