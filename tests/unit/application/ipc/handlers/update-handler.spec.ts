import {Logger} from '@nestjs/common';

import {
  UPDATE_CHECK_MS,
  UpdateHandler,
} from '../../../../../src/application/ipc/handlers/update-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {UpdateService} from '../../../../../src/core/services/update-service';

const notice = (version: string) => ({
  version,
  url: `https://github.com/heronlabs/fly/releases/tag/v${version}`,
});

const listeners = new Map<string, (...args: unknown[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void listeners.set(channel, listener),
  on: vi.fn(),
};
const send = vi.fn();
const check = vi.fn();
const current = vi.fn();

let handler: UpdateHandler;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  send.mockReset();
  check.mockReset();
  current.mockReset();
  handler = new UpdateHandler(
    host,
    {send} as unknown as Broadcaster,
    {check, current} as unknown as UpdateService,
  );
});

afterEach(() => {
  handler.stop();
  logged.mockRestore();
  vi.useRealTimers();
});

describe('UpdateHandler', () => {
  it('Should answer update:get with the current notice', async () => {
    current.mockReturnValue(notice('0.4.0'));
    handler.register();

    expect(await listeners.get(channels.updateGet)!({})).toEqual(
      notice('0.4.0'),
    );
  });

  it('Should expose a 6 h interval', () => {
    expect(UPDATE_CHECK_MS).toBe(6 * 60 * 60 * 1000);
  });

  it('Should check at once and broadcast the notice', async () => {
    check.mockResolvedValue(notice('0.4.0'));

    handler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(check).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(channels.updateChanged, notice('0.4.0'));
  });

  it('Should not broadcast when the first check finds nothing', async () => {
    check.mockResolvedValue(null);

    handler.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(send).not.toHaveBeenCalled();
  });

  it('Should check every interval and broadcast only on change', async () => {
    check.mockResolvedValue(notice('0.4.0'));
    handler.start();
    await vi.advanceTimersByTimeAsync(0);

    // A new object with the same value is not a change.
    check.mockResolvedValue(notice('0.4.0'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS - 1);
    expect(check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(check).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(1);

    check.mockResolvedValue(notice('0.5.0'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(
      channels.updateChanged,
      notice('0.5.0'),
    );
  });

  it('Should broadcast null when a notice goes away', async () => {
    check.mockResolvedValue(notice('0.4.0'));
    handler.start();
    await vi.advanceTimersByTimeAsync(0);

    check.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);

    expect(send).toHaveBeenLastCalledWith(channels.updateChanged, null);
  });

  it('Should log a failing check and keep the timer alive', async () => {
    check.mockRejectedValueOnce(new Error('boom'));
    handler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(logged).toHaveBeenCalledWith(
      'Falha ao verificar atualizações: boom',
    );

    check.mockRejectedValueOnce('plain');
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);
    expect(logged).toHaveBeenCalledWith(
      'Falha ao verificar atualizações: plain',
    );

    check.mockResolvedValue(notice('0.4.0'));
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);
    expect(send).toHaveBeenCalledWith(channels.updateChanged, notice('0.4.0'));
  });

  it('Should clear the timer on stop', async () => {
    check.mockResolvedValue(null);
    handler.start();
    await vi.advanceTimersByTimeAsync(0);

    handler.stop();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS * 2);

    expect(check).toHaveBeenCalledTimes(1);
  });

  it('Should keep a single timer when started twice', async () => {
    check.mockResolvedValue(null);
    handler.start();
    handler.start();
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_MS);

    expect(check).toHaveBeenCalledTimes(3);
  });

  it('Should not keep the process alive', () => {
    const unref = vi.fn();
    const spy = vi
      .spyOn(global, 'setInterval')
      .mockReturnValue({unref} as unknown as NodeJS.Timeout);
    check.mockResolvedValue(null);

    handler.start();

    expect(unref).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
