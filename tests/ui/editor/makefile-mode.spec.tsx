import {ensureSyntaxTree, StreamLanguage} from '@codemirror/language';
import {EditorState} from '@codemirror/state';
import {
  type Highlighter,
  highlightTree,
  tagHighlighter,
  tags as t,
} from '@lezer/highlight';

import {makefile} from '../../../src/application/ui/editor/makefile-mode';

const named = tagHighlighter([
  {tag: t.lineComment, class: 'comment'},
  {tag: t.function(t.definition(t.variableName)), class: 'target'},
  {tag: t.definition(t.variableName), class: 'definition'},
  {tag: t.special(t.variableName), class: 'reference'},
]);
// Any other tagged token shows up as `other`, so untagged text is provably
// plain.
const highlighter: Highlighter = {
  style: tags => (tags.length ? (named.style(tags) ?? 'other') : null),
};

const tokens = (code: string): Array<[string, string]> => {
  const state = EditorState.create({
    doc: code,
    extensions: StreamLanguage.define(makefile),
  });
  const tree = ensureSyntaxTree(state, state.doc.length, 5000);
  const found: Array<[string, string]> = [];
  if (tree) {
    highlightTree(tree, highlighter, (from, to, classes) => {
      found.push([code.slice(from, to), classes]);
    });
  }
  return found;
};

describe('makefile mode', () => {
  it('Should tag comments, targets, variable definitions and references, leaving the recipe body plain', () => {
    expect(tokens('# c\nall: build\nCC := gcc\n\t$(CC) -o app\n')).toEqual([
      ['# c', 'comment'],
      ['all', 'target'],
      ['CC', 'definition'],
      ['$(CC)', 'reference'],
    ]);
  });

  it('Should tag every assignment operator as a variable definition', () => {
    expect(tokens('A = 1\nB ?= 2\nC += 3\nD ::= 4\n')).toEqual([
      ['A', 'definition'],
      ['B', 'definition'],
      ['C', 'definition'],
      ['D', 'definition'],
    ]);
  });

  it('Should tag ${} references and trailing comments outside recipes', () => {
    expect(tokens('OUT := ${DIR}/bin # out\n')).toEqual([
      ['OUT', 'definition'],
      ['${DIR}', 'reference'],
      ['# out', 'comment'],
    ]);
  });

  it('Should tag dotted and pattern targets', () => {
    expect(tokens('.PHONY: all\n%.o: %.c\n')).toEqual([
      ['.PHONY', 'target'],
      ['%.o', 'target'],
    ]);
  });

  it('Should leave a # inside a recipe to the shell', () => {
    expect(tokens('\techo "#"\n')).toEqual([]);
  });
});
