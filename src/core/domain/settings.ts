export type ThemeMode = 'system' | 'dark' | 'light';
export type DiffPanelMode = 'open' | 'collapsed';
export type AppConfig = {
  recentRoots: string[];
  theme: ThemeMode;
  diffPanel: DiffPanelMode;
};
export const defaultConfig: AppConfig = {
  recentRoots: [],
  theme: 'system',
  diffPanel: 'open',
};
export const maxRecentRoots = 10;
