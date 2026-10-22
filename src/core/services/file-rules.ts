import {Eol, FileEntry} from '../domain/files';
import {DirEntry} from '../interfaces/file-store';
import {compareText} from './text-order';

export const HIDDEN_ENTRIES: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.worktrees',
]);
export const MAX_FILE_BYTES = 1_000_000;
export const BINARY_SNIFF_CHARS = 8000;
export const INVALID_PATH = 'Caminho inválido';

const UNSAFE_SEGMENTS = new Set(['', '.', '..']);

export const safeRelativePath = (path: string): string | null => {
  if (path === '') {
    return '';
  }
  if (path.includes('\0')) {
    return null;
  }
  const segments = path.split('/');
  return segments.some(segment => UNSAFE_SEGMENTS.has(segment))
    ? null
    : segments.join('/');
};

export const visibleEntries = (entries: DirEntry[]): FileEntry[] =>
  entries
    .filter(
      entry =>
        !HIDDEN_ENTRIES.has(entry.name) && (entry.isDirectory || entry.isFile),
    )
    .map((entry): FileEntry => ({
      name: entry.name,
      kind: entry.isDirectory ? 'dir' : 'file',
    }))
    .sort(
      (a, b) =>
        Number(b.kind === 'dir') - Number(a.kind === 'dir') ||
        compareText(a.name, b.name),
    );

export const isBinary = (text: string): boolean =>
  text.slice(0, BINARY_SNIFF_CHARS).includes('\0');

export const detectEol = (text: string): Eol =>
  /\r?\n/.exec(text)?.[0] === '\r\n' ? 'crlf' : 'lf';

export const toLf = (text: string): string => text.replace(/\r\n/g, '\n');

export const withEol = (text: string, eol: Eol): string =>
  eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text;
