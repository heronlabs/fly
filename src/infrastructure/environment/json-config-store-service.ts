import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {
  AppConfig,
  defaultConfig,
  DiffPanelMode,
  maxRecentRoots,
  ThemeMode,
} from '../../core/domain/settings';
import {ConfigStore} from '../../core/interfaces/config-store';
import {FileStore} from '../../core/interfaces/file-store';
import {USER_DATA_DIR} from './tokens';

const themes: readonly string[] = ['system', 'dark', 'light'];
const diffPanelModes: readonly string[] = ['open', 'collapsed'];

const freshDefaults = (): AppConfig => structuredClone(defaultConfig);

const coerce = (value: unknown): AppConfig => {
  // Arrays and primitives have neither field, so they coerce to the defaults.
  const {recentRoots, theme, diffPanel} = (value ?? {}) as Record<
    string,
    unknown
  >;
  return {
    recentRoots: Array.isArray(recentRoots)
      ? recentRoots
          .filter((root): root is string => typeof root === 'string')
          .slice(0, maxRecentRoots)
      : [],
    theme: themes.includes(theme as string)
      ? (theme as ThemeMode)
      : defaultConfig.theme,
    diffPanel: diffPanelModes.includes(diffPanel as string)
      ? (diffPanel as DiffPanelMode)
      : defaultConfig.diffPanel,
  };
};

@Injectable()
export class JsonConfigStoreService extends ConfigStore {
  private readonly path: string;

  constructor(
    @Inject(USER_DATA_DIR) dir: string,
    private readonly fileStore: FileStore,
  ) {
    super();
    this.path = join(dir, 'config.json');
  }

  async load(): Promise<AppConfig> {
    try {
      if (!(await this.fileStore.exists(this.path))) {
        return freshDefaults();
      }
      return coerce(JSON.parse(await this.fileStore.readText(this.path)));
    } catch {
      return freshDefaults();
    }
  }

  async save(config: AppConfig): Promise<void> {
    await this.fileStore.writeText(this.path, JSON.stringify(config, null, 2));
  }
}
