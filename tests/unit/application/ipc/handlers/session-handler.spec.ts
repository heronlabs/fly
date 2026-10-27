import {Logger} from '@nestjs/common';

import {
  SESSION_POLL_MS,
  SessionHandler,
} from '../../../../../src/application/ipc/handlers/session-handler';
import type {
  Broadcaster,
  FilePicker,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {SessionsSnapshot} from '../../../../../src/core/domain/session';
import {SessionService} from '../../../../../src/core/services/session-service';
import {TaskService} from '../../../../../src/core/services/task-service';

const snap = (n: number): SessionsSnapshot => ({
  tmux: 'ok',
  message: null,
  sessions: [
    {
      name: `s-${n}`,
      worktreeId: 'w',
      createdAt: n,
      attachedClients: 0,
      origin: 'fly',
      task: null,
    },
  ],
});

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const snapshot = vi.fn();
const start = vi.fn();
const kill = vi.fn();
const create = vi.fn();
const bind = vi.fn();
const pick = vi.fn();

const invoke = (channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({}, ...args);

let handler: SessionHandler;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  bind.mockResolvedValue(undefined);
  snapshot.mockResolvedValue(snap(1));
  handler = new SessionHandler(
    host,
    {send} as Broadcaster,
    {snapshot, start, kill} as unknown as SessionService,
    {bind, create} as unknown as TaskService,
    {pick} as FilePicker,
  );
  handler.register();
});

afterEach(() => {
  handler.stop();
  vi.useRealTimers();
  logged.mockRestore();
});

describe('SessionHandler', () => {
  it('Should register the five invoke channels', () => {
    expect([...listeners.keys()].sort()).toEqual(
      [
        channels.sessionList,
        channels.sessionStart,
        channels.sessionKill,
        channels.taskCreate,
        channels.taskPickAttachments,
      ].sort(),
    );
  });

  it('Should return the picked attachment paths without ticking', async () => {
    pick.mockResolvedValue(['/a.md', '/b.png']);

    expect(await invoke(channels.taskPickAttachments)).toEqual([
      '/a.md',
      '/b.png',
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('Should not touch tmux until the first interval fires', async () => {
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS - 1);
    expect(bind).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('Should bind before the snapshot on list', async () => {
    const order: string[] = [];
    bind.mockImplementation(async () => void order.push('bind'));
    snapshot.mockImplementation(async () => {
      order.push('snapshot');
      return snap(1);
    });

    expect(await invoke(channels.sessionList)).toEqual(snap(1));
    expect(order).toEqual(['bind', 'snapshot']);
  });

  it('Should log a bind failure on list and still return the snapshot', async () => {
    bind.mockRejectedValue(new Error('boom'));

    expect(await invoke(channels.sessionList)).toEqual(snap(1));
    expect(logged).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });

  it('Should stringify non-Error bind failures', async () => {
    bind.mockRejectedValue('texto');
    await invoke(channels.sessionList);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('texto'));
  });

  it('Should propagate a snapshot failure on list', async () => {
    snapshot.mockRejectedValue(new Error('sem tmux'));

    await expect(invoke(channels.sessionList)).rejects.toThrow('sem tmux');
  });

  it('Should broadcast on change and stay silent when unchanged', async () => {
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(channels.sessionChanged, snap(1));

    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(send).toHaveBeenCalledTimes(1);

    snapshot.mockResolvedValue(snap(2));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(channels.sessionChanged, snap(2));
  });

  it('Should not overlap ticks while one is pending', async () => {
    let release!: (value: SessionsSnapshot) => void;
    snapshot.mockReturnValue(
      new Promise<SessionsSnapshot>(resolve => {
        release = resolve;
      }),
    );
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 3);
    expect(snapshot).toHaveBeenCalledTimes(1);

    release(snap(1));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it('Should log a tick snapshot failure without broadcasting', async () => {
    snapshot.mockRejectedValue(new Error('falhou'));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('falhou'));
    expect(send).not.toHaveBeenCalled();
  });

  it('Should stringify non-Error tick failures', async () => {
    snapshot.mockRejectedValue('texto');
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('texto'));
  });

  it('Should log a bind failure in the tick and still snapshot and broadcast', async () => {
    bind.mockRejectedValue(new Error('boom'));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(send).toHaveBeenCalledWith(channels.sessionChanged, snap(1));
  });

  it('Should recover on the tick after a failure', async () => {
    snapshot.mockRejectedValueOnce(new Error('falhou'));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 2);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['start', channels.sessionStart, start, 'w1', 'sess-1'],
    ['kill', channels.sessionKill, kill, 'sess-1', undefined],
    [
      'create',
      channels.taskCreate,
      create,
      {
        repoId: 'r',
        description: 'd',
        branch: 'b',
        model: null,
        attachments: ['/a.md'],
      },
      'sess-2',
    ],
  ])(
    'Should return the %s result and then tick immediately',
    async (_name, channel, fn, arg, result) => {
      fn.mockResolvedValue(result);

      expect(await invoke(channel, arg)).toBe(result);
      expect(fn).toHaveBeenCalledWith(arg);
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledWith(channels.sessionChanged, snap(1));
    },
  );

  it('Should reject without ticking when the action fails', async () => {
    start.mockRejectedValue(new Error('Worktree não encontrado'));

    await expect(invoke(channels.sessionStart, 'x')).rejects.toThrow(
      'Worktree não encontrado',
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshot).not.toHaveBeenCalled();
  });

  it('Should not double a tick that is already running', async () => {
    let release!: (value: SessionsSnapshot) => void;
    snapshot.mockReturnValue(
      new Promise<SessionsSnapshot>(resolve => {
        release = resolve;
      }),
    );
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    kill.mockResolvedValue(undefined);
    await invoke(channels.sessionKill, 'n');
    await vi.advanceTimersByTimeAsync(0);

    expect(snapshot).toHaveBeenCalledTimes(1);
    release(snap(1));
  });

  it('Should clear no interval when stopped before the timer exists', () => {
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const idle = new SessionHandler(
      host,
      {send} as Broadcaster,
      {snapshot, start, kill} as unknown as SessionService,
      {bind, create} as unknown as TaskService,
      {pick} as FilePicker,
    );

    idle.stop();

    expect(cleared).not.toHaveBeenCalled();
  });

  it('Should clear the interval once when stopped', () => {
    const cleared = vi.spyOn(globalThis, 'clearInterval');

    handler.stop();

    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('Should stop polling and tolerate stop twice or a second register', async () => {
    handler.stop();
    handler.stop();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 2);
    expect(snapshot).not.toHaveBeenCalled();

    handler.register();
    handler.register();
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
