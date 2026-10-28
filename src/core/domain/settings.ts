export type ThemeMode = 'system' | 'dark' | 'light';
export type DiffPanelMode = 'open' | 'collapsed';
export type ExplorerMode = 'open' | 'collapsed';
export type AppConfig = {
  recentRoots: string[];
  theme: ThemeMode;
  diffPanel: DiffPanelMode;
  explorer: ExplorerMode;
  setupDone: boolean;
};
export const defaultConfig: AppConfig = {
  recentRoots: [],
  theme: 'system',
  diffPanel: 'open',
  explorer: 'open',
  setupDone: false,
};
export const maxRecentRoots = 10;
