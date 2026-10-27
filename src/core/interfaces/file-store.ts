export type DirEntry = {name: string; isDirectory: boolean; isFile: boolean};
export type FileStat = {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
};

export abstract class FileStore {
  abstract readDir(path: string): Promise<DirEntry[]>;
  abstract realPath(path: string): Promise<string>;
  abstract exists(path: string): Promise<boolean>;
  abstract readText(path: string): Promise<string>;
  abstract writeText(path: string, content: string): Promise<void>;
  // Exclusive create: rejects (EEXIST) when any entry already has that name,
  // a symlink included, dangling or not, so a link is never followed.
  abstract createText(path: string, content: string): Promise<void>;
  // Rejects when the path does not exist (ENOENT).
  abstract stat(path: string): Promise<FileStat>;
  // Replaces `to` atomically when it exists (same filesystem).
  abstract rename(from: string, to: string): Promise<void>;
}
