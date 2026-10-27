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
const tick = vi.fn();

let handler: LifecycleHandler;

beforeEach(() => {
  listeners.clear();
  openPullRequest.mockReset().mockResolvedValue(undefined);
  tick.mockReset().mockResolvedValue(undefined);
  handler = new LifecycleHandler(
    host,
    {openPullRequest} as unknown as LifecycleService,
    {tick} as unknown as QueueHandler,
  );
  handler.register();
});

describe('LifecycleHandler', () => {
  it('Should register only the open channel', () => {
    expect([...listeners.keys()]).toEqual([channels.prOpen]);
  });

  it('Should open the PR and then tick the queue', async () => {
    const order: string[] = [];
    openPullRequest.mockImplementation(async () => void order.push('open'));
    tick.mockImplementation(async () => void order.push('tick'));

    await listeners.get(channels.prOpen)!({}, 'w1');

    expect(openPullRequest).toHaveBeenCalledWith('w1');
    expect(order).toEqual(['open', 'tick']);
  });

  it('Should propagate a refusal without ticking', async () => {
    openPullRequest.mockRejectedValue(new Error('Já existe um PR aberto'));
    await expect(listeners.get(channels.prOpen)!({}, 'w1')).rejects.toThrow(
      'Já existe um PR aberto',
    );
    expect(tick).not.toHaveBeenCalled();
  });
});
