import {
  HighlightStyle,
  syntaxHighlighting as highlighting,
} from '@codemirror/language';
import type {Extension} from '@codemirror/state';
import {tags as t} from '@lezer/highlight';

import {type SyntaxRole, syntaxVar} from './syntax-palette';

const color = (role: SyntaxRole) => `var(${syntaxVar(role)})`;

// One global style: colours are variables, so a theme switch recolours the
// editor without a transaction. Operators and punctuation have no rule and
// keep the editor text colour.
export const highlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.definitionKeyword,
      t.operatorKeyword,
      t.modifier,
      t.self,
      t.atom,
      t.bool,
      t.null,
    ],
    color: color('keyword'),
  },
  {tag: [t.controlKeyword, t.moduleKeyword], color: color('control')},
  {
    tag: [
      t.variableName,
      t.definition(t.variableName),
      t.propertyName,
      t.definition(t.propertyName),
      t.special(t.propertyName),
      t.definition(t.special(t.propertyName)),
      t.special(t.variableName),
    ],
    color: color('variable'),
  },
  {
    // Legacy modes tag `builtin` as standard(variableName).
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.macroName,
      t.standard(t.variableName),
    ],
    color: color('function'),
  },
  {
    tag: [
      t.typeName,
      t.definition(t.typeName),
      t.className,
      t.definition(t.className),
      t.namespace,
    ],
    color: color('type'),
  },
  {
    tag: [t.constant(t.variableName), t.constant(t.name)],
    color: color('constant'),
  },
  {
    tag: [
      t.string,
      t.special(t.string),
      t.character,
      t.attributeValue,
      t.monospace,
      t.url,
      t.link,
    ],
    color: color('string'),
  },
  {tag: [t.number, t.integer, t.float, t.unit], color: color('number')},
  {tag: [t.comment, t.quote], color: color('comment')},
  {tag: t.regexp, color: color('regexp')},
  {tag: t.escape, color: color('escape')},
  {
    tag: [t.tagName, t.standard(t.tagName), t.angleBracket],
    color: color('tag'),
  },
  {tag: t.attributeName, color: color('attribute')},
  {tag: t.invalid, color: color('invalid')},
  {tag: t.heading, color: color('heading'), fontWeight: 'bold'},
  {
    tag: [t.meta, t.processingInstruction, t.labelName, t.contentSeparator],
    color: color('meta'),
  },
  {tag: t.list, color: color('listMarker')},
  {tag: t.strong, fontWeight: 'bold'},
  {tag: t.emphasis, fontStyle: 'italic'},
  {tag: t.strikethrough, textDecoration: 'line-through'},
]);

export const syntaxHighlighting: Extension = highlighting(highlightStyle);
