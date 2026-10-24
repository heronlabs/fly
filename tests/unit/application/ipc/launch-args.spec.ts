import {launchFolder} from '../../../../src/application/ipc/launch-args';

const app = {cwd: '/home/me', defaultApp: true};

describe('launchFolder', () => {
  it('Should take the folder after the app dir of a checkout launch', () =>
    expect(launchFolder(['/e/Electron', '/w/fly', '/w/repo'], app)).toBe(
      '/w/repo',
    ));

  it('Should drop Electron and Chromium switches wherever they are', () =>
    expect(
      launchFolder(
        [
          '/e/Electron',
          '--inspect=5858',
          '.',
          '--remote-debugging-port=9222',
          '-psn_0_1',
          'repo',
        ],
        app,
      ),
    ).toBe('/home/me/repo'));

  it('Should be null without a folder', () =>
    expect(launchFolder(['/e/Electron', '.', '--no-sandbox'], app)).toBeNull());

  it('Should take the first argument of a packaged app', () =>
    expect(
      launchFolder(['/A/fly', 'repo', 'other'], {
        cwd: '/home/me',
        defaultApp: false,
      }),
    ).toBe('/home/me/repo'));
});
