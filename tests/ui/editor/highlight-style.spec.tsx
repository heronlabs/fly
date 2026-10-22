import {javascript} from '@codemirror/lang-javascript';
import {highlightingFor, StreamLanguage} from '@codemirror/language';
import {shell} from '@codemirror/legacy-modes/mode/shell';
import {EditorState} from '@codemirror/state';
import {highlightTree, type Tag, tags as t} from '@lezer/highlight';

import {
  highlightStyle,
  syntaxHighlighting,
} from '../../../src/application/ui/editor/highlight-style';

const typescript = javascript({typescript: true}).language.parser;

// Maps each styled token's text to the class the highlight style gave it.
const tokens = (code: string, parser = typescript): Record<string, string> => {
  const found: Record<string, string> = {};
  highlightTree(parser.parse(code), highlightStyle, (from, to, classes) => {
    found[code.slice(from, to)] = classes;
  });
  return found;
};

const classOf = (tag: Tag) => highlightStyle.style([tag]);
const rules = highlightStyle.module?.getRules() ?? '';
const ruleOf = (tag: Tag) =>
  rules.split('\n').find(rule => rule.startsWith(`.${classOf(tag)} `));

describe('highlightStyle', () => {
  it('Should colour this, foo and bar in this.foo.bar() as keyword, variable and function', () => {
    const found = tokens('this.foo.bar()');
    expect(found['this']).toBe(classOf(t.self));
    expect(found['foo']).toBe(classOf(t.propertyName));
    expect(found['bar']).toBe(classOf(t.function(t.propertyName)));
    expect(new Set([found['this'], found['foo'], found['bar']]).size).toBe(3);
    expect(ruleOf(t.self)).toContain('var(--edKeyword)');
    expect(ruleOf(t.propertyName)).toContain('var(--edVariable)');
    expect(ruleOf(t.function(t.propertyName))).toContain('var(--edFunction)');
  });

  it('Should colour module keywords as control and module paths as strings', () => {
    const found = tokens("import x from 'y'");
    expect(found['import']).toBe(classOf(t.controlKeyword));
    expect(found['from']).toBe(classOf(t.controlKeyword));
    expect(found["'y'"]).toBe(classOf(t.string));
    expect(ruleOf(t.controlKeyword)).toContain('var(--edControl)');
    expect(ruleOf(t.string)).toContain('var(--edString)');
  });

  it('Should colour declarations, types and numbers', () => {
    const found = tokens('const n: Foo = 1');
    expect(found['const']).toBe(classOf(t.keyword));
    expect(found['n']).toBe(classOf(t.variableName));
    expect(found['Foo']).toBe(classOf(t.typeName));
    expect(found['1']).toBe(classOf(t.number));
    expect(ruleOf(t.typeName)).toContain('var(--edType)');
    expect(ruleOf(t.number)).toContain('var(--edNumber)');
  });

  it('Should colour called and declared functions alike', () => {
    const found = tokens('function f() {}\ng()');
    expect(found['f']).toBe(classOf(t.function(t.variableName)));
    expect(found['g']).toBe(classOf(t.function(t.variableName)));
    expect(classOf(t.function(t.variableName))).toBe(
      classOf(t.function(t.propertyName)),
    );
  });

  it('Should colour legacy-mode builtins as functions', () => {
    const found = tokens('echo hi', StreamLanguage.define(shell).parser);
    expect(found['echo']).toBe(classOf(t.function(t.variableName)));
  });

  it('Should leave operators and punctuation to the editor text colour', () => {
    expect(classOf(t.operator)).toBeNull();
    expect(classOf(t.punctuation)).toBeNull();
    expect(classOf(t.derefOperator)).toBeNull();
  });

  it('Should bold headings and strong text and italicise emphasis', () => {
    expect(ruleOf(t.heading)).toContain('var(--edHeading)');
    expect(ruleOf(t.heading)).toContain('font-weight: bold');
    expect(ruleOf(t.strong)).toContain('font-weight: bold');
    expect(ruleOf(t.emphasis)).toContain('font-style: italic');
    expect(ruleOf(t.strikethrough)).toContain('text-decoration: line-through');
  });

  it('Should take every colour from a --ed variable, never a literal', () => {
    expect(rules).toContain('var(--edKeyword)');
    expect(rules).toContain('var(--edVariable)');
    expect(rules).toContain('var(--edFunction)');
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('Should install the style as the editor highlighter', () => {
    const state = EditorState.create({extensions: syntaxHighlighting});
    expect(highlightingFor(state, [t.keyword])).toBe(classOf(t.keyword));
  });
});
