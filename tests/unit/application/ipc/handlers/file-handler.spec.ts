import {FileHandler} from '../../../../../src/application/ipc/handlers/file-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {WindowWorkspacesService} from '../../../../../src/application/ipc/window-workspaces-service';
import {channels} from '../../../../../src/core/domain/fly-api';
import {FileService} from '../../../../../src/core/services/file-service';

const listeners = new Map<string, (...args: any[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const list = vi.fn();
const read = vi.fn();
const write = vi.fn();
const poll = vi.fn();
const search = vi.fn();
const ws = {root: '/r', repos: [], worktrees: []};
const from = (windowId: number) => ({sender: {id: windowId}});

beforeEach(() => {
  listeners.clear();
  for (const fn of [list, read, write, poll, search]) fn.mockReset();
  const windows = new WindowWorkspacesService();
  windows.set(1, ws);
  new FileHandler(
    host,
    {list, read, write, poll, search} as unknown as FileService,
    windows,
  ).register();
});

describe('FileHandler', () => {
  it('Should register only the five file channels', () => {
    expect([...listeners.keys()]).toEqual([
      channels.fileList,
      channels.fileRead,
      channels.fileWrite,
      channels.filePoll,
      channels.fileSearch,
    ]);
  });

  it('Should pass list arguments through and return the result', async () => {
    const entries = [{name: 'a', kind: 'file'}];
    list.mockResolvedValue(entries);

    const result = await listeners.get(channels.fileList)!(
      from(1),
      'wt-1',
      'src',
    );

    expect(list).toHaveBeenCalledWith(ws, 'wt-1', 'src');
    expect(result).toBe(entries);
  });

  it('Should pass read arguments through and return the result', async () => {
    const content = {kind: 'binary', path: 'a.png'};
    read.mockResolvedValue(content);

    const result = await listeners.get(channels.fileRead)!(
      from(1),
      'wt-1',
      'a.png',
    );

    expect(read).toHaveBeenCalledWith(ws, 'wt-1', 'a.png');
    expect(result).toBe(content);
  });

  it('Should pass write arguments through and return the result', async () => {
    const written = {mtimeMs: 5};
    write.mockResolvedValue(written);

    const result = await listeners.get(channels.fileWrite)!(
      from(1),
      'wt-1',
      'a.ts',
      'x',
      'crlf',
      3,
    );

    expect(write).toHaveBeenCalledWith(ws, 'wt-1', 'a.ts', 'x', 'crlf', 3);
    expect(result).toBe(written);
  });

  it('Should pass poll arguments through and return the result', async () => {
    const polled = {flags: {}};
    poll.mockResolvedValue(polled);

    const result = await listeners.get(channels.filePoll)!(from(1), 'wt-1', [
      'a',
    ]);

    expect(poll).toHaveBeenCalledWith(ws, 'wt-1', ['a']);
    expect(result).toBe(polled);
  });

  it('Should pass search arguments through and return the result', async () => {
    const query = {
      text: 'foo',
      caseSensitive: true,
      wholeWord: false,
      regex: false,
    };
    const found = {files: [], total: 0, truncated: false};
    search.mockResolvedValue(found);

    const result = await listeners.get(channels.fileSearch)!(
      from(1),
      'wt-1',
      query,
    );

    expect(search).toHaveBeenCalledWith(ws, 'wt-1', query);
    expect(result).toBe(found);
  });

  it('Should use no folder for a window that shows none', async () => {
    await listeners.get(channels.fileRead)!(from(2), 'wt-1', 'a.ts');
    expect(read).toHaveBeenCalledWith(null, 'wt-1', 'a.ts');
  });

  it.each([
    [channels.fileList, list],
    [channels.fileRead, read],
    [channels.fileWrite, write],
    [channels.filePoll, poll],
    [channels.fileSearch, search],
  ])('Should propagate a rejection on %s', async (channel, fn) => {
    fn.mockRejectedValue(new Error('sem worktree'));

    await expect(listeners.get(channel)!(from(1), 'wt-1')).rejects.toThrow(
      'sem worktree',
    );
  });
});
