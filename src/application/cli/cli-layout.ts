import {basename, join, resolve} from 'node:path';

import {userDataFolder} from '../../core/domain/app-data';

export type CliLayout = {
  // The checkout Electron opens as the app; null on the installed app.
  appDir: string | null;
  // Electron's userData for this build on macOS; only read by the CLI.
  userData: string;
};

// `dirname` is the directory of the built CLI (`<root>/out/main`). Installed,
// <root> is the bundle's `app.asar`.
export const cliLayout = (dirname: string, home: string): CliLayout => {
  const root = resolve(dirname, '../..');
  const packaged = basename(root) === 'app.asar';
  return {
    appDir: packaged ? null : root,
    userData: join(
      home,
      'Library',
      'Application Support',
      userDataFolder(packaged),
    ),
  };
};
