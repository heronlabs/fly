import {LifecycleHandler} from '../../../../../src/application/ipc/handlers/lifecycle-handler';
import type {QueueHandler} from '../../../../../src/application/ipc/handlers/queue-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {LifecycleService} from '../../../../../src/core/services/lifecycle-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const openPullRequest = vi.fn();
const rerun = vi.fn();
const resume = vi.fn();
const clean = vi.fn();
const tick = vi.fn();

let handler: LifecycleHandler;

beforeEach(() => {
  listeners.clear();
  openPullRequest.mockReset().mockResolvedValue(undefined);
  rerun.mockReset().mockResolvedValue(undefined);
  resume.mockReset().mockResolvedValue(undefined);
  clean.mockReset().mockResolvedValue(undefined);
  tick.mockReset().mockResolvedValue(undefined);
  handler = new LifecycleHandler(
    host,
    {openPullRequest, rerun, resume, clean} as unknown as LifecycleService,
    {tick} as unknown as QueueHandler,
  );
  handler.register();
});

describe('LifecycleHandler', () => {
  const actions: [string, ReturnType<typeof vi.fn>][] = [
    [channels.prOpen, openPullRequest],
    [channels.prRerun, rerun],
    [channels.prResume, resume],
  ];
  const cleaning: [string, boolean][] = [
    ['confirmed', true],
    ['unconfirmed', false],
  ];

  it('Should register the open, rerun, resume and clean channels', () => {
    expect([...listeners.keys()]).toEqual([
      ...actions.map(([channel]) => channel),
      channels.prClean,
    ]);
  });

  it.each(actions)(
    'Should handle %s and then tick the queue',
    async (channel, action) => {
      const order: string[] = [];
      action.mockImplementation(async () => void order.push('action'));
      tick.mockImplementation(async () => void order.push('tick'));

      await listeners.get(channel)!({}, 'w1');

      expect(action).toHaveBeenCalledExactlyOnceWith('w1');
      expect(order).toEqual(['action', 'tick']);
    },
  );

  it.each(actions)(
    'Should propagate a refusal of %s without ticking',
    async (channel, action) => {
      action.mockRejectedValue(new Error('Nada para rodar de novo'));
      await expect(listeners.get(channel)!({}, 'w1')).rejects.toThrow(
        'Nada para rodar de novo',
      );
      expect(tick).not.toHaveBeenCalled();
    },
  );
  it.each(cleaning)(
    'Should clean with the %s flag and then tick the queue',
    async (_name, confirmed) => {
      const order: string[] = [];
      clean.mockImplementation(async () => void order.push('clean'));
      tick.mockImplementation(async () => void order.push('tick'));

      await listeners.get(channels.prClean)!({}, 'w1', confirmed);

      expect(clean).toHaveBeenCalledExactlyOnceWith('w1', confirmed);
      expect(order).toEqual(['clean', 'tick']);
    },
  );

  it('Should propagate a cleanup refusal without ticking', async () => {
    clean.mockRejectedValue(new Error('Falha ao limpar: x'));
    await expect(
      listeners.get(channels.prClean)!({}, 'w1', true),
    ).rejects.toThrow('Falha ao limpar: x');
    expect(tick).not.toHaveBeenCalled();
  });
});
