import {
  type FileKind,
  fileKind,
} from '../../../src/application/ui/editor/file-kinds';

const typescript: FileKind = {
  language: 'typescript',
  jsx: false,
  name: 'TypeScript',
  label: 'ts',
  color: '#2396ed',
};
const javascript: FileKind = {
  language: 'javascript',
  jsx: false,
  name: 'JavaScript',
  label: 'js',
  color: 'var(--warn)',
};
const go: FileKind = {
  language: 'go',
  jsx: false,
  name: 'Go',
  label: 'go',
  color: 'var(--info)',
};
const json: FileKind = {
  language: 'json',
  jsx: false,
  name: 'JSON',
  label: '{}',
  color: '#CCDA3D',
};
const yaml: FileKind = {
  language: 'yaml',
  jsx: false,
  name: 'YAML',
  label: 'yml',
  color: 'var(--warn)',
};
const markdown: FileKind = {
  language: 'markdown',
  jsx: false,
  name: 'Markdown',
  label: 'md',
  color: 'var(--muted)',
};
const shell: FileKind = {
  language: 'shell',
  jsx: false,
  name: 'Shell',
  label: 'sh',
  color: 'var(--ok)',
};
const dockerfile: FileKind = {
  language: 'dockerfile',
  jsx: false,
  name: 'Dockerfile',
  label: 'dk',
  color: 'var(--info)',
};
const makefile: FileKind = {
  language: 'makefile',
  jsx: false,
  name: 'Makefile',
  label: 'mk',
  color: 'var(--syTitle)',
};
const plain = (label: string): FileKind => ({
  language: 'plain',
  jsx: false,
  name: 'Texto',
  label,
  color: 'var(--faint)',
});

describe('fileKind', () => {
  it.each<[string, FileKind]>([
    ['index.ts', typescript],
    ['index.mts', typescript],
    ['index.cts', typescript],
    ['app.tsx', {...typescript, jsx: true}],
    ['index.js', javascript],
    ['index.mjs', javascript],
    ['index.cjs', javascript],
    ['app.jsx', {...javascript, jsx: true}],
    ['main.go', go],
    ['package.json', json],
    ['tsconfig.jsonc', json],
    ['ci.yml', yaml],
    ['ci.yaml', yaml],
    ['README.md', markdown],
    ['page.mdx', markdown],
    ['run.sh', shell],
    ['run.bash', shell],
    ['run.zsh', shell],
    ['spec.bats', shell],
    ['.zshrc', shell],
    ['.zprofile', shell],
    ['.bashrc', shell],
    ['.bash_profile', shell],
    ['Dockerfile', dockerfile],
    ['Dockerfile.dev', dockerfile],
    ['app.dockerfile', dockerfile],
    ['Makefile', makefile],
    ['GNUmakefile', makefile],
    ['makefile', makefile],
    ['rules.mk', makefile],
  ])('Should map %s to its P14 kind', (basename, kind) => {
    expect(fileKind(basename)).toEqual(kind);
  });

  it('Should match extensions case-insensitively', () => {
    expect(fileKind('a.TS')).toEqual(typescript);
    expect(fileKind('APP.TSX')).toEqual({...typescript, jsx: true});
  });

  it('Should fall back to Texto labelled with the first two extension characters', () => {
    expect(fileKind('go.mod')).toEqual(plain('mo'));
    expect(fileKind('Cargo.TOML')).toEqual(plain('to'));
    expect(fileKind('main.c')).toEqual(plain('c'));
  });

  it('Should label Texto as tx when there is no extension', () => {
    expect(fileKind('README')).toEqual(plain('tx'));
    expect(fileKind('LICENSE')).toEqual(plain('tx'));
    expect(fileKind('.env')).toEqual(plain('tx'));
  });

  it('Should keep every chip label within three characters', () => {
    for (const basename of ['a.ts', 'a.yaml', 'a.jsonc', 'a.dockerfile']) {
      expect(fileKind(basename).label.length).toBeLessThanOrEqual(3);
    }
  });
});
