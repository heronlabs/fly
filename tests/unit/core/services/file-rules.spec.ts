import {
  BINARY_SNIFF_CHARS,
  detectEol,
  HIDDEN_ENTRIES,
  INVALID_PATH,
  isBinary,
  MAX_FILE_BYTES,
  safeRelativePath,
  toLf,
  visibleEntries,
  withEol,
} from '../../../../src/core/services/file-rules';

const dir = (name: string) => ({name, isDirectory: true, isFile: false});
const file = (name: string) => ({name, isDirectory: false, isFile: true});

describe('file-rules constants', () => {
  it('Should expose the limits and the hidden entries', () => {
    expect(MAX_FILE_BYTES).toBe(1_000_000);
    expect(BINARY_SNIFF_CHARS).toBe(8000);
    expect(INVALID_PATH).toBe('Caminho inválido');
    expect([...HIDDEN_ENTRIES].sort()).toEqual([
      '.git',
      '.worktrees',
      'node_modules',
    ]);
  });
});

describe('safeRelativePath', () => {
  it('Should accept the root and normal relative paths', () => {
    expect(safeRelativePath('')).toBe('');
    expect(safeRelativePath('src/main.ts')).toBe('src/main.ts');
    expect(safeRelativePath('a\\b')).toBe('a\\b');
  });

  it.each(['/etc/passwd', '../x', 'a/../b', 'a//b', 'a/', './a', 'a\0b', '.'])(
    'Should reject %j',
    path => {
      expect(safeRelativePath(path)).toBeNull();
    },
  );
});

describe('visibleEntries', () => {
  it('Should hide the ignored entries', () => {
    const result = visibleEntries([
      dir('.git'),
      dir('node_modules'),
      dir('.worktrees'),
      file('keep'),
    ]);
    expect(result).toEqual([{name: 'keep', kind: 'file'}]);
  });

  it('Should drop entries that are neither dir nor file', () => {
    const odd = {name: 'sock', isDirectory: false, isFile: false};
    expect(visibleEntries([odd, file('a')])).toEqual([
      {name: 'a', kind: 'file'},
    ]);
  });

  it('Should order dirs first, then by compareText', () => {
    const result = visibleEntries([dir('b'), dir('a'), file('z'), file('A')]);
    expect(result.map(e => e.name)).toEqual(['a', 'b', 'A', 'z']);
    expect(result.map(e => e.kind)).toEqual(['dir', 'dir', 'file', 'file']);
  });

  it('Should put dirs first whatever the input order', () => {
    const result = visibleEntries([file('a'), dir('z')]);
    expect(result.map(e => e.name)).toEqual(['z', 'a']);
  });
});

describe('isBinary', () => {
  it('Should detect a NUL at the start', () => {
    expect(isBinary('\0abc')).toBe(true);
  });

  it('Should detect a NUL on the last sniffed char', () => {
    expect(isBinary('a'.repeat(BINARY_SNIFF_CHARS - 1) + '\0')).toBe(true);
  });

  it('Should ignore a NUL past the sniffed window', () => {
    expect(isBinary('a'.repeat(BINARY_SNIFF_CHARS) + '\0')).toBe(false);
    expect(isBinary('a'.repeat(9000) + '\0')).toBe(false);
  });

  it('Should treat plain text as text', () => {
    expect(isBinary('hello')).toBe(false);
  });
});

describe('eol helpers', () => {
  it('Should detect the line ending', () => {
    expect(detectEol('a\r\nb')).toBe('crlf');
    expect(detectEol('a\nb')).toBe('lf');
    expect(detectEol('a')).toBe('lf');
    expect(detectEol('a\rb\r\n')).toBe('crlf');
  });

  it('Should normalise to lf', () => {
    expect(toLf('a\r\nb\r\nc')).toBe('a\nb\nc');
    expect(toLf('a\nb')).toBe('a\nb');
  });

  it('Should round-trip through withEol', () => {
    expect(withEol('a\nb\n', 'crlf')).toBe('a\r\nb\r\n');
    expect(toLf(withEol('a\nb\n', 'crlf'))).toBe('a\nb\n');
    expect(withEol('a\nb', 'lf')).toBe('a\nb');
  });
});
