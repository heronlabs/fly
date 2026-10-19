import {Injectable} from '@nestjs/common';

import {AppConfig, maxRecentRoots} from '../domain/settings';
import {ConfigStore} from '../interfaces/config-store';

@Injectable()
export class SettingsService {
  constructor(private readonly store: ConfigStore) {}

  get(): Promise<AppConfig> {
    return this.store.load();
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.store.load();
    const next: AppConfig = {...current, ...patch};
    await this.store.save(next);
    return next;
  }

  async rememberRoot(root: string): Promise<AppConfig> {
    const current = await this.store.load();
    const recentRoots = [
      root,
      ...current.recentRoots.filter(existing => existing !== root),
    ].slice(0, maxRecentRoots);
    return this.update({recentRoots});
  }
}
