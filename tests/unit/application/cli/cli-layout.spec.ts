import {cliLayout} from '../../../../src/application/cli/cli-layout';

describe('cliLayout', () => {
  it('Should read a checkout layout', () => {
    expect(cliLayout('/repo/out/main', '/h')).toEqual({
      appDir: '/repo',
      userData: '/h/Library/Application Support/fly-dev',
    });
  });

  it('Should read the installed bundle', () => {
    expect(
      cliLayout(
        '/Applications/fly.app/Contents/Resources/app.asar/out/main',
        '/h',
      ),
    ).toEqual({
      appDir: null,
      userData: '/h/Library/Application Support/fly',
    });
  });

  it('Should not take a folder named like the asar for the bundle', () => {
    expect(cliLayout('/x/app.asar.bak/out/main', '/h').appDir).toBe(
      '/x/app.asar.bak',
    );
  });
});
