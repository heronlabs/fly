import {windowChrome} from '../../../../src/application/ipc/window-chrome';

describe('windowChrome', () => {
  it('Should inset the traffic lights on mac', () => {
    expect(windowChrome('mac', '/i.png')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: {x: 14, y: 14},
    });
  });

  it('Should keep the native frame on Linux, with the menu bar on Alt and the icon', () => {
    expect(windowChrome('linux', '/i.png')).toEqual({
      autoHideMenuBar: true,
      icon: '/i.png',
    });
  });
});
