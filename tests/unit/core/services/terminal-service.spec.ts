import {IdGenerator} from '../../../../src/core/interfaces/id-generator';
import {SessionLauncher} from '../../../../src/core/interfaces/session-launcher';
import {
  TerminalProcess,
  TerminalSpawner,
} from '../../../../src/core/interfaces/terminal-spawner';
import {
  TerminalService,
  TerminalSink,
} from '../../../../src/core/services/terminal-service';

type FakeProcess = TerminalProcess & {
  emitData(data: string): void;
  emitExit(code: number): void;
};

const fakeProcess = (): FakeProcess => {
  let onData: (data: string) => void = () => undefined;
  let onExit: (code: number) => void = () => undefined;
  return {
    onData: vi.fn(listener => {
      onData = listener;
    }),
    onExit: vi.fn(listener => {
      onExit = listener;
    }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    emitData: data => onData(data),
    emitExit: code => onExit(code),
  };
};

describe('TerminalService', () => {
  const size = {cols: 80, rows: 24};
  let launcher: SessionLauncher;
  let spawner: TerminalSpawner;
  let ids: IdGenerator;
  let processes: FakeProcess[];
  let service: TerminalService;
  let sink: TerminalSink;

  beforeEach(() => {
    processes = [];
    launcher = {
      attachCommand: vi.fn(() => ({file: 'tmux', args: ['attach']})),
    } as unknown as SessionLauncher;
    spawner = {
      spawn: vi.fn(() => {
        const p = fakeProcess();
        processes.push(p);
        return p;
      }),
    } as unknown as TerminalSpawner;
    let n = 0;
    ids = {uuid: vi.fn(() => `t${++n}`)} as unknown as IdGenerator;
    service = new TerminalService(launcher, spawner, ids);
    sink = {data: vi.fn(), exit: vi.fn()};
  });

  it('Should spawn the attach command of the session with the size', () => {
    const id = service.attach('s1', size, sink);

    expect(id).toBe('t1');
    expect(launcher.attachCommand).toHaveBeenCalledWith('s1');
    expect(spawner.spawn).toHaveBeenCalledWith('tmux', ['attach'], size);
  });

  it('Should forward data and exit with the terminal id', () => {
    const id = service.attach('s1', size, sink);

    processes[0]!.emitData('abc');
    processes[0]!.emitExit(3);

    expect(sink.data).toHaveBeenCalledWith(id, 'abc');
    expect(sink.exit).toHaveBeenCalledWith(id, 3);
  });

  it('Should write and resize the right process, clamping the size', () => {
    const a = service.attach('a', size, sink);
    const b = service.attach('b', size, sink);

    service.write(b, 'x');
    service.resize(a, {cols: 0.5, rows: -1});
    service.resize(b, {cols: 100.9, rows: 30});

    expect(processes[1]!.write).toHaveBeenCalledWith('x');
    expect(processes[0]!.write).not.toHaveBeenCalled();
    expect(processes[0]!.resize).toHaveBeenCalledWith({cols: 2, rows: 2});
    expect(processes[1]!.resize).toHaveBeenCalledWith({cols: 100, rows: 30});
  });

  it('Should ignore unknown ids', () => {
    service.write('nope', 'x');
    service.resize('nope', size);
    service.detach('nope');

    expect(processes).toHaveLength(0);
  });

  it('Should kill only the detached process and ignore later writes', () => {
    const a = service.attach('a', size, sink);
    service.attach('b', size, sink);

    service.detach(a);
    service.write(a, 'x');

    expect(processes[0]!.kill).toHaveBeenCalledTimes(1);
    expect(processes[1]!.kill).not.toHaveBeenCalled();
    expect(processes[0]!.write).not.toHaveBeenCalled();
  });

  it('Should drop late data and exit after detach', () => {
    service.attach('a', size, sink);
    const id = service.attach('b', size, sink);
    service.detach(id);

    processes[1]!.emitData('late');
    processes[1]!.emitExit(1);

    expect(sink.data).not.toHaveBeenCalled();
    expect(sink.exit).not.toHaveBeenCalled();
  });

  it('Should kill every process on detachAll and drop late events', () => {
    const a = service.attach('a', size, sink);
    service.attach('b', size, sink);

    service.detachAll();
    processes[0]!.emitData('late');
    processes[1]!.emitExit(0);
    service.write(a, 'x');

    expect(processes[0]!.kill).toHaveBeenCalledTimes(1);
    expect(processes[1]!.kill).toHaveBeenCalledTimes(1);
    expect(sink.data).not.toHaveBeenCalled();
    expect(sink.exit).not.toHaveBeenCalled();
    expect(processes[0]!.write).not.toHaveBeenCalled();
  });

  it('Should remove the id when the process exits', () => {
    const id = service.attach('a', size, sink);

    processes[0]!.emitExit(0);
    service.write(id, 'x');
    service.detach(id);

    expect(processes[0]!.write).not.toHaveBeenCalled();
    expect(processes[0]!.kill).not.toHaveBeenCalled();
  });
});
