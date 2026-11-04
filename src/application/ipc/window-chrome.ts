import type {BrowserWindowConstructorOptions} from 'electron';

import type {Platform} from '../../core/domain/platform';

// The BrowserWindow options that differ by system. macOS hides the title bar
// and insets the traffic lights into the top bar; Linux keeps its native frame
// (the menu bar shows on Alt) and needs the window icon set explicitly.
export const windowChrome = (
  platform: Platform,
  iconPath: string,
): BrowserWindowConstructorOptions =>
  platform === 'mac'
    ? {titleBarStyle: 'hiddenInset', trafficLightPosition: {x: 14, y: 14}}
    : {autoHideMenuBar: true, icon: iconPath};
