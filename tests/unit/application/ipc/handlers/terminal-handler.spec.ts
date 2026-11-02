import {Logger} from '@nestjs/common';

import {
  TERMINAL_FLUSH_MS,
  TerminalHandler,
} from '../../../../../src/application/ipc/handlers/terminal-handler';
import type {
  Broadcaster,
  IpcHost,
} from '../../../../../src/application/ipc/ipc-types';
import {channels} from '../../../../../src/core/domain/fly-api';
import type {TerminalSink} from '../../../../../src/core/services/terminal-service';
import {TerminalService} from '../../../../../src/core/services/terminal-service';

const handlers = new Map<string, (...args: any[]) => unknown>();
const listeners = new Map<string, (...args: any[]) => unknown>();
const host: IpcHost = {
  handle: (channel, listener) => void handlers.set(channel, listener),
  on: (channel, listener) => void listeners.set(channel, listener),
};
const send = vi.fn();
const sendTo = vi.fn();
const attach = vi.fn();
const write = vi.fn();
const resize = vi.fn();
const detach = vi.fn();
let handler: TerminalHandler;

let sink: TerminalSink;
// Every sink attach handed out, by the session it attached to.
const sinks = new Map<string, TerminalSink>();

const invokeFrom = (windowId: number, channel: string, ...args: unknown[]) =>
  handlers.get(channel)!({sender: {id: windowId}}, ...args);
const invoke = (channel: string, ...args: unknown[]) =>
  invokeFrom(1, channel, ...args);
const emit = (channel: string, ...args: unknown[]) =>
  listeners.get(channel)!({}, ...args);

beforeEach(() => {
  vi.useFakeTimers();
  handlers.clear();
  listeners.clear();
  sinks.clear();
  attach.mockImplementation(
    (name: string, _size: unknown, terminalSink: TerminalSink) => {
      sink = terminalSink;
      sinks.set(name, terminalSink);
      return name === 'sess' ? 't1' : `t-${name}`;
    },
  );
  handler = new TerminalHandler(
    host,
    {send, sendTo} as Broadcaster,
    {attach, write, resize, detach} as unknown as TerminalService,
  );
  handler.register();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TerminalHandler', () => {
  it('Should return the id from TerminalService.attach', async () => {
    const size = {cols: 80, rows: 24};

    const id = await invoke(channels.terminalAttach, 'sess', size);

    expect(id).toBe('t1');
    expect(attach).toHaveBeenCalledWith('sess', size, expect.any(Object));
  });

  it('Should batch chunks within the flush window into one broadcast', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'a');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS - 1);
    sink.data('t1', 'b');
    sink.data('t1', 'c');
    expect(sendTo).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith(1, channels.terminalData, {
      terminalId: 't1',
      data: 'abc',
    });
  });

  it('Should batch terminals separately', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'a');
    sink.data('t2', 'b');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS);

    expect(sendTo).toHaveBeenCalledWith(1, channels.terminalData, {
      terminalId: 't1',
      data: 'a',
    });
    expect(sendTo).toHaveBeenCalledWith(1, channels.terminalData, {
      terminalId: 't2',
      data: 'b',
    });
    expect(sendTo).toHaveBeenCalledTimes(2);
  });

  it('Should start a new batch after a flush', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'a');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS);
    sink.data('t1', 'b');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS);

    expect(sendTo).toHaveBeenLastCalledWith(1, channels.terminalData, {
      terminalId: 't1',
      data: 'b',
    });
    expect(sendTo).toHaveBeenCalledTimes(2);
  });

  it('Should send pending data before the exit event', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'bye');
    sink.exit('t1', 3);

    expect(sendTo.mock.calls).toEqual([
      [1, channels.terminalData, {terminalId: 't1', data: 'bye'}],
      [1, channels.terminalExit, {terminalId: 't1', exitCode: 3}],
    ]);
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS);
    expect(sendTo).toHaveBeenCalledTimes(2);
  });

  it('Should cancel the flush timer when the exit flushes the data', async () => {
    const cleared = vi.spyOn(globalThis, 'clearTimeout');
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'bye');
    sink.exit('t1', 3);

    expect(cleared).toHaveBeenCalledTimes(1);
  });

  it('Should send only the exit event when nothing is pending', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.exit('t1', 0);

    expect(sendTo.mock.calls).toEqual([
      [1, channels.terminalExit, {terminalId: 't1', exitCode: 0}],
    ]);
  });

  it('Should drop pending data and the flush timer on detach', async () => {
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'a');
    await invoke(channels.terminalDetach, 't1');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS * 2);

    expect(detach).toHaveBeenCalledWith('t1');
    expect(sendTo).not.toHaveBeenCalled();
  });

  it("Should send a terminal's output only to the window that attached it", async () => {
    await invokeFrom(1, channels.terminalAttach, 'a', {cols: 80, rows: 24});
    await invokeFrom(2, channels.terminalAttach, 'b', {cols: 80, rows: 24});

    sinks.get('a')!.data('t-a', 'x');
    sinks.get('b')!.data('t-b', 'y');
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS);
    sinks.get('b')!.exit('t-b', 0);

    expect(sendTo.mock.calls).toEqual([
      [1, channels.terminalData, {terminalId: 't-a', data: 'x'}],
      [2, channels.terminalData, {terminalId: 't-b', data: 'y'}],
      [2, channels.terminalExit, {terminalId: 't-b', exitCode: 0}],
    ]);
    expect(send).not.toHaveBeenCalled();
  });

  it("Should drop only the reset window's buffers and terminals", async () => {
    await invokeFrom(1, channels.terminalAttach, 'a', {cols: 80, rows: 24});
    await invokeFrom(1, channels.terminalAttach, 'c', {cols: 80, rows: 24});
    await invokeFrom(2, channels.terminalAttach, 'b', {cols: 80, rows: 24});
    sinks.get('a')!.data('t-a', 'x');
    sinks.get('b')!.data('t-b', 'y');

    handler.reset(1);
    vi.advanceTimersByTime(TERMINAL_FLUSH_MS * 2);

    expect(detach.mock.calls).toEqual([['t-a'], ['t-c']]);
    expect(sendTo.mock.calls).toEqual([
      [2, channels.terminalData, {terminalId: 't-b', data: 'y'}],
    ]);

    handler.reset(1);
    expect(detach).toHaveBeenCalledTimes(2);
  });

  it('Should not detach again on reset a terminal that exited or was detached', async () => {
    await invoke(channels.terminalAttach, 'a', {cols: 80, rows: 24});
    await invoke(channels.terminalAttach, 'c', {cols: 80, rows: 24});
    sinks.get('a')!.exit('t-a', 0);
    await invoke(channels.terminalDetach, 't-c');
    detach.mockClear();

    handler.reset(1);

    expect(detach).not.toHaveBeenCalled();
  });

  it('Should detach an id that has nothing pending', async () => {
    await invoke(channels.terminalDetach, 'ghost');

    expect(detach).toHaveBeenCalledWith('ghost');
  });

  it('Should forward input and resize to TerminalService', () => {
    emit(channels.terminalInput, 't1', 'ls\r');
    emit(channels.terminalResize, 't1', {cols: 100, rows: 30});

    expect(write).toHaveBeenCalledWith('t1', 'ls\r');
    expect(resize).toHaveBeenCalledWith('t1', {cols: 100, rows: 30});
  });

  it('Should never throw out of the sink when the broadcast fails', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    sendTo.mockImplementation(() => {
      throw new Error('window destroyed');
    });
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.data('t1', 'a');
    expect(() => vi.advanceTimersByTime(TERMINAL_FLUSH_MS)).not.toThrow();
    sink.data('t1', 'b');
    expect(() => sink.exit('t1', 1)).not.toThrow();

    expect(logged).toHaveBeenCalledTimes(3);
  });

  it('Should log non-Error failures from the broadcast', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    sendTo.mockImplementation(() => {
      throw 'boom';
    });
    await invoke(channels.terminalAttach, 'sess', {cols: 80, rows: 24});

    sink.exit('t1', 1);

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
