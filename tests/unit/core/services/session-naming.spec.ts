import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

import {
  claudeCommand,
  sessionName,
  sessionPrefix,
  shellQuote,
} from '../../../../src/core/services/session-naming';

const execFileP = promisify(execFile);

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
  ])('Should derive prefix of %s as %s', (path, prefix) =>
    expect(sessionPrefix(path)).toBe(prefix),
  );

  it('Should join the prefix and the hex into a session name', () =>
    expect(sessionName('repo-wt', 'abc123')).toBe('repo-wt-abc123'));

  it('Should fall back to fly for an empty prefix', () =>
    expect(sessionName('', 'abc123')).toBe('fly-abc123'));
});

describe('shellQuote', () => {
  it.each([
    "it's",
    '$(touch /tmp/pwned)',
    '`id`',
    'a; rm -rf ~',
    'ação "x" \\ y',
    '\n',
  ])('Should round-trip %j through a real sh unchanged', async value => {
    const {stdout} = await execFileP('sh', [
      '-c',
      `printf %s ${shellQuote(value)}`,
    ]);
    expect(stdout).toBe(value);
  });
});

describe('claudeCommand', () => {
  it('Should build the plain claude command', () =>
    expect(claudeCommand({sessionId: 'u1'})).toBe(
      'claude --dangerously-skip-permissions --session-id u1; exit',
    ));

  it('Should collapse prompt whitespace and quote it', () =>
    expect(
      claudeCommand({sessionId: 'u1', prompt: "/supera:ship fix it's\n  bug"}),
    ).toBe(
      "claude --dangerously-skip-permissions --session-id u1 '/supera:ship fix it'\\''s bug'; exit",
    ));

  it('Should turn control characters into spaces', () =>
    expect(
      claudeCommand({
        sessionId: 'u1',
        prompt: 'a\x03b\x1bc\x7fd\u0085e',
      }),
    ).toBe(
      "claude --dangerously-skip-permissions --session-id u1 'a b c d e'; exit",
    ));
});
