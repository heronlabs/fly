export type ThemeMode = 'system' | 'dark' | 'light';
export type DiffPanelMode = 'open' | 'collapsed';
export type ExplorerMode = 'open' | 'collapsed';
export type AppConfig = {
  recentRoots: string[];
  theme: ThemeMode;
  diffPanel: DiffPanelMode;
  explorer: ExplorerMode;
};
export const defaultConfig: AppConfig = {
  recentRoots: [],
  theme: 'system',
  diffPanel: 'open',
  explorer: 'open',
};
export const maxRecentRoots = 10;
