import {resolve} from 'node:path';

// The folder of `fly <pasta>` in an Electron argv. Electron and Chromium
// switches are dropped, and so is the app dir when Electron runs a checkout
// (`electron <app-dir> <pasta>`, process.defaultApp), in dev and from bin/fly.
export const launchFolder = (
  argv: readonly string[],
  options: {cwd: string; defaultApp: boolean},
): string | null => {
  const positional = argv.slice(1).filter(arg => !arg.startsWith('-'));
  const folder = positional[options.defaultApp ? 1 : 0];
  return folder === undefined ? null : resolve(options.cwd, folder);
};
