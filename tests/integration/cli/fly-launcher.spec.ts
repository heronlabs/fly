import {spawnSync} from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

// A fake checkout: the real bin/fly and install script, a stub Electron that
// prints what it was run with, and an empty out/main/cli.js.
describe('bin/fly and scripts/install-cli.sh (real sh)', () => {
  let dir: string;
  let checkout: string;
  let electron: string;

  const executable = (path: string, content: string) => {
    writeFileSync(path, content);
    chmodSync(path, 0o755);
  };
  const run = (file: string, args: string[], env: NodeJS.ProcessEnv = {}) =>
    spawnSync(file, args, {
      encoding: 'utf8',
      env: {PATH: process.env['PATH'], HOME: join(dir, 'home'), ...env},
    });

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'fly-bin-')));
    checkout = join(dir, 'checkout');
    const macos = join(
      checkout,
      'node_modules/electron/dist/Electron.app/Contents/MacOS',
    );
    electron = join(macos, 'Electron');
    for (const sub of ['bin', 'scripts', 'out/main']) {
      mkdirSync(join(checkout, sub), {recursive: true});
    }
    mkdirSync(macos, {recursive: true});
    copyFileSync(resolve('bin/fly'), join(checkout, 'bin/fly'));
    chmodSync(join(checkout, 'bin/fly'), 0o755);
    copyFileSync(
      resolve('scripts/install-cli.sh'),
      join(checkout, 'scripts/install-cli.sh'),
    );
    writeFileSync(
      join(checkout, 'node_modules/electron/path.txt'),
      'Electron.app/Contents/MacOS/Electron',
    );
    executable(
      electron,
      '#!/bin/sh\nprintf \'%s\\n\' "${ELECTRON_RUN_AS_NODE-unset}" "$@"\nexit "${FAKE_EXIT:-0}"\n',
    );
    writeFileSync(join(checkout, 'out/main/cli.js'), '');
  });

  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  it('Should run cli.js on the checkout Electron in Node mode through a relative link', () => {
    mkdirSync(join(dir, 'links'));
    symlinkSync('../checkout/bin/fly', join(dir, 'links/fly'));

    const result = run(join(dir, 'links/fly'), ['start', 'a b']);

    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      ['1', join(checkout, 'out/main/cli.js'), 'start', 'a b', ''].join('\n'),
    );
    expect(result.status).toBe(0);
  });

  it('Should follow a chain of absolute links and keep the exit code', () => {
    symlinkSync(join(checkout, 'bin/fly'), join(dir, 'first'));
    symlinkSync(join(dir, 'first'), join(dir, 'second'));

    const result = run(join(dir, 'second'), ['ls'], {FAKE_EXIT: '5'});

    expect(result.stdout).toBe(
      ['1', join(checkout, 'out/main/cli.js'), 'ls', ''].join('\n'),
    );
    expect(result.status).toBe(5);
  });

  it('Should ask for pnpm install without Electron', () => {
    rmSync(join(checkout, 'node_modules/electron/path.txt'));

    const result = run(join(checkout, 'bin/fly'), []);

    expect(result.stderr).toBe(
      `fly: Electron não encontrado em ${checkout}/node_modules: rode pnpm install em ${checkout}\n`,
    );
    expect(result.status).toBe(1);
  });

  it('Should ask for pnpm install when the Electron binary is missing', () => {
    rmSync(electron);

    const result = run(join(checkout, 'bin/fly'), []);

    expect(result.stderr).toContain('rode pnpm install');
    expect(result.status).toBe(1);
  });

  it('Should ask for pnpm build without the build', () => {
    rmSync(join(checkout, 'out/main/cli.js'));

    const result = run(join(checkout, 'bin/fly'), []);

    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      `fly: build não encontrado em ${checkout}/out: rode pnpm build em ${checkout}\n`,
    );
    expect(result.status).toBe(1);
  });

  it('Should link bin/fly into FLY_BIN_DIR and warn when it is off PATH', () => {
    const bin = join(dir, 'tools/bin');

    const result = run('sh', [join(checkout, 'scripts/install-cli.sh')], {
      FLY_BIN_DIR: bin,
    });

    expect(readlinkSync(join(bin, 'fly'))).toBe(join(checkout, 'bin/fly'));
    expect(result.stdout).toBe(`fly instalado em ${bin}/fly\n`);
    expect(result.stderr).toBe(
      `aviso: ${bin} não está no PATH; adicione ao shell: export PATH="${bin}:$PATH"\n`,
    );
    expect(result.status).toBe(0);
  });

  it('Should default to ~/.local/bin and stay quiet when it is on PATH', () => {
    const bin = join(dir, 'home/.local/bin');

    const result = run('sh', [join(checkout, 'scripts/install-cli.sh')], {
      PATH: `${bin}:${process.env['PATH']}`,
    });

    expect(readlinkSync(join(bin, 'fly'))).toBe(join(checkout, 'bin/fly'));
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });
});
