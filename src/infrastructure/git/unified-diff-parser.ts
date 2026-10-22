import {DiffFile, DiffHunk, DiffLineKind} from '../../core/domain/diff';

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DEV_NULL = '/dev/null';
const GIT_HEADER = 'diff --git ';
const QUOTED = /^"(?:[^"\\]|\\.)*"/;
const ESCAPE_PIECES = /\\([0-7]{3})|\\?./gs;
const ESCAPES: Record<string, string> = {
  '\\t': '\t',
  '\\n': '\n',
  '\\r': '\r',
};

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

const unquote = (value: string): string => {
  if (!QUOTED.test(value)) {
    return value;
  }
  const bytes = [...value.slice(1, -1).matchAll(ESCAPE_PIECES)].map(
    ([piece, octal]) =>
      Buffer.from(
        octal ? [parseInt(octal, 8)] : (ESCAPES[piece] ?? piece.slice(-1)),
      ),
  );
  return Buffer.concat(bytes).toString('utf8');
};

const headerPathOf = (names: string): string => {
  const quoted = QUOTED.exec(names);
  if (quoted) {
    return unquote(names.slice(quoted[0].length + 1)).slice(2);
  }
  const middle = (names.length - 1) / 2;
  const right = names.slice(middle + 1);
  if (
    right.startsWith('b/') &&
    names.slice(0, middle) === `a/${right.slice(2)}`
  ) {
    return right.slice(2);
  }
  return names.slice(names.indexOf(' b/') + ' b/'.length);
};

const startDraft = (line: string): Draft => {
  const headerPath = headerPathOf(line.slice(GIT_HEADER.length));
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
  return name === DEV_NULL ? null : unquote(name).slice(2);
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
      file.oldPath = unquote(line.slice('rename from '.length));
    } else if (line.startsWith('rename to ')) {
      draft.renameTo = unquote(line.slice('rename to '.length));
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
