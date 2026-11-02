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
import {WindowWorkspacesService} from '../../../../../src/application/ipc/window-workspaces-service';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {SessionsSnapshot} from '../../../../../src/core/domain/session';
import type {Workspace} from '../../../../../src/core/domain/workspace';
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

const listeners = new Map<string, (...args: any[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const ws: Workspace = {root: '/r', repos: [], worktrees: []};
const other: Workspace = {root: '/s', repos: [], worktrees: []};
const send = vi.fn();
const sendTo = vi.fn();
const snapshot = vi.fn();
const start = vi.fn();
const kill = vi.fn();
const create = vi.fn();
const pick = vi.fn();

const invokeFrom = (windowId: number, channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({sender: {id: windowId}}, ...args);
const invoke = (channel: string, ...args: unknown[]) =>
  invokeFrom(1, channel, ...args);

let handler: SessionHandler;
let windows: WindowWorkspacesService;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  snapshot.mockResolvedValue(snap(1));
  windows = new WindowWorkspacesService();
  windows.set(1, ws);
  handler = new SessionHandler(
    host,
    {send, sendTo} as Broadcaster,
    {snapshot, start, kill} as unknown as SessionService,
    {create} as unknown as TaskService,
    {pick} as FilePicker,
    windows,
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
    expect(snapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it('Should propagate a snapshot failure on list', async () => {
    snapshot.mockRejectedValue(new Error('sem tmux'));

    await expect(invoke(channels.sessionList)).rejects.toThrow('sem tmux');
  });

  it("Should list the sessions of the calling window's folder", async () => {
    windows.set(2, other);
    snapshot.mockImplementation(async (shown: Workspace | null) =>
      snap(shown === other ? 2 : 3),
    );

    expect(await invokeFrom(2, channels.sessionList)).toEqual(snap(2));
    expect(await invokeFrom(5, channels.sessionList)).toEqual(snap(3));
    expect(snapshot.mock.calls).toEqual([[other], [null]]);
  });

  it('Should broadcast on change and stay silent when unchanged', async () => {
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith(1, channels.sessionChanged, snap(1));

    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(sendTo).toHaveBeenCalledTimes(1);

    snapshot.mockResolvedValue(snap(2));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(sendTo).toHaveBeenCalledTimes(2);
    expect(sendTo).toHaveBeenLastCalledWith(
      1,
      channels.sessionChanged,
      snap(2),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('Should send each window the sessions of its own folder', async () => {
    windows.set(2, other);
    snapshot.mockImplementation(async (shown: Workspace) =>
      snap(shown === other ? 2 : 1),
    );
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);

    expect(snapshot.mock.calls).toEqual([[ws], [other]]);
    expect(sendTo.mock.calls).toEqual([
      [1, channels.sessionChanged, snap(1)],
      [2, channels.sessionChanged, snap(2)],
    ]);
  });

  it('Should list nothing while no window shows a folder', async () => {
    windows.forget(1);
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
    expect(snapshot).not.toHaveBeenCalled();
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

    expect(logged).toHaveBeenCalledWith('Falha ao atualizar sessões: falhou');
    expect(sendTo).not.toHaveBeenCalled();
  });

  it('Should stringify non-Error tick failures', async () => {
    snapshot.mockRejectedValue('texto');
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('texto'));
  });

  it('Should recover on the tick after a failure', async () => {
    snapshot.mockRejectedValueOnce(new Error('falhou'));
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS * 2);

    expect(sendTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['start', channels.sessionStart, start, 'w1', 'sess-1', [ws, 'w1']],
    ['kill', channels.sessionKill, kill, 'sess-1', undefined, ['sess-1']],
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
      [
        ws,
        {
          repoId: 'r',
          description: 'd',
          branch: 'b',
          model: null,
          attachments: ['/a.md'],
        },
      ],
    ],
  ])(
    'Should return the %s result and then tick immediately',
    async (_name, channel, fn, arg, result, args) => {
      fn.mockResolvedValue(result);

      expect(await invoke(channel, arg)).toBe(result);
      expect(fn).toHaveBeenCalledWith(...args);
      await vi.advanceTimersByTimeAsync(0);
      expect(sendTo).toHaveBeenCalledWith(1, channels.sessionChanged, snap(1));
    },
  );

  it('Should start and create in a window that shows no folder with none', async () => {
    start.mockResolvedValue('s');
    create.mockResolvedValue('s');
    await invokeFrom(7, channels.sessionStart, 'w1');
    await invokeFrom(7, channels.taskCreate, {repoId: 'r'});
    expect(start).toHaveBeenCalledWith(null, 'w1');
    expect(create).toHaveBeenCalledWith(null, {repoId: 'r'});
  });

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
      {send, sendTo} as Broadcaster,
      {snapshot, start, kill} as unknown as SessionService,
      {create} as unknown as TaskService,
      {pick} as FilePicker,
      windows,
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
