export type ThemeMode = 'system' | 'dark' | 'light';
export type AppConfig = {recentRoots: string[]; theme: ThemeMode};
export const defaultConfig: AppConfig = {recentRoots: [], theme: 'system'};
export const maxRecentRoots = 10;
