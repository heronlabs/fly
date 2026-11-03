import {DiffHandler} from '../../../../../src/application/ipc/handlers/diff-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {WindowWorkspacesService} from '../../../../../src/application/ipc/window-workspaces-service';
import type {WorktreeDiff} from '../../../../../src/core/domain/diff';
import {channels} from '../../../../../src/core/domain/fly-api';
import {DiffService} from '../../../../../src/core/services/diff-service';

const listeners = new Map<string, (...args: any[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const read = vi.fn();
const ws = {root: '/r', repos: [], worktrees: []};
const from = (windowId: number) => ({sender: {id: windowId}});

beforeEach(() => {
  listeners.clear();
  read.mockReset();
  const windows = new WindowWorkspacesService();
  windows.set(1, ws);
  new DiffHandler(host, {read} as unknown as DiffService, windows).register();
});

describe('DiffHandler', () => {
  it('Should register only the diff channel', () => {
    expect([...listeners.keys()]).toEqual([channels.diffGet]);
  });

  it('Should pass both arguments through and return the result', async () => {
    const diff = {files: []} as unknown as WorktreeDiff;
    read.mockResolvedValue(diff);

    const result = await listeners.get(channels.diffGet)!(
      from(1),
      'wt-1',
      'branch',
    );

    expect(read).toHaveBeenCalledWith(ws, 'wt-1', 'branch');
    expect(result).toBe(diff);
  });

  it('Should read with no folder for a window that shows none', async () => {
    await listeners.get(channels.diffGet)!(from(2), 'wt-1', 'live');
    expect(read).toHaveBeenCalledWith(null, 'wt-1', 'live');
  });

  it('Should propagate a rejection', async () => {
    read.mockRejectedValue(new Error('sem worktree'));

    await expect(
      listeners.get(channels.diffGet)!(from(1), 'wt-1', 'live'),
    ).rejects.toThrow('sem worktree');
  });
});
