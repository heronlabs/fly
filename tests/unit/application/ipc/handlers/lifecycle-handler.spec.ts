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
const tick = vi.fn();

let handler: LifecycleHandler;

beforeEach(() => {
  listeners.clear();
  openPullRequest.mockReset().mockResolvedValue(undefined);
  rerun.mockReset().mockResolvedValue(undefined);
  resume.mockReset().mockResolvedValue(undefined);
  tick.mockReset().mockResolvedValue(undefined);
  handler = new LifecycleHandler(
    host,
    {openPullRequest, rerun, resume} as unknown as LifecycleService,
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

  it('Should register the open, rerun and resume channels', () => {
    expect([...listeners.keys()]).toEqual(actions.map(([channel]) => channel));
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
});
