import {cliLayout} from '../../../../src/application/cli/cli-layout';

describe('cliLayout', () => {
  it('Should read a checkout layout', () => {
    expect(cliLayout('/repo/out/main', '/h', 'mac')).toEqual({
      appDir: '/repo',
      userData: '/h/Library/Application Support/fly-dev',
    });
  });

  it('Should read the installed bundle', () => {
    expect(
      cliLayout(
        '/Applications/fly.app/Contents/Resources/app.asar/out/main',
        '/h',
        'mac',
      ),
    ).toEqual({
      appDir: null,
      userData: '/h/Library/Application Support/fly',
    });
  });

  it('Should not take a folder named like the asar for the bundle', () => {
    expect(cliLayout('/x/app.asar.bak/out/main', '/h', 'mac').appDir).toBe(
      '/x/app.asar.bak',
    );
  });

  it('Should ignore XDG_CONFIG_HOME on mac', () => {
    expect(cliLayout('/repo/out/main', '/h', 'mac', '/x').userData).toBe(
      '/h/Library/Application Support/fly-dev',
    );
  });

  it('Should read ~/.config on Linux', () => {
    expect(
      cliLayout('/opt/fly/resources/app.asar/out/main', '/h', 'linux'),
    ).toEqual({appDir: null, userData: '/h/.config/fly'});
  });

  it('Should follow XDG_CONFIG_HOME', () => {
    expect(
      cliLayout('/opt/fly/resources/app.asar/out/main', '/h', 'linux', '/x')
        .userData,
    ).toBe('/x/fly');
  });

  it('Should ignore an empty XDG_CONFIG_HOME', () => {
    expect(
      cliLayout('/opt/fly/resources/app.asar/out/main', '/h', 'linux', '')
        .userData,
    ).toBe('/h/.config/fly');
  });

  it('Should use fly-dev for a Linux checkout', () => {
    expect(cliLayout('/repo/out/main', '/h', 'linux')).toEqual({
      appDir: '/repo',
      userData: '/h/.config/fly-dev',
    });
  });
});
