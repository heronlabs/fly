import {
  flagOf,
  parseStatusPorcelain,
} from '../../../../src/infrastructure/git/status-porcelain-parser';

describe('flagOf', () => {
  it.each([
    ['??', 'A'],
    ['A ', 'A'],
    [' M', 'M'],
    ['M ', 'M'],
    ['MM', 'M'],
    [' T', 'M'],
    ['UU', 'M'],
    [' D', 'D'],
    ['D ', 'D'],
    ['AD', 'D'],
    ['!!', null],
    ['', null],
    ['X', null],
  ])('Should map %j to %s', (xy, flag) => {
    expect(flagOf(xy)).toBe(flag);
  });
});

describe('parseStatusPorcelain', () => {
  it('Should parse the captured shape', () => {
    const output =
      [
        'R  moved.txt',
        'ren.txt',
        ' M sub/inner.txt',
        '?? newdir/a.txt',
        ' M maçã.txt',
        ' D del.txt',
      ].join('\0') + '\0';
    expect(parseStatusPorcelain(output)).toEqual({
      'moved.txt': 'A',
      'ren.txt': 'D',
      'sub/inner.txt': 'M',
      'newdir/a.txt': 'A',
      'maçã.txt': 'M',
      'del.txt': 'D',
    });
  });

  it('Should treat a copy like a rename', () => {
    expect(parseStatusPorcelain('C  copy.txt\0orig.txt\0')).toEqual({
      'copy.txt': 'A',
      'orig.txt': 'D',
    });
  });

  it('Should keep spaces in paths', () => {
    expect(parseStatusPorcelain(' M my file.txt\0')).toEqual({
      'my file.txt': 'M',
    });
  });

  it('Should return empty for empty output', () => {
    expect(parseStatusPorcelain('')).toEqual({});
  });

  it('Should parse output without the trailing NUL', () => {
    expect(parseStatusPorcelain(' M a.txt\0?? b.txt')).toEqual({
      'a.txt': 'M',
      'b.txt': 'A',
    });
  });

  it('Should skip ignored entries', () => {
    expect(parseStatusPorcelain('!! out/\0 M a.txt\0')).toEqual({
      'a.txt': 'M',
    });
  });

  it('Should survive a rename missing its old path', () => {
    expect(parseStatusPorcelain('R  moved.txt\0')).toEqual({'moved.txt': 'A'});
  });
});
