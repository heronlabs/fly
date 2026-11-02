import {basename, join, resolve} from 'node:path';

import {userDataFolder} from '../../core/domain/app-data';
import type {Platform} from '../../core/domain/platform';

export type CliLayout = {
  // The checkout Electron opens as the app; null on the installed app.
  appDir: string | null;
  // Electron's userData for this build; only read by the CLI.
  userData: string;
};

// Electron's appData: ~/Library/Application Support on macOS; on Linux
// $XDG_CONFIG_HOME, or ~/.config when it is unset or empty.
const appData = (home: string, platform: Platform, configHome?: string) =>
  platform === 'mac'
    ? join(home, 'Library', 'Application Support')
    : configHome || join(home, '.config');

// `dirname` is the directory of the built CLI (`<root>/out/main`). Installed,
// <root> is the bundle's `app.asar`.
export const cliLayout = (
  dirname: string,
  home: string,
  platform: Platform,
  configHome?: string,
): CliLayout => {
  const root = resolve(dirname, '../..');
  const packaged = basename(root) === 'app.asar';
  return {
    appDir: packaged ? null : root,
    userData: join(
      appData(home, platform, configHome),
      userDataFolder(packaged),
    ),
  };
};
