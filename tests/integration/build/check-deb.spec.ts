import {spawnSync} from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

// The real scripts/check-deb.sh with a stub sudo that records each command and
// fails the install, so the script stops before it touches the machine.
describe('scripts/check-deb.sh (real sh)', () => {
  let dir: string;
  let log: string;

  const run = (args: string[]) =>
    spawnSync('sh', [resolve('scripts/check-deb.sh'), ...args], {
      encoding: 'utf8',
      cwd: dir,
      env: {PATH: `${join(dir, 'bin')}:${process.env['PATH']}`, LOG: log},
    });

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-check-deb-')));
    log = join(dir, 'sudo.log');
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/fly-1.0.0-arm64.deb'), '');
    writeFileSync(
      join(dir, 'bin/sudo'),
      '#!/bin/sh\necho "$*" >> "$LOG"\n[ "$2" != install ]\n',
    );
    chmodSync(join(dir, 'bin/sudo'), 0o755);
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should refresh the package index, then install the deb by its absolute path', () => {
    const result = run(['dist/fly-1.0.0-arm64.deb']);

    expect(readFileSync(log, 'utf8').split('\n')).toEqual([
      'apt-get update',
      `apt-get install -y --no-install-recommends ${dir}/dist/fly-1.0.0-arm64.deb`,
      '',
    ]);
    expect(result.status).not.toBe(0);
  });

  it('Should refuse to run without exactly one existing deb', () => {
    for (const args of [[], ['dist/missing.deb'], ['a.deb', 'b.deb']]) {
      const result = run(args);

      expect(result.stderr).toBe('uso: check-deb.sh <arquivo .deb>\n');
      expect(result.status).toBe(2);
    }
    expect(() => readFileSync(log)).toThrow();
  });
});
