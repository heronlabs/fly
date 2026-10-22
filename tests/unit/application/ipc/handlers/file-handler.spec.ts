import {FileHandler} from '../../../../../src/application/ipc/handlers/file-handler';
import type {IpcHost} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {FileService} from '../../../../../src/core/services/file-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const list = vi.fn();
const read = vi.fn();
const write = vi.fn();
const poll = vi.fn();

beforeEach(() => {
  listeners.clear();
  for (const fn of [list, read, write, poll]) fn.mockReset();
  new FileHandler(host, {
    list,
    read,
    write,
    poll,
  } as unknown as FileService).register();
});

describe('FileHandler', () => {
  it('Should register only the four file channels', () => {
    expect([...listeners.keys()]).toEqual([
      channels.fileList,
      channels.fileRead,
      channels.fileWrite,
      channels.filePoll,
    ]);
  });

  it('Should pass list arguments through and return the result', async () => {
    const entries = [{name: 'a', kind: 'file'}];
    list.mockResolvedValue(entries);

    const result = await listeners.get(channels.fileList)!({}, 'wt-1', 'src');

    expect(list).toHaveBeenCalledWith('wt-1', 'src');
    expect(result).toBe(entries);
  });

  it('Should pass read arguments through and return the result', async () => {
    const content = {kind: 'binary', path: 'a.png'};
    read.mockResolvedValue(content);

    const result = await listeners.get(channels.fileRead)!({}, 'wt-1', 'a.png');

    expect(read).toHaveBeenCalledWith('wt-1', 'a.png');
    expect(result).toBe(content);
  });

  it('Should pass write arguments through and return the result', async () => {
    const written = {mtimeMs: 5};
    write.mockResolvedValue(written);

    const result = await listeners.get(channels.fileWrite)!(
      {},
      'wt-1',
      'a.ts',
      'x',
      'crlf',
      3,
    );

    expect(write).toHaveBeenCalledWith('wt-1', 'a.ts', 'x', 'crlf', 3);
    expect(result).toBe(written);
  });

  it('Should pass poll arguments through and return the result', async () => {
    const polled = {flags: {}};
    poll.mockResolvedValue(polled);

    const result = await listeners.get(channels.filePoll)!({}, 'wt-1', ['a']);

    expect(poll).toHaveBeenCalledWith('wt-1', ['a']);
    expect(result).toBe(polled);
  });

  it.each([
    [channels.fileList, list],
    [channels.fileRead, read],
    [channels.fileWrite, write],
    [channels.filePoll, poll],
  ])('Should propagate a rejection on %s', async (channel, fn) => {
    fn.mockRejectedValue(new Error('sem worktree'));

    await expect(listeners.get(channel)!({}, 'wt-1')).rejects.toThrow(
      'sem worktree',
    );
  });
});
