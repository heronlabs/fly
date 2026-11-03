import type {Broadcaster} from '../../../../src/application/ipc/ipc-types';
import {WindowBroadcast} from '../../../../src/application/ipc/window-broadcast';
import {channels} from '../../../../src/core/domain/fly-api';
import type {Workspace} from '../../../../src/core/domain/workspace';

const at = (root: string): Workspace => ({root, repos: [], worktrees: []});

describe('WindowBroadcast', () => {
  const send = vi.fn();
  const sendTo = vi.fn();
  const broadcaster: Broadcaster = {send, sendTo};
  const snapshot = vi.fn();
  const onError = vi.fn();
  let broadcast: WindowBroadcast<{root: string}>;

  beforeEach(() => {
    vi.resetAllMocks();
    snapshot.mockImplementation(async (w: Workspace) => ({root: w.root}));
    broadcast = new WindowBroadcast(
      broadcaster,
      channels.queueChanged,
      snapshot,
      onError,
    );
  });

  it("Should send each window its own workspace's snapshot", async () => {
    await broadcast.update([
      [1, at('/r')],
      [2, at('/s')],
    ]);
    expect(snapshot.mock.calls).toEqual([[at('/r')], [at('/s')]]);
    expect(sendTo.mock.calls).toEqual([
      [1, channels.queueChanged, {root: '/r'}],
      [2, channels.queueChanged, {root: '/s'}],
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it('Should not resend an unchanged snapshot, and send a changed one', async () => {
    await broadcast.update([[1, at('/r')]]);
    await broadcast.update([[1, at('/r')]]);
    expect(sendTo).toHaveBeenCalledTimes(1);
    await broadcast.update([[1, at('/s')]]);
    expect(sendTo).toHaveBeenLastCalledWith(1, channels.queueChanged, {
      root: '/s',
    });
  });

  it('Should send again to a window that left and came back', async () => {
    await broadcast.update([[1, at('/r')]]);
    await broadcast.update([]);
    await broadcast.update([[1, at('/r')]]);
    expect(sendTo).toHaveBeenCalledTimes(2);
  });

  it('Should report a failed window and still send the others', async () => {
    const boom = new Error('tmux caiu');
    snapshot.mockImplementation(async (w: Workspace) => {
      if (w.root === '/r') throw boom;
      return {root: w.root};
    });
    await broadcast.update([
      [1, at('/r')],
      [2, at('/s')],
    ]);
    expect(onError).toHaveBeenCalledExactlyOnceWith(boom);
    expect(sendTo).toHaveBeenCalledExactlyOnceWith(2, channels.queueChanged, {
      root: '/s',
    });
  });

  it('Should send a window again once it recovers, even unchanged', async () => {
    await broadcast.update([[1, at('/r')]]);
    snapshot.mockRejectedValueOnce(new Error('x'));
    await broadcast.update([[1, at('/r')]]);
    await broadcast.update([[1, at('/r')]]);
    expect(sendTo).toHaveBeenCalledTimes(2);
  });
});
