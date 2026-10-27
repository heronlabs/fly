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
import {channels} from '../../../../../src/core/domain/fly-api';
import type {QueueSnapshot} from '../../../../../src/core/domain/queue';
import type {LifecycleService} from '../../../../../src/core/services/lifecycle-service';
import {QueueService} from '../../../../../src/core/services/queue-service';

const snap = (n: number) => ({n}) as unknown as QueueSnapshot;

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const snapshot = vi.fn();
const refreshPullRequests = vi.fn();
const mergePullRequest = vi.fn();
const lifecycleTick = vi.fn();
const poll = vi.fn();

const invoke = (channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({}, ...args);

let handler: QueueHandler;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  snapshot.mockResolvedValue(snap(1));
  refreshPullRequests.mockResolvedValue(undefined);
  mergePullRequest.mockReset();
  lifecycleTick.mockReset().mockResolvedValue(undefined);
  poll.mockReset().mockResolvedValue(undefined);
  handler = new QueueHandler(
    host,
    {send} as Broadcaster,
    {
      snapshot,
      refreshPullRequests,
      mergePullRequest,
    } as unknown as QueueService,
    {tick: lifecycleTick, poll} as unknown as LifecycleService,
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
    expect(send).toHaveBeenCalledWith(channels.queueChanged, snap(1));
  });

  it('Should register the list channel and do no work up front', async () => {
    expect([...listeners.keys()]).toEqual([
      channels.queueList,
      channels.prMerge,
    ]);
    expect(snapshot).not.toHaveBeenCalled();
    expect(refreshPullRequests).not.toHaveBeenCalled();
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
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(channels.queueChanged, snap(1));

    snapshot.mockResolvedValue(snap(2));
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(channels.queueChanged, snap(2));
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
    expect(send).toHaveBeenLastCalledWith(channels.queueChanged, snap(3));
  });

  it('Should poll the CI and reviews between the PR refresh and the tick', async () => {
    const order: string[] = [];
    refreshPullRequests.mockImplementation(
      async () => void order.push('refresh'),
    );
    poll.mockImplementation(async () => void order.push('poll'));
    lifecycleTick.mockImplementation(async () => void order.push('tick'));

    await vi.advanceTimersByTimeAsync(PR_POLL_MS);

    expect(poll).toHaveBeenCalledExactlyOnceWith();
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
    expect(send).not.toHaveBeenCalled();
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
      {send} as Broadcaster,
      {snapshot, refreshPullRequests} as unknown as QueueService,
      {tick: lifecycleTick} as unknown as LifecycleService,
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

  it('Should merge the PR then broadcast the refreshed snapshot once', async () => {
    mergePullRequest.mockResolvedValue(undefined);

    await invoke(channels.prMerge, 'wt-1');

    expect(mergePullRequest).toHaveBeenCalledWith('wt-1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(channels.queueChanged, snap(1));
  });

  it('Should propagate a merge failure and broadcast nothing', async () => {
    mergePullRequest.mockRejectedValue(new Error('conflito'));

    await expect(invoke(channels.prMerge, 'wt-1')).rejects.toThrow('conflito');
    expect(snapshot).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
