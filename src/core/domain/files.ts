export type FileFlag = 'A' | 'M' | 'D';
export type FileEntryKind = 'dir' | 'file';
export type FileEntry = {name: string; kind: FileEntryKind};
export type Eol = 'lf' | 'crlf';
export type FileContent =
  | {kind: 'text'; path: string; text: string; eol: Eol; mtimeMs: number}
  | {kind: 'binary'; path: string}
  | {kind: 'large'; path: string; bytes: number};
export type FilesPoll = {
  flags: Record<string, FileFlag>;
  mtimes: Record<string, number | null>;
  error: string | null;
};
export type WriteResult = {mtimeMs: number};
