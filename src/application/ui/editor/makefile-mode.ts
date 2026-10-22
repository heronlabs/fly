import type {StreamParser} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

// `$(NAME)` / `${NAME}`, without nesting.
const reference = /^\$[({][^)}]*[)}]/;
// A target name up to `:`, but not the `:=` / `::=` of an assignment.
const target = /^[^:=#]+?(?=:(?!:?=))/;
// `NAME =`, `:=`, `::=`, `?=`, `+=`, `!=`.
const definition = /^[\w.-]+(?=\s*(?:::?|[?+!])?=)/;

// The legacy-modes package has no Makefile mode, so this is a minimal one:
// recipe lines (leading tab) belong to the shell and stay plain apart from
// variable references.
export const makefile: StreamParser<{recipe: boolean}> = {
  name: 'makefile',
  startState: () => ({recipe: false}),
  token(stream, state) {
    if (stream.sol()) {
      state.recipe = stream.peek() === '\t';
      if (!state.recipe && stream.match(target)) {
        return 'target';
      }
      if (!state.recipe && stream.match(definition)) {
        return 'definition';
      }
    }
    if (stream.match(reference)) {
      return 'reference';
    }
    if (!state.recipe && stream.peek() === '#') {
      stream.skipToEnd();
      return 'comment';
    }
    stream.next();
    stream.eatWhile(state.recipe ? /[^$]/ : /[^$#]/);
    return null;
  },
  languageData: {commentTokens: {line: '#'}},
  tokenTable: {
    comment: t.lineComment,
    target: t.function(t.definition(t.variableName)),
    definition: t.definition(t.variableName),
    reference: t.special(t.variableName),
  },
};
