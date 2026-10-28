import {SetupHandler} from '../../../../../src/application/ipc/handlers/setup-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import {SetupService} from '../../../../../src/core/services/setup-service';

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const broadcaster: Broadcaster = {send};
const setup = {
  info: vi.fn(),
  doctor: vi.fn(),
  installTool: vi.fn(),
  commandState: vi.fn(),
  installCommand: vi.fn(),
  installer: vi.fn(),
  trashInstaller: vi.fn(),
  complete: vi.fn(),
};
let handler: SetupHandler;

const invoke = (channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({}, ...args);

beforeEach(() => {
  listeners.clear();
  handler = new SetupHandler(
    host,
    broadcaster,
    setup as unknown as SetupService,
  );
  handler.register();
});

describe('SetupHandler', () => {
  it('registers every setup channel', () => {
    expect([...listeners.keys()]).toEqual([
      channels.setupInfo,
      channels.setupDoctor,
      channels.setupInstallTool,
      channels.setupCommandState,
      channels.setupInstallCommand,
      channels.setupInstaller,
      channels.setupTrashInstaller,
      channels.setupComplete,
    ]);
  });

  it.each([
    [channels.setupDoctor, 'doctor'],
    [channels.setupCommandState, 'commandState'],
    [channels.setupInstallCommand, 'installCommand'],
    [channels.setupInstaller, 'installer'],
    [channels.setupComplete, 'complete'],
  ] as const)(
    'delegates %s to %s and returns its result',
    async (channel, method) => {
      setup[method].mockResolvedValue('result');

      expect(await invoke(channel)).toBe('result');
      expect(setup[method]).toHaveBeenCalledTimes(1);
      expect(setup[method]).toHaveBeenCalledWith();
    },
  );

  it('trashes the installer image path it is given', async () => {
    setup.trashInstaller.mockResolvedValue(undefined);

    await invoke(channels.setupTrashInstaller, '/A/fly.dmg');

    expect(setup.trashInstaller).toHaveBeenCalledExactlyOnceWith('/A/fly.dmg');
  });

  it('installs the tool it is given', async () => {
    setup.installTool.mockResolvedValue({tools: [], brew: true});

    expect(await invoke(channels.setupInstallTool, 'tmux')).toEqual({
      tools: [],
      brew: true,
    });
    expect(setup.installTool).toHaveBeenCalledWith('tmux');
  });

  it('asks for info without a request by default', async () => {
    setup.info.mockResolvedValue({open: false});

    expect(await invoke(channels.setupInfo)).toEqual({open: false});
    expect(setup.info).toHaveBeenCalledTimes(1);
    expect(setup.info).toHaveBeenCalledWith(false);
  });

  it('announces a request and passes it to info exactly once', async () => {
    handler.request();

    expect(send).toHaveBeenCalledWith(channels.setupRequested, null);
    await invoke(channels.setupInfo);
    await invoke(channels.setupInfo);

    expect(setup.info.mock.calls).toEqual([[true], [false]]);
  });

  it('propagates rejections', async () => {
    setup.info.mockRejectedValue(new Error('boom'));
    setup.installTool.mockRejectedValue(new Error('Homebrew não encontrado'));

    await expect(invoke(channels.setupInfo)).rejects.toThrow('boom');
    await expect(invoke(channels.setupInstallTool, 'git')).rejects.toThrow(
      'Homebrew não encontrado',
    );
  });
});
