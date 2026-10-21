import {Diff, DiffFile} from '../domain/diff';

export const MAX_FILE_LINES = 500;
export const MAX_TOTAL_LINES = 3000;

export const capDiff = (files: DiffFile[]): Diff => {
  let total = 0;
  let truncated = false;

  const capped = files.map(file => {
    total += file.lines;
    const overTotal = total > MAX_TOTAL_LINES;
    if (overTotal) {
      truncated = true;
    }
    return file.lines > MAX_FILE_LINES || overTotal
      ? {...file, hunks: [], truncated: true}
      : file;
  });

  return {files: capped, truncated};
};
