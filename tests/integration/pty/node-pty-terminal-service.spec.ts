import {NodePtyTerminalService} from '../../../src/infrastructure/pty/node-pty-terminal-service';

const size = {cols: 80, rows: 24};

type Run = {output: () => string; exited: Promise<number>; kill: () => void};

const run = (script: string): Run => {
  const terminal = new NodePtyTerminalService().spawn(
    'sh',
    ['-c', script],
    size,
  );
  let out = '';
  terminal.onData(d => {
    out += d;
  });
  const exited = new Promise<number>(resolve => terminal.onExit(resolve));
  return {output: () => out, exited, kill: () => terminal.kill()};
};

describe('NodePtyTerminalService', () => {
  const originalEnv = {...process.env};

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('Should collect output and report the exit code', async () => {
    const r = run('printf hello');

    expect(await r.exited).toBe(0);
    expect(r.output()).toContain('hello');
  });

  it('Should report a non-zero exit code', async () => {
    expect(await run('exit 3').exited).toBe(3);
  });

  it('Should override an inherited TERM and set COLORTERM', async () => {
    process.env.TERM = 'dumb';
    const r = run('printf "%s|%s" "$TERM" "$COLORTERM"');

    await r.exited;

    expect(r.output()).toContain('xterm-256color|truecolor');
  });

  it('Should keep LANG when set', async () => {
    process.env.LANG = 'pt_BR.UTF-8';
    const r = run('printf "[%s]" "$LANG"');

    await r.exited;

    expect(r.output()).toContain('[pt_BR.UTF-8]');
  });

  it('Should fall back to en_US.UTF-8 when LANG is unset', async () => {
    delete process.env.LANG;
    const r = run('printf "[%s]" "$LANG"');

    await r.exited;

    expect(r.output()).toContain('[en_US.UTF-8]');
  });

  it('Should skip undefined env values', async () => {
    process.env.FLY_PTY_KEPT = 'yes';
    // Node coerces assigned values to strings, so undefined only exists on a replaced env.
    const spy = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...originalEnv,
      FLY_PTY_KEPT: 'yes',
      FLY_PTY_UNDEF: undefined,
    } as NodeJS.ProcessEnv);
    const r = run('printf "[%s|%s]" "$FLY_PTY_KEPT" "${FLY_PTY_UNDEF-unset}"');
    spy.mockRestore();

    await r.exited;

    expect(r.output()).toContain('[yes|unset]');
  });

  it('Should drop TMUX and TMUX_PANE from the environment', async () => {
    process.env.TMUX = '/tmp/tmux-1/default,1,0';
    process.env.TMUX_PANE = '%1';
    const r = run('printf "[%s|%s]" "${TMUX-unset}" "${TMUX_PANE-unset}"');

    await r.exited;

    expect(r.output()).toContain('[unset|unset]');
  });

  it('Should write input and resize the pty', async () => {
    const terminal = new NodePtyTerminalService().spawn(
      'sh',
      ['-c', 'read line; stty size; printf "got:%s" "$line"'],
      size,
    );
    let out = '';
    terminal.onData(d => {
      out += d;
    });
    const exited = new Promise<number>(resolve => terminal.onExit(resolve));

    terminal.resize({cols: 100, rows: 30});
    terminal.write('ping\n');
    await exited;

    expect(out).toContain('30 100');
    expect(out).toContain('got:ping');
  });

  it('Should end a long-running process on kill', async () => {
    const r = run('sleep 30');

    r.kill();

    expect(await r.exited).toBeDefined();
  });
});
