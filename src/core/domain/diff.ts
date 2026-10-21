export type DiffScope = 'live' | 'branch';

export type DiffLineKind = 'context' | 'add' | 'del';

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
};

export type DiffHunk = {header: string; lines: DiffLine[]};

export type DiffFileStatus = 'added' | 'deleted' | 'modified' | 'renamed';

export type DiffFile = {
  path: string;
  oldPath: string | null;
  status: DiffFileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  lines: number;
  hunks: DiffHunk[];
  truncated: boolean;
};

export type Diff = {files: DiffFile[]; truncated: boolean};

export type WorktreeDiff = {
  worktreeId: string;
  scope: DiffScope;
  base: string | null;
  diff: Diff | null;
  error: string | null;
};
