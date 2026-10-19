import {Logger} from '@nestjs/common';

import {WorkspaceHandler} from '../../../../../src/application/ipc/handlers/workspace-handler';
import type {
  Broadcaster,
  FolderPicker,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {Workspace} from '../../../../../src/core/domain/workspace';
import {WorkspaceWatcher} from '../../../../../src/core/interfaces/workspace-watcher';
import {SettingsService} from '../../../../../src/core/services/settings-service';
import {WorkspaceService} from '../../../../../src/core/services/workspace-service';

const makeWorkspace = (root: string): Workspace => ({
  root,
  repos: [
    {id: 'a', name: 'a', group: '', path: `${root}/a`},
    {id: 'b', name: 'b', group: '', path: `${root}/b`},
  ],
  worktrees: [],
});

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
};
const send = vi.fn();
const broadcaster: Broadcaster = {send};
const pick = vi.fn();
const picker: FolderPicker = {pick};
const discover = vi.fn();
const rememberRoot = vi.fn();
const watch = vi.fn();

const invoke = (channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({}, ...args);

let changeCallbacks: Array<() => void>;
let disposers: Array<ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  changeCallbacks = [];
  disposers = [];
  discover.mockImplementation(async (root: string) => makeWorkspace(root));
  rememberRoot.mockResolvedValue(undefined);
  watch.mockImplementation((_paths: string[], onChange: () => void) => {
    changeCallbacks.push(onChange);
    const dispose = vi.fn();
    disposers.push(dispose);
    return dispose;
  });
  new WorkspaceHandler(
    host,
    broadcaster,
    picker,
    {discover} as unknown as WorkspaceService,
    {rememberRoot} as unknown as SettingsService,
    {watch} as unknown as WorkspaceWatcher,
  ).register();
});

describe('WorkspaceHandler', () => {
  it('registers the three workspace channels', () => {
    expect([...listeners.keys()].sort()).toEqual(
      [
        channels.workspacePickFolder,
        channels.workspaceOpen,
        channels.workspaceRefresh,
      ].sort(),
    );
  });

  it('returns what the folder picker returns', async () => {
    pick.mockResolvedValue('/picked');
    expect(await invoke(channels.workspacePickFolder)).toBe('/picked');
  });

  it('opens a root: remembers it, discovers it and watches its repos', async () => {
    const result = await invoke(channels.workspaceOpen, '/root');

    expect(rememberRoot).toHaveBeenCalledWith('/root');
    expect(result).toEqual(makeWorkspace('/root'));
    expect(watch).toHaveBeenCalledWith(
      ['/root/a', '/root/b'],
      expect.any(Function),
    );
  });

  it('propagates discovery errors from open', async () => {
    discover.mockRejectedValue(new Error('sem acesso'));
    await expect(invoke(channels.workspaceOpen, '/root')).rejects.toThrow(
      'sem acesso',
    );
  });

  it('disposes the previous watcher on a second open', async () => {
    await invoke(channels.workspaceOpen, '/one');
    expect(disposers[0]).not.toHaveBeenCalled();
    await invoke(channels.workspaceOpen, '/two');
    expect(disposers[0]).toHaveBeenCalledTimes(1);
    expect(disposers[1]).not.toHaveBeenCalled();
  });

  it('broadcasts a fresh discovery when the watcher fires', async () => {
    await invoke(channels.workspaceOpen, '/root');
    discover.mockClear();
    changeCallbacks[0]?.();
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(discover).toHaveBeenCalledWith('/root');
    expect(send).toHaveBeenCalledWith(
      channels.workspaceChanged,
      makeWorkspace('/root'),
    );
  });

  it('rejects refresh before any open', async () => {
    await expect(invoke(channels.workspaceRefresh)).rejects.toThrow(
      'Nenhuma pasta aberta',
    );
  });

  it('refresh re-discovers the open root and replaces the watcher without remembering', async () => {
    await invoke(channels.workspaceOpen, '/root');
    rememberRoot.mockClear();
    discover.mockResolvedValue({
      root: '/root',
      repos: [{id: 'c', name: 'c', group: '', path: '/root/c'}],
      worktrees: [],
    });

    const result = (await invoke(channels.workspaceRefresh)) as Workspace;

    expect(result.repos.map(repo => repo.id)).toEqual(['c']);
    expect(rememberRoot).not.toHaveBeenCalled();
    expect(disposers[0]).toHaveBeenCalledTimes(1);
    expect(watch).toHaveBeenLastCalledWith(['/root/c'], expect.any(Function));
  });

  it('logs and does not broadcast when watcher discovery rejects', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await invoke(channels.workspaceOpen, '/root');
    discover.mockRejectedValue(new Error('sumiu'));
    changeCallbacks[0]?.();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(String(error.mock.calls[0]?.[0])).toContain('sumiu');
    expect(send).not.toHaveBeenCalled();
  });

  it('logs non-Error rejections from watcher discovery', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await invoke(channels.workspaceOpen, '/root');
    discover.mockRejectedValue('texto');
    changeCallbacks[0]?.();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    expect(String(error.mock.calls[0]?.[0])).toContain('texto');
  });

  it('drops a stale watcher result when another root was opened meanwhile', async () => {
    await invoke(channels.workspaceOpen, '/one');
    let release!: (workspace: Workspace) => void;
    discover.mockReturnValueOnce(
      new Promise<Workspace>(resolve => {
        release = resolve;
      }),
    );
    changeCallbacks[0]?.();
    await invoke(channels.workspaceOpen, '/two');
    release(makeWorkspace('/one'));
    await new Promise(resolve => setImmediate(resolve));

    expect(send).not.toHaveBeenCalled();
  });
});
