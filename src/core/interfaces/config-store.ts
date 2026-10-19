import {AppConfig} from '../domain/settings';

export abstract class ConfigStore {
  abstract load(): Promise<AppConfig>;
  abstract save(config: AppConfig): Promise<void>;
}
