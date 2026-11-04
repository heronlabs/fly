import type {Platform} from '../domain/platform';

export abstract class AppRuntime {
  abstract readonly bundlePath: string | null;
  abstract readonly version: string;
  abstract readonly platform: Platform;
}
