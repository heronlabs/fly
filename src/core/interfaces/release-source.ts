export abstract class ReleaseSource {
  abstract latest(): Promise<{version: string; url: string}>;
}
