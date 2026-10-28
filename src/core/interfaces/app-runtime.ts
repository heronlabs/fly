export abstract class AppRuntime {
  abstract readonly bundlePath: string | null;
  abstract readonly version: string;
}
