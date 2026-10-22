import {ensureSyntaxTree, language} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {highlightTree, tagHighlighter, tags as t} from '@lezer/highlight';

import {fileKind} from '../../../src/application/ui/editor/file-kinds';
import {
  indentUnitOf,
  languageExtension,
} from '../../../src/application/ui/editor/languages';

const highlighter = tagHighlighter([
  {tag: t.keyword, class: 'keyword'},
  {tag: t.typeName, class: 'type'},
  {tag: t.tagName, class: 'tag'},
  {tag: t.propertyName, class: 'property'},
  {tag: t.heading, class: 'heading'},
  {tag: t.standard(t.variableName), class: 'builtin'},
  {tag: t.function(t.definition(t.variableName)), class: 'target'},
]);

// Parses `code` as the language of `basename` and maps each styled token's
// (trimmed) text to its class.
const tokens = (basename: string, code: string): Record<string, string> => {
  const state = EditorState.create({
    doc: code,
    extensions: languageExtension(fileKind(basename)),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  const found: Record<string, string> = {};
  if (tree) {
    highlightTree(tree, highlighter, (from, to, classes) => {
      found[code.slice(from, to).trim()] = classes;
    });
  }
  return found;
};

describe('languageExtension', () => {
  it.each([
    ['a.ts', 'let x: T', 'T', 'type'],
    ['a.tsx', 'const a = <div />', 'div', 'tag'],
    ['a.js', 'let x', 'let', 'keyword'],
    ['a.jsx', 'const a = <div />', 'div', 'tag'],
    ['a.go', 'func f() {}', 'func', 'keyword'],
    ['a.json', '{"a": 1}', '"a"', 'property'],
    ['a.yml', 'a: 1', 'a', 'property'],
    ['a.md', '# Title', '# Title', 'heading'],
    ['a.sh', 'echo hi', 'echo', 'builtin'],
    ['Dockerfile', 'FROM node', 'FROM', 'keyword'],
    ['Makefile', 'all: build', 'all', 'target'],
  ])('Should parse %s with its language', (basename, code, token, cls) => {
    expect(tokens(basename, code)[token]).toBe(cls);
  });

  it('Should give each non-plain kind a language and plain none', () => {
    const languageOf = (basename: string) =>
      EditorState.create({
        extensions: languageExtension(fileKind(basename)),
      }).facet(language);
    expect(languageOf('a.ts')?.name).toBe('typescript');
    expect(languageOf('a.js')?.name).toBe('javascript');
    expect(languageOf('a.go')?.name).toBe('go');
    expect(languageOf('a.md')?.name).toBe('markdown');
    expect(languageOf('Makefile')?.name).toBe('makefile');
    expect(languageOf('README')).toBeNull();
    expect(languageExtension(fileKind('README'))).toEqual([]);
  });

  it('Should highlight fenced Markdown blocks in the P14 languages', () => {
    expect(tokens('a.md', '```ts\nlet x: T\n```\n')['T']).toBe('type');
    expect(tokens('a.md', '```typescript\nlet x: T\n```\n')['T']).toBe('type');
    expect(tokens('a.md', '```go\nfunc f() {}\n```\n')['func']).toBe('keyword');
    expect(tokens('a.md', '```bash\necho hi\n```\n')['echo']).toBe('builtin');
    expect(tokens('a.md', '```yaml\na: 1\n```\n')['a']).toBe('property');
    expect(tokens('a.md', '```makefile\nall: x\n```\n')['all']).toBe('target');
  });
});

describe('indentUnitOf', () => {
  it('Should indent Go and Makefile with a tab', () => {
    expect(indentUnitOf('go')).toBe('\t');
    expect(indentUnitOf('makefile')).toBe('\t');
  });

  it('Should indent everything else with two spaces', () => {
    expect(indentUnitOf('typescript')).toBe('  ');
    expect(indentUnitOf('yaml')).toBe('  ');
    expect(indentUnitOf('plain')).toBe('  ');
  });
});
