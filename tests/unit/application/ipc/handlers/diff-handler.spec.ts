import {DiffHandler} from '../../../../../src/application/ipc/handlers/diff-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import type {WorktreeDiff} from '../../../../../src/core/domain/diff';
import {channels} from '../../../../../src/core/domain/fly-api';
import {DiffService} from '../../../../../src/core/services/diff-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const read = vi.fn();

beforeEach(() => {
  listeners.clear();
  read.mockReset();
  new DiffHandler(host, {read} as unknown as DiffService).register();
});

describe('DiffHandler', () => {
  it('Should register only the diff channel', () => {
    expect([...listeners.keys()]).toEqual([channels.diffGet]);
  });

  it('Should pass both arguments through and return the result', async () => {
    const diff = {files: []} as unknown as WorktreeDiff;
    read.mockResolvedValue(diff);

    const result = await listeners.get(channels.diffGet)!({}, 'wt-1', 'branch');

    expect(read).toHaveBeenCalledWith('wt-1', 'branch');
    expect(result).toBe(diff);
  });

  it('Should propagate a rejection', async () => {
    read.mockRejectedValue(new Error('sem worktree'));

    await expect(
      listeners.get(channels.diffGet)!({}, 'wt-1', 'live'),
    ).rejects.toThrow('sem worktree');
  });
});
