import {fstatSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {NodeProcessLauncherService} from '../../../../src/infrastructure/process/node-process-launcher-service';

// Node itself reports which file each of the child's stdio fds is.
const fdsScript = (compare: string) =>
  `const {fstatSync, statSync, writeFileSync} = require('node:fs');
   const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.rdev === b.rdev;
   writeFileSync(process.argv[1], JSON.stringify([0, 1, 2].map(fd => same(fstatSync(fd), ${compare}))));`;

describe('NodeProcessLauncherService', () => {
  const launcher = new NodeProcessLauncherService();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fly-launcher-'));
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should resolve with the exit code of a foreground process', async () => {
    expect(await launcher.foreground('sh', ['-c', 'exit 3'])).toBe(3);
  });

  it('Should run the foreground process on the caller stdio', async () => {
    const out = join(dir, 'fds.json');
    const parent = JSON.stringify([0, 1, 2].map(fd => fstatSync(fd)));
    const script = fdsScript(`JSON.parse(${JSON.stringify(parent)})[fd]`);

    expect(
      await launcher.foreground(process.execPath, ['-e', script, out]),
    ).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([true, true, true]);
  });

  it('Should resolve 1 when a signal ends the foreground process', async () => {
    expect(await launcher.foreground('sh', ['-c', 'kill -TERM $$'])).toBe(1);
  });

  it('Should reject when the foreground binary does not exist', async () => {
    await expect(
      launcher.foreground('definitely-not-a-binary-xyz', []),
    ).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('Should start a detached process in its own group with the given env', async () => {
    const out = join(dir, 'out.txt');
    await launcher.detached(
      'sh',
      [
        '-c',
        'printf "%s %s %s" "$$" "$(ps -o pgid= -p $$ | tr -d " ")" "$FLY_X" > "$0"',
        out,
      ],
      {PATH: process.env['PATH'], FLY_X: 'y'},
    );

    await vi.waitFor(() => {
      const [pid, pgid, value] = readFileSync(out, 'utf8').split(' ');
      expect(pgid).toBe(pid);
      expect(value).toBe('y');
    });
  });

  it('Should give the detached process no stdio', async () => {
    const out = join(dir, 'fds.json');
    await launcher.detached(
      process.execPath,
      ['-e', fdsScript("statSync('/dev/null')"), out],
      {},
    );

    await vi.waitFor(() =>
      expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([true, true, true]),
    );
  });

  it('Should reject when the detached binary does not exist', async () => {
    await expect(
      launcher.detached('definitely-not-a-binary-xyz', [], {}),
    ).rejects.toMatchObject({code: 'ENOENT'});
  });
});
