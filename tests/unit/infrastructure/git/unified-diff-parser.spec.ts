import {DiffFile} from '../../../../src/core/domain/diff';
import {parseUnifiedDiff} from '../../../../src/infrastructure/git/unified-diff-parser';

const file = (overrides: Partial<DiffFile>): DiffFile => ({
  path: '',
  oldPath: null,
  status: 'modified',
  binary: false,
  additions: 0,
  deletions: 0,
  lines: 0,
  hunks: [],
  truncated: false,
  ...overrides,
});

describe('parseUnifiedDiff', () => {
  it('Should parse a modified file with one hunk', () => {
    const out = `diff --git a/f.txt b/f.txt
index 422c2b7..0f7bc76 100644
--- a/f.txt
+++ b/f.txt
@@ -1,2 +1,2 @@
 a
-b
+c
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({
        path: 'f.txt',
        additions: 1,
        deletions: 1,
        lines: 3,
        hunks: [
          {
            header: '@@ -1,2 +1,2 @@',
            lines: [
              {kind: 'context', text: 'a', oldNo: 1, newNo: 1},
              {kind: 'del', text: 'b', oldNo: 2, newNo: null},
              {kind: 'add', text: 'c', oldNo: null, newNo: 2},
            ],
          },
        ],
      }),
    ]);
  });

  it('Should parse an added file whose path has a space and a trailing tab', () => {
    const out = `diff --git a/new file.txt b/new file.txt
new file mode 100644
index 0000000..45b983b
--- /dev/null
+++ b/new file.txt\t
@@ -0,0 +1 @@
+hi
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({
        path: 'new file.txt',
        status: 'added',
        additions: 1,
        lines: 1,
        hunks: [
          {
            header: '@@ -0,0 +1 @@',
            lines: [{kind: 'add', text: 'hi', oldNo: null, newNo: 1}],
          },
        ],
      }),
    ]);
  });

  it('Should parse a deleted file taking the path from the old side', () => {
    const out = `diff --git a/del.txt b/del.txt
deleted file mode 100644
index b77b4eb..0000000
--- a/del.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-x
-y
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({
        path: 'del.txt',
        status: 'deleted',
        deletions: 2,
        lines: 2,
        hunks: [
          {
            header: '@@ -1,2 +0,0 @@',
            lines: [
              {kind: 'del', text: 'x', oldNo: 1, newNo: null},
              {kind: 'del', text: 'y', oldNo: 2, newNo: null},
            ],
          },
        ],
      }),
    ]);
  });

  it('Should parse a rename with a mode change and its hunk', () => {
    const out = `diff --git a/f.txt b/g.txt
old mode 100644
new mode 100755
similarity index 87%
rename from f.txt
rename to g.txt
index aecbbc4..01f84f8
--- a/f.txt
+++ b/g.txt
@@ -7,3 +7,4 @@ l6
 l7
 l8
 l9
+l10
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({
        path: 'g.txt',
        oldPath: 'f.txt',
        status: 'renamed',
        additions: 1,
        lines: 4,
        hunks: [
          {
            header: '@@ -7,3 +7,4 @@ l6',
            lines: [
              {kind: 'context', text: 'l7', oldNo: 7, newNo: 7},
              {kind: 'context', text: 'l8', oldNo: 8, newNo: 8},
              {kind: 'context', text: 'l9', oldNo: 9, newNo: 9},
              {kind: 'add', text: 'l10', oldNo: null, newNo: 10},
            ],
          },
        ],
      }),
    ]);
  });

  it('Should parse a 100% rename without hunks', () => {
    const out = `diff --git a/s.txt b/t.txt
similarity index 100%
rename from s.txt
rename to t.txt
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({path: 't.txt', oldPath: 's.txt', status: 'renamed'}),
    ]);
  });

  it('Should parse a mode-only change as modified without hunks', () => {
    const out = `diff --git a/mode.txt b/mode.txt
old mode 100644
new mode 100755
`;

    expect(parseUnifiedDiff(out)).toEqual([file({path: 'mode.txt'})]);
  });

  it('Should flag a binary add without hunks', () => {
    const out = `diff --git a/b.bin b/b.bin
new file mode 100644
index 0000000..20b5be9
Binary files /dev/null and b/b.bin differ
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({path: 'b.bin', status: 'added', binary: true}),
    ]);
  });

  it('Should ignore the no-newline marker after a deleted line', () => {
    const out = `diff --git a/nl.txt b/nl.txt
index 4b31686..4faa1d2 100644
--- a/nl.txt
+++ b/nl.txt
@@ -1,2 +1,2 @@
 nn
-q
\\ No newline at end of file
+q
`;

    expect(parseUnifiedDiff(out)).toEqual([
      file({
        path: 'nl.txt',
        additions: 1,
        deletions: 1,
        lines: 3,
        hunks: [
          {
            header: '@@ -1,2 +1,2 @@',
            lines: [
              {kind: 'context', text: 'nn', oldNo: 1, newNo: 1},
              {kind: 'del', text: 'q', oldNo: 2, newNo: null},
              {kind: 'add', text: 'q', oldNo: null, newNo: 2},
            ],
          },
        ],
      }),
    ]);
  });

  it('Should keep the carriage return of CRLF content in the text', () => {
    const out =
      'diff --git a/crlf.txt b/crlf.txt\n' +
      '--- a/crlf.txt\n' +
      '+++ b/crlf.txt\n' +
      '@@ -1,2 +1,2 @@\n' +
      ' c\r\n' +
      '-d\r\n' +
      '+e\r\n';

    expect(parseUnifiedDiff(out)[0]?.hunks[0]?.lines).toEqual([
      {kind: 'context', text: 'c\r', oldNo: 1, newNo: 1},
      {kind: 'del', text: 'd\r', oldNo: 2, newNo: null},
      {kind: 'add', text: 'e\r', oldNo: null, newNo: 2},
    ]);
  });

  it('Should parse several files and hunks, keeping the full hunk header', () => {
    const out = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@ function one() {
-old
+new
@@ -20,2 +20,2 @@ function two() {
 keep
-x
+y
diff --git a/z.ts b/z.ts
index 3333333..4444444 100644
--- a/z.ts
+++ b/z.ts
@@ -5 +5,2 @@
 five
+six
`;

    const files = parseUnifiedDiff(out);

    expect(files.map(f => f.path)).toEqual(['a.ts', 'z.ts']);
    expect(files[0]?.hunks.map(h => h.header)).toEqual([
      '@@ -1 +1 @@ function one() {',
      '@@ -20,2 +20,2 @@ function two() {',
    ]);
    expect(files[0]?.hunks[1]?.lines).toEqual([
      {kind: 'context', text: 'keep', oldNo: 20, newNo: 20},
      {kind: 'del', text: 'x', oldNo: 21, newNo: null},
      {kind: 'add', text: 'y', oldNo: null, newNo: 21},
    ]);
    expect(files[0]).toMatchObject({additions: 2, deletions: 2, lines: 5});
    expect(files[1]).toMatchObject({additions: 1, deletions: 0, lines: 2});
    expect(files[1]?.hunks[0]?.lines[1]).toEqual({
      kind: 'add',
      text: 'six',
      oldNo: null,
      newNo: 6,
    });
  });

  it('Should treat dashed content inside a hunk as a line, not a header', () => {
    const out = `diff --git a/d.md b/d.md
--- a/d.md
+++ b/d.md
@@ -1 +1 @@
--- x
+++ y
`;

    expect(parseUnifiedDiff(out)[0]).toMatchObject({
      path: 'd.md',
      additions: 1,
      deletions: 1,
    });
  });

  it('Should return [] for empty output and ignore text before the first file', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
    expect(parseUnifiedDiff('warning: something\n+++ b/x\n')).toEqual([]);
  });

  it('Should prefer the rename target, then the new name, then the old name, then the header', () => {
    const out = `diff --git a/h1 b/h1
rename from o1
rename to r1
--- a/o1
+++ b/n1
diff --git a/h2 b/h2
--- a/o2
+++ b/n2
diff --git a/h3 b/h3
--- a/o3
+++ /dev/null
diff --git a/h4 b/h4
--- a/o4
diff --git a/h5 b/h5
`;

    expect(parseUnifiedDiff(out).map(f => f.path)).toEqual([
      'r1',
      'n2',
      'o3',
      'o4',
      'h5',
    ]);
  });

  it('Should strip only the trailing tab of a name', () => {
    const out = 'diff --git a/h b/h\n--- a/x\ty\t\n+++ b/x\ty\t\n';

    expect(parseUnifiedDiff(out)[0]?.path).toBe('x\ty');
  });

  it('Should unquote a path containing a double quote', () => {
    const out = `diff --git "a/r\\"q.txt" "b/r\\"q.txt"
index 13e7564..f2b1d0d 100644
--- "a/r\\"q.txt"
+++ "b/r\\"q.txt"
@@ -1 +1,2 @@
 o
+p
`;

    const files = parseUnifiedDiff(out);

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({path: 'r"q.txt', additions: 1, lines: 2});
  });

  it('Should decode octal bytes of a quoted non-ASCII path as UTF-8', () => {
    const out = `diff --git "a/f\\303\\251.txt" "b/f\\303\\251.txt"
index 13e7564..f2b1d0d 100644
--- "a/f\\303\\251.txt"
+++ "b/f\\303\\251.txt"
@@ -1 +1,2 @@
 o
+p
`;

    expect(parseUnifiedDiff(out)[0]?.path).toBe('fé.txt');
  });

  it('Should unquote rename paths and keep quoted files from leaking into neighbours', () => {
    const out = `diff --git a/first.txt b/first.txt
--- a/first.txt
+++ b/first.txt
@@ -1 +1,2 @@
 o
+p
diff --git "a/old \\303\\251.txt" "b/new \\303\\251.txt"
similarity index 100%
rename from "old \\303\\251.txt"
rename to "new \\303\\251.txt"
diff --git "a/a\\\\b.txt" "b/a\\\\b.txt"
new file mode 100644
index 0000000..8ba3a16
--- /dev/null
+++ "b/a\\\\b.txt"
@@ -0,0 +1 @@
+n
`;

    const files = parseUnifiedDiff(out);

    expect(files.map(f => [f.path, f.oldPath, f.lines])).toEqual([
      ['first.txt', null, 2],
      ['new é.txt', 'old é.txt', 0],
      ['a\\b.txt', null, 1],
    ]);
  });

  it('Should decode tab, newline and carriage-return escapes and keep unknown ones', () => {
    const out = 'diff --git "a/t\\tn\\nr\\rz\\q" "b/t\\tn\\nr\\rz\\q"\n';

    expect(parseUnifiedDiff(out)[0]?.path).toBe('t\tn\nr\rzq');
  });

  it('Should read an unquoted b side after a quoted a side', () => {
    expect(parseUnifiedDiff('diff --git "a/x\\ty" b/x\n')[0]?.path).toBe('x');
  });

  it('Should split a mode-only header at the midpoint for a path containing " b/"', () => {
    const out = `diff --git a/x b/y.txt b/x b/y.txt
old mode 100644
new mode 100755
`;

    expect(parseUnifiedDiff(out)).toEqual([file({path: 'x b/y.txt'})]);
  });

  it('Should fall back to the first " b/" when the header halves differ', () => {
    expect(parseUnifiedDiff('diff --git a/x b/y\n')[0]?.path).toBe('y');
    expect(parseUnifiedDiff('diff --git a/xyz b/xy\n')[0]?.path).toBe('xy');
    expect(parseUnifiedDiff('diff --git a/ab b/abc\n')[0]?.path).toBe('abc');
  });

  it('Should not split at the midpoint unless the right half is a b/ path equal to the left', () => {
    expect(parseUnifiedDiff('diff --git a/ab c/ab\n')[0]?.path).toBe('ab c/ab');
    expect(parseUnifiedDiff('diff --git a/x b/y b/12345\n')[0]?.path).toBe(
      'y b/12345',
    );
  });

  it('Should return a bare modified file for a lone header', () => {
    expect(parseUnifiedDiff('diff --git a/x.txt b/x.txt')).toEqual([
      file({path: 'x.txt'}),
    ]);
  });
});
