import type {Platform} from './platform';

// Where the installed app lives, where `fly` sits inside it (relative to
// appPath) and the link on PATH that the setup wizard checks and repairs.
export type InstallLayout = {
  appPath: string;
  launcher: string;
  commandLink: string;
};
export const INSTALL_LAYOUTS: Record<Platform, InstallLayout> = {
  mac: {
    appPath: '/Applications/fly.app',
    launcher: 'Contents/Resources/bin/fly',
    commandLink: '/usr/local/bin/fly',
  },
  // electron-builder's deb installs to /opt/<productName>; the package's
  // post-install links /usr/bin/fly to the launcher.
  linux: {
    appPath: '/opt/fly',
    launcher: 'resources/bin/fly',
    commandLink: '/usr/bin/fly',
  },
};
export const MIN_CLAUDE_VERSION = '2.1.309';
// The oldest gh checked to have every flag and --json field fly uses (Debian
// 12's); Ubuntu 22.04's apt gh 2.4.0 lacks `run rerun --failed` and headRefOid.
export const MIN_GH_VERSION = '2.23.0';
export const FLY_RELEASES_API = 'repos/heronlabs/fly/releases/latest';

export type ToolId = 'git' | 'gh' | 'tmux' | 'claude';
export type ToolFix =
  {kind: 'brew'; formula: string} | {kind: 'copy'; command: string};
export type ToolCheck = {
  id: ToolId;
  ok: boolean;
  version: string | null;
  problem: string | null;
  fix: ToolFix | null;
};
export type DoctorReport = {tools: ToolCheck[]; brew: boolean};
export type CommandState = 'installed' | 'missing' | 'other';
export type InstallerImage = {imagePath: string; mountPoint: string};
export type SetupInfo = {
  packaged: boolean;
  inInstallDir: boolean;
  bundlePath: string | null;
  open: boolean;
};
export type UpdateNotice = {version: string; url: string};
