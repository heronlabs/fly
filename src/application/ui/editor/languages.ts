import {go} from '@codemirror/lang-go';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {markdown} from '@codemirror/lang-markdown';
import {yaml} from '@codemirror/lang-yaml';
import {
  LanguageDescription,
  LanguageSupport,
  StreamLanguage,
} from '@codemirror/language';
import {dockerFile} from '@codemirror/legacy-modes/mode/dockerfile';
import {shell} from '@codemirror/legacy-modes/mode/shell';
import type {Extension} from '@codemirror/state';

import type {FileKind, FileLanguage} from './file-kinds';
import {makefile} from './makefile-mode';

const shellLanguage = StreamLanguage.define(shell);
const dockerfileLanguage = StreamLanguage.define(dockerFile);
const makefileLanguage = StreamLanguage.define(makefile);

const supportFor = (
  language: Exclude<FileLanguage, 'markdown' | 'plain'>,
  jsx: boolean,
): LanguageSupport => {
  switch (language) {
    case 'typescript':
      return javascript({typescript: true, jsx});
    case 'javascript':
      return javascript({jsx});
    case 'go':
      return go();
    case 'json':
      return json();
    case 'yaml':
      return yaml();
    case 'shell':
      return new LanguageSupport(shellLanguage);
    case 'dockerfile':
      return new LanguageSupport(dockerfileLanguage);
    case 'makefile':
      return new LanguageSupport(makefileLanguage);
  }
};

// Fenced Markdown blocks: the info string is matched case-insensitively
// against the name, then the aliases (the P14 extensions and common fence
// names).
const fenced = (name: string, support: LanguageSupport, alias: string[]) =>
  LanguageDescription.of({name, alias, support});

const codeLanguages = [
  fenced('TypeScript', supportFor('typescript', false), ['ts', 'mts', 'cts']),
  fenced('TSX', supportFor('typescript', true), ['tsx']),
  fenced('JavaScript', supportFor('javascript', false), ['js', 'mjs', 'cjs']),
  fenced('JSX', supportFor('javascript', true), ['jsx']),
  fenced('Go', supportFor('go', false), ['golang']),
  fenced('JSON', supportFor('json', false), ['jsonc']),
  fenced('YAML', supportFor('yaml', false), ['yml']),
  fenced('Shell', supportFor('shell', false), ['sh', 'bash', 'zsh', 'bats']),
  fenced('Dockerfile', supportFor('dockerfile', false), ['docker']),
  fenced('Makefile', supportFor('makefile', false), ['make', 'mk']),
];

export const languageExtension = (kind: FileKind): Extension => {
  switch (kind.language) {
    case 'plain':
      return [];
    case 'markdown':
      return markdown({codeLanguages});
    default:
      return supportFor(kind.language, kind.jsx);
  }
};

export const indentUnitOf = (language: FileLanguage): string =>
  language === 'go' || language === 'makefile' ? '\t' : '  ';
