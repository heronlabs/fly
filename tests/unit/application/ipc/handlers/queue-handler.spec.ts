import {Logger} from '@nestjs/common';

import {
  PR_POLL_MS,
  QUEUE_POLL_MS,
  QueueHandler,
} from '../../../../../src/application/ipc/handlers/queue-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {WindowWorkspacesService} from '../../../../../src/application/ipc/window-workspaces-service';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {QueueSnapshot} from '../../../../../src/core/domain/queue';
import type {Workspace} from '../../../../../src/core/domain/workspace';
import type {LifecycleService} from '../../../../../src/core/services/lifecycle-service';
import {QueueService} from '../../../../../src/core/services/queue-service';

const snap = (n: number) => ({n}) as unknown as QueueSnapshot;

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
const refreshPullRequests = vi.fn();
const merge = vi.fn();
const lifecycleTick = vi.fn();
const poll = vi.fn();

const invokeFrom = (windowId: number, channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({sender: {id: windowId}}, ...args);
const invoke = (channel: string, ...args: unknown[]) =>
  invokeFrom(1, channel, ...args);

let handler: QueueHandler;
let windows: WindowWorkspacesService;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  snapshot.mockResolvedValue(snap(1));
  refreshPullRequests.mockResolvedValue(undefined);
  merge.mockReset();
  lifecycleTick.mockReset().mockResolvedValue(undefined);
  poll.mockReset().mockResolvedValue(undefined);
  sendTo.mockReset();
  windows = new WindowWorkspacesService();
  windows.set(1, ws);
  handler = new QueueHandler(
    host,
    {send, sendTo} as Broadcaster,
    {snapshot, refreshPullRequests} as unknown as QueueService,
    {tick: lifecycleTick, poll, merge} as unknown as LifecycleService,
    windows,
  );
  handler.register();
});

afterEach(() => {
  handler.stop();
  vi.useRealTimers();
  logged.mockRestore();
});

describe('QueueHandler', () => {
  it('Should tick the lifecycle once before each snapshot', async () => {
    const order: string[] = [];
    lifecycleTick.mockImplementation(async () => void order.push('tick'));
    snapshot.mockImplementation(async () => {
      order.push('snapshot');
      return snap(1);
    });
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(order).toEqual(['tick', 'snapshot']);
  });

  it('Should log a lifecycle tick rejection and still snapshot', async () => {
    lifecycleTick.mockRejectedValue(new Error('boom'));
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(logged).toHaveBeenCalledWith('Falha no ciclo das tarefas: boom');
    expect(sendTo).toHaveBeenCalledWith(1, channels.queueChanged, snap(1));
  });

  it('Should register the list channel and do no work up front', async () => {
    expect([...listeners.keys()]).toEqual([
      channels.queueList,
      channels.prMerge,
    ]);
    expect(snapshot).not.toHaveBeenCalled();
    expect(refreshPullRequests).not.toHaveBeenCalled();
  });

  it("Should list the queue of the calling window's folder", async () => {
    // The refresh each list starts would snapshot every window afterwards.
    refreshPullRequests.mockReturnValue(new Promise<void>(() => undefined));
    windows.set(2, other);
    await invokeFrom(2, channels.queueList);
    await invokeFrom(5, channels.queueList);
    expect(snapshot.mock.calls).toEqual([[other], [null]]);
  });

  it('Should move the tasks of every open folder, then send each window its queue', async () => {
    windows.set(2, other);
    snapshot.mockImplementation(async (shown: Workspace) =>
      snap(shown === other ? 2 : 1),
    );
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);

    expect(lifecycleTick).toHaveBeenCalledExactlyOnceWith([ws, other]);
    expect(sendTo.mock.calls).toEqual([
      [1, channels.queueChanged, snap(1)],
      [2, channels.queueChanged, snap(2)],
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it('Should merge from a window that shows no folder with none', async () => {
    merge.mockResolvedValue(undefined);
    await invokeFrom(7, channels.prMerge, 'wt-1');
    expect(merge).toHaveBeenCalledWith(null, 'wt-1');
  });

  it('Should return the snapshot and refresh PRs on each list', async () => {
    expect(await invoke(channels.queueList)).toEqual(snap(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(await invoke(channels.queueList)).toEqual(snap(1));
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshPullRequests).toHaveBeenCalledTimes(2);
  });

  it('Should not overlap the refreshes of two overlapping lists', async () => {
    let release!: () => void;
    refreshPullRequests.mockReturnValue(
      new Promise<void>(resolve => {
        release = resolve;
      }),
    );
    await invoke(channels.queueList);
    await invoke(channels.queueList);
    expect(refreshPullRequests).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('Should broadcast once for identical snapshots and again on change', async () => {
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith(1, channels.queueChanged, snap(1));

    snapshot.mockResolvedValue(snap(2));
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(sendTo).toHaveBeenCalledTimes(2);
    expect(sendTo).toHaveBeenLastCalledWith(1, channels.queueChanged, snap(2));
  });

  it('Should not overlap ticks while one is pending', async () => {
    let release!: (value: QueueSnapshot) => void;
    snapshot.mockReturnValue(
      new Promise<QueueSnapshot>(resolve => {
        release = resolve;
      }),
    );
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS * 3);
    expect(snapshot).toHaveBeenCalledTimes(1);

    release(snap(1));
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it('Should refresh PRs after 30 s and broadcast afterwards', async () => {
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);
    expect(refreshPullRequests).toHaveBeenCalledTimes(1);

    snapshot.mockResolvedValue(snap(2));
    refreshPullRequests.mockImplementation(async () => {
      snapshot.mockResolvedValue(snap(3));
    });
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);
    expect(refreshPullRequests).toHaveBeenCalledTimes(2);
    expect(sendTo).toHaveBeenLastCalledWith(1, channels.queueChanged, snap(3));
  });

  it('Should poll the CI and reviews between the PR refresh and the tick', async () => {
    const order: string[] = [];
    refreshPullRequests.mockImplementation(
      async () => void order.push('refresh'),
    );
    poll.mockImplementation(async () => void order.push('poll'));
    lifecycleTick.mockImplementation(async () => void order.push('tick'));

    await vi.advanceTimersByTimeAsync(PR_POLL_MS);

    expect(refreshPullRequests).toHaveBeenCalledExactlyOnceWith([ws]);
    expect(poll).toHaveBeenCalledExactlyOnceWith([ws]);
    expect(order.slice(-3)).toEqual(['refresh', 'poll', 'tick']);
  });

  it('Should log a poll rejection and still tick after it', async () => {
    const order: string[] = [];
    poll.mockImplementation(async () => {
      order.push('poll');
      throw new Error('ENOSPC');
    });
    lifecycleTick.mockImplementation(async () => void order.push('tick'));

    await vi.advanceTimersByTimeAsync(PR_POLL_MS);

    expect(logged).toHaveBeenCalledWith('Falha ao acompanhar a CI: ENOSPC');
    expect(logged).not.toHaveBeenCalledWith(
      expect.stringContaining('Falha ao consultar PRs'),
    );
    expect(order.slice(-2)).toEqual(['poll', 'tick']);
  });

  it('Should not poll when the PR refresh fails', async () => {
    refreshPullRequests.mockRejectedValue(new Error('gh caiu'));
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);
    expect(poll).not.toHaveBeenCalled();
  });

  it('Should not overlap PR refreshes', async () => {
    let release!: () => void;
    refreshPullRequests.mockReturnValue(
      new Promise<void>(resolve => {
        release = resolve;
      }),
    );
    await vi.advanceTimersByTimeAsync(PR_POLL_MS * 3);
    expect(refreshPullRequests).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);
    expect(refreshPullRequests).toHaveBeenCalledTimes(2);
  });

  it('Should log a tick failure without broadcasting', async () => {
    snapshot.mockRejectedValue(new Error('falhou'));
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);

    expect(logged).toHaveBeenCalledWith('Falha ao atualizar a fila: falhou');
    expect(sendTo).not.toHaveBeenCalled();
  });

  it('Should stringify non-Error tick failures', async () => {
    snapshot.mockRejectedValue('texto');
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);

    expect(logged).toHaveBeenCalledWith('Falha ao atualizar a fila: texto');
  });

  it('Should log a refresh failure', async () => {
    refreshPullRequests.mockRejectedValue(new Error('gh caiu'));
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);

    expect(logged).toHaveBeenCalledWith('Falha ao consultar PRs: gh caiu');
  });

  it('Should stop both timers and tolerate stop twice', async () => {
    handler.stop();
    handler.stop();
    await vi.advanceTimersByTimeAsync(PR_POLL_MS * 2);

    expect(snapshot).not.toHaveBeenCalled();
    expect(refreshPullRequests).not.toHaveBeenCalled();
  });

  it('Should clear no interval when stopped before any timer exists', () => {
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const idle = new QueueHandler(
      host,
      {send, sendTo} as Broadcaster,
      {snapshot, refreshPullRequests} as unknown as QueueService,
      {tick: lifecycleTick} as unknown as LifecycleService,
      windows,
    );

    idle.stop();

    expect(cleared).not.toHaveBeenCalled();
  });

  it('Should clear both intervals once when stopped', () => {
    const cleared = vi.spyOn(globalThis, 'clearInterval');

    handler.stop();

    expect(cleared).toHaveBeenCalledTimes(2);
  });

  it('Should leave one of each timer after registering twice', async () => {
    handler.register();
    handler.register();
    await vi.advanceTimersByTimeAsync(PR_POLL_MS);

    expect(refreshPullRequests).toHaveBeenCalledTimes(1);
    // 9 ticks from the 3 s interval plus 1 after the refresh.
    expect(snapshot).toHaveBeenCalledTimes(PR_POLL_MS / QUEUE_POLL_MS + 1);
  });

  it('Should merge the PR with its cleanup, then broadcast the refreshed snapshot once', async () => {
    merge.mockResolvedValue(undefined);

    await invoke(channels.prMerge, 'wt-1');

    expect(merge).toHaveBeenCalledWith(ws, 'wt-1');
    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith(1, channels.queueChanged, snap(1));
  });

  it('Should propagate a merge failure and broadcast nothing', async () => {
    merge.mockRejectedValue(new Error('conflito'));

    await expect(invoke(channels.prMerge, 'wt-1')).rejects.toThrow('conflito');
    expect(snapshot).not.toHaveBeenCalled();
    expect(sendTo).not.toHaveBeenCalled();
  });
});
