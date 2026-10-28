export const APPLICATIONS_BUNDLE = '/Applications/fly.app';
export const COMMAND_LINK = '/usr/local/bin/fly';
export const LAUNCHER_IN_BUNDLE = 'Contents/Resources/bin/fly';
export const MIN_CLAUDE_VERSION = '2.1.309';
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
  inApplications: boolean;
  bundlePath: string | null;
  open: boolean;
};
export type UpdateNotice = {version: string; url: string};
