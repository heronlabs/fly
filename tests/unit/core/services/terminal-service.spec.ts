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

  describe('hasDraft', () => {
    it('Should follow typing, submit and cancel per session', () => {
      const id = service.attach('s1', size, sink);

      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'ab\rcd');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'x\x03');
      expect(service.hasDraft('s1')).toBe(false);
    });

    it('Should look only after the last submit or cancel', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, 'a\x03b\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'a\rb\x03');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\rx\x03y');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'a\x03b\rc');
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should leave the draft unchanged for control-only data', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[A');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc');
      service.write(id, '\x1b[A');
      service.write(id, '\x7f\n\t');
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should ignore escape sequences, also after a submit', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[1;5C\x1b[?25h\x1b[ q');
      service.write(id, '\x1bOA\x1bOP');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'ab\r\x1b[A\x1bOB');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\x1b[Ax');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\x1bOA');
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should keep drafts per session, and across detach', () => {
      const a = service.attach('a', size, sink);
      const b = service.attach('b', size, sink);

      service.write(a, 'x');
      expect(service.hasDraft('a')).toBe(true);
      expect(service.hasDraft('b')).toBe(false);
      service.write(b, 'y');
      service.write(b, '\r');
      service.detach(a);
      expect(service.hasDraft('a')).toBe(true);
      expect(service.hasDraft('b')).toBe(false);
    });

    it('Should share the draft between terminals of one session', () => {
      const first = service.attach('s1', size, sink);
      const second = service.attach('s1', size, sink);

      service.write(first, 'x');
      service.write(second, '\r');

      expect(service.hasDraft('s1')).toBe(false);
    });

    it('Should return false for an unknown session and ignore writes to unknown terminals', () => {
      service.write('nope', 'x');

      expect(service.hasDraft('nope')).toBe(false);
    });

    it('Should treat a bracketed paste as a draft, whatever newlines it holds', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[200~text\r\x1b[201~');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\x1b[200~a\x03b\x1b[201~');
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should follow a paste split across writes', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[200~te');
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'xt\x1b[201~');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(false);
    });

    it('Should keep an open paste per session', () => {
      const a = service.attach('a', size, sink);
      const b = service.attach('b', size, sink);

      service.write(a, '\x1b[200~x');
      service.write(b, '\r');
      service.write(b, 'y');
      service.write(b, '\r');

      expect(service.hasDraft('b')).toBe(false);
      expect(service.hasDraft('a')).toBe(true);
    });

    it('Should leave the draft unchanged for an empty paste', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[200~\x1b[201~');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc');
      service.write(id, '\x1b[200~\x1b[201~');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\r\x1b[200~\x1b[201~');
      expect(service.hasDraft('s1')).toBe(false);
    });

    it('Should text typed after a paste ends count again', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[200~x\x1b[201~\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\x1b[200~x\x1b[201~y');
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should read Alt+Enter and Shift+Enter as a newline, not a submit', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, 'abc\x1b\r');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'def\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc\x1b\r');
      service.write(id, '\x1b\n');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'abc\x1b\rdef\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\x1b\r');
      expect(service.hasDraft('s1')).toBe(false);
    });

    it('Should ignore SGR and X10 mouse reports', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, '\x1b[<0;10;5M\x1b[<0;10;5m');
      service.write(id, '\x1b[M !!');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc');
      service.write(id, '\x1b[<64;10;5M');
      service.write(id, '\x1b[M`!!');
      service.write(id, '\x1b[M\r\x03\x03');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, '\r\x1b[<0;1;1M\x1b[M   ');
      expect(service.hasDraft('s1')).toBe(false);
    });

    it.each([
      ['an OSC 11 reply ended by ST', '\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\'],
      ['an OSC 10 reply ended by BEL', '\x1b]10;rgb:cccc/cccc/cccc\x07'],
      ['a DCS reply', '\x1bP1$r0m\x1b\\'],
      ['an APC string', '\x1b_Gi=1;OK\x1b\\'],
    ])('Should not read %s as a draft', (_name, reply) => {
      const id = service.attach('s1', size, sink);

      service.write(id, reply);
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'abc');
      service.write(id, reply);
      expect(service.hasDraft('s1')).toBe(true);
    });

    it('Should read a backslash then Enter as a newline, even across writes', () => {
      const id = service.attach('s1', size, sink);

      service.write(id, 'abc\\');
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(true);
      service.write(id, 'def\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\\x');
      service.write(id, '\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'a\\\r\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\\\x03\r');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\\');
      service.write(id, '\x03');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, 'x\r');
      service.write(id, '\x7f\n');
      expect(service.hasDraft('s1')).toBe(false);
      service.write(id, '\\\x1b[200~p\x1b[201~\r');
      expect(service.hasDraft('s1')).toBe(false);
    });
  });
});
