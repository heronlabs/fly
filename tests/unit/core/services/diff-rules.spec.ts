import {DiffFile} from '../../../../src/core/domain/diff';
import {
  capDiff,
  MAX_FILE_LINES,
  MAX_TOTAL_LINES,
} from '../../../../src/core/services/diff-rules';

const sized = (path: string, lines: number): DiffFile => ({
  path,
  oldPath: null,
  status: 'modified',
  binary: false,
  additions: lines,
  deletions: 0,
  lines,
  hunks: [{header: '@@ -0,0 +1 @@', lines: []}],
  truncated: false,
});

const statOnly = (f: DiffFile): DiffFile => ({
  ...f,
  hunks: [],
  truncated: true,
});

describe('capDiff', () => {
  it('Should expose the caps', () => {
    expect(MAX_FILE_LINES).toBe(500);
    expect(MAX_TOTAL_LINES).toBe(3000);
  });

  it('Should pass small files through untouched', () => {
    const files = [sized('a', 100), sized('b', 100)];

    expect(capDiff(files)).toEqual({files, truncated: false});
  });

  it('Should return an empty untruncated diff for no files', () => {
    expect(capDiff([])).toEqual({files: [], truncated: false});
  });

  it('Should keep a file of exactly 500 lines and cap one of 501', () => {
    const exact = sized('exact', 500);
    const over = sized('over', 501);

    expect(capDiff([exact])).toEqual({files: [exact], truncated: false});
    expect(capDiff([over])).toEqual({
      files: [statOnly(over)],
      truncated: false,
    });
  });

  it('Should stat-only the file that pushes the total past 3000 and flag the diff', () => {
    const files = [sized('a', 1200), sized('b', 1200), sized('c', 1200)];

    expect(capDiff(files)).toEqual({
      files: files.map(statOnly),
      truncated: true,
    });
  });

  it('Should allow a total of exactly 3000 and cap the next file', () => {
    const six = Array.from({length: 6}, (_, i) => sized(`f${i}`, 500));
    const next = sized('next', 1);

    expect(capDiff(six)).toEqual({files: six, truncated: false});
    expect(capDiff([...six, next])).toEqual({
      files: [...six, statOnly(next)],
      truncated: true,
    });
  });

  it('Should count capped files toward the total and keep stats', () => {
    const files = [sized('big', 2900), sized('small', 101)];

    const result = capDiff(files);

    expect(result.files[0]).toEqual(statOnly(files[0] as DiffFile));
    expect(result.files[1]).toEqual(statOnly(files[1] as DiffFile));
    expect(result.files[1]?.additions).toBe(101);
    expect(result.truncated).toBe(true);
  });
});
