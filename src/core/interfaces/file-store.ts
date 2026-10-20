export type DirEntry = {name: string; isDirectory: boolean; isFile: boolean};

export abstract class FileStore {
  abstract readDir(path: string): Promise<DirEntry[]>;
  abstract realPath(path: string): Promise<string>;
  abstract exists(path: string): Promise<boolean>;
  abstract readText(path: string): Promise<string>;
  abstract writeText(path: string, content: string): Promise<void>;
}
