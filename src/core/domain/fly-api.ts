export const channels = {
  workspacePickFolder: 'workspace:pick-folder',
  workspaceOpen: 'workspace:open',
  workspaceRefresh: 'workspace:refresh',
  workspaceChanged: 'workspace:changed',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  shellOpenInEditor: 'shell:open-in-editor',
} as const;

export type Channel = (typeof channels)[keyof typeof channels];
