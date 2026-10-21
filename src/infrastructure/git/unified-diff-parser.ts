import {DiffFile, DiffHunk, DiffLineKind} from '../../core/domain/diff';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DEV_NULL = '/dev/null';
const GIT_HEADER = 'diff --git a/';
const LINE_KINDS: Record<string, DiffLineKind> = {
  ' ': 'context',
  '+': 'add',
  '-': 'del',
};

type Draft = {
  file: Omit<DiffFile, 'path'>;
  headerPath: string;
  renameTo: string | null;
  oldName: string | null;
  newName: string | null;
};

const startDraft = (line: string): Draft => {
  const headerPath = line.slice(line.indexOf(' b/') + ' b/'.length);
  return {
    file: {
      oldPath: null,
      status: 'modified',
      binary: false,
      additions: 0,
      deletions: 0,
      lines: 0,
      hunks: [],
      truncated: false,
    },
    headerPath,
    renameTo: null,
    oldName: null,
    newName: null,
  };
};

const fileName = (value: string): string | null => {
  const name = value.replace(/\t$/, '');
  return name === DEV_NULL ? null : name.slice(2);
};

export const parseUnifiedDiff = (output: string): DiffFile[] => {
  const drafts: Draft[] = [];
  let draft: Draft | undefined;
  let hunk: DiffHunk | undefined;
  let oldNo = 0;
  let newNo = 0;

  for (const line of output.split('\n')) {
    if (line.startsWith(GIT_HEADER)) {
      draft = startDraft(line);
      drafts.push(draft);
      hunk = undefined;
      continue;
    }
    if (!draft) {
      continue;
    }
    const file = draft.file;

    const kind = LINE_KINDS[line.charAt(0)];
    if (hunk && kind) {
      hunk.lines.push({
        kind,
        text: line.slice(1),
        oldNo: kind === 'add' ? null : oldNo++,
        newNo: kind === 'del' ? null : newNo++,
      });
      file.lines++;
      if (kind === 'add') {
        file.additions++;
      } else if (kind === 'del') {
        file.deletions++;
      }
      continue;
    }

    const start = HUNK_HEADER.exec(line);
    if (start) {
      oldNo = Number(start[1]);
      newNo = Number(start[2]);
      hunk = {header: line, lines: []};
      file.hunks.push(hunk);
    } else if (line.startsWith('new file mode ')) {
      file.status = 'added';
    } else if (line.startsWith('deleted file mode ')) {
      file.status = 'deleted';
    } else if (line.startsWith('rename from ')) {
      file.status = 'renamed';
      file.oldPath = line.slice('rename from '.length);
    } else if (line.startsWith('rename to ')) {
      draft.renameTo = line.slice('rename to '.length);
    } else if (line.startsWith('Binary files ')) {
      file.binary = true;
    } else if (line.startsWith('--- ')) {
      draft.oldName = fileName(line.slice('--- '.length));
    } else if (line.startsWith('+++ ')) {
      draft.newName = fileName(line.slice('+++ '.length));
    }
  }

  return drafts.map(({file, renameTo, newName, oldName, headerPath}) => ({
    path: renameTo ?? newName ?? oldName ?? headerPath,
    ...file,
  }));
};
