import {
  claudeCommand,
  normalizePrompt,
  PROMPT_ENV,
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

  it('Should read the prompt from the pane environment, never inline it', () => {
    expect(PROMPT_ENV).toBe('FLY_PROMPT');
    expect(claudeCommand({sessionId: 'u1', withPrompt: true})).toBe(
      'claude --dangerously-skip-permissions --session-id u1 "$FLY_PROMPT"; exit',
    );
  });
});

describe('normalizePrompt', () => {
  it('Should collapse whitespace and trim', () =>
    expect(normalizePrompt("  /supera:ship fix it's\n  bug ")).toBe(
      "/supera:ship fix it's bug",
    ));

  it('Should turn control characters into spaces', () =>
    expect(normalizePrompt('a\x03b\x1bc\x7fd\u0085e')).toBe('a b c d e'));
});
