export abstract class EditorLauncher {
  abstract open(path: string): Promise<void>;
}
