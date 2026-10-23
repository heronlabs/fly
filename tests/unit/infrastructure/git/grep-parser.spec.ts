import {parseGrep} from '../../../../src/infrastructure/git/grep-parser';

describe('parseGrep', () => {
  it('Should parse the captured shape', () => {
    const output =
      [
        'a.txt\x001\x00hello world',
        'a.txt\x0012\x00maçã hello',
        'sp ace/b c.txt\x003\x00x hello',
      ].join('\n') + '\n';
    expect(parseGrep(output)).toEqual([
      {path: 'a.txt', line: 1, text: 'hello world'},
      {path: 'a.txt', line: 12, text: 'maçã hello'},
      {path: 'sp ace/b c.txt', line: 3, text: 'x hello'},
    ]);
  });

  it('Should return empty for empty output', () => {
    expect(parseGrep('')).toEqual([]);
  });

  it('Should parse output without the trailing newline', () => {
    expect(parseGrep('a.txt\x001\x00x\nb.txt\x002\x00y')).toEqual([
      {path: 'a.txt', line: 1, text: 'x'},
      {path: 'b.txt', line: 2, text: 'y'},
    ]);
  });

  it('Should strip the CR of a CRLF line, only at the end', () => {
    expect(parseGrep('a.txt\x001\x00a\rb\r\n')).toEqual([
      {path: 'a.txt', line: 1, text: 'a\rb'},
    ]);
  });

  it('Should keep a NUL inside the line text', () => {
    expect(parseGrep('a.txt\x001\x00a\x00b\n')).toEqual([
      {path: 'a.txt', line: 1, text: 'a\x00b'},
    ]);
  });

  it('Should keep an empty matching line', () => {
    expect(parseGrep('a.txt\x004\x00\n')).toEqual([
      {path: 'a.txt', line: 4, text: ''},
    ]);
  });

  it('Should skip a record without the line field', () => {
    expect(parseGrep('junk\na.txt\x001\n')).toEqual([]);
  });

  it('Should skip a record whose line field is not a number', () => {
    expect(parseGrep('a.txt\x00x\x00y\n')).toEqual([]);
  });

  it('Should keep a newline inside a path', () => {
    expect(parseGrep('a.txt\x001\x00x\nn\nl.txt\x002\x00y\n')).toEqual([
      {path: 'a.txt', line: 1, text: 'x'},
      {path: 'n\nl.txt', line: 2, text: 'y'},
    ]);
  });
});
