import {PROMPT_FILE_ENV} from '../domain/task';

// Hidden components (including `..`) are dropped; runs of `.`, `:` or whitespace become `-`.
export const sessionPrefix = (relativePath: string): string =>
  relativePath
    .split('/')
    .filter(part => part !== '' && !part.startsWith('.'))
    .map(part => part.toLowerCase().replace(/[.:\s]+/g, '-'))
    .join('-');

export const sessionName = (prefix: string, hex: string): string =>
  `${prefix || 'fly'}-${hex}`;

// Control characters (C0, DEL, C1) become spaces, then whitespace collapses.
export const normalizePrompt = (prompt: string): string =>
  prompt
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Control characters (C0, DEL, C1) are dropped, except newline and tab.
export const cleanPrompt = (text: string): string =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');

export const claudeCommand = (input: {
  sessionId: string;
  promptFile?: boolean;
  model?: string | null;
}): string => {
  const model = input.model ? ` --model ${input.model}` : '';
  const base = `claude --dangerously-skip-permissions --session-id ${input.sessionId}${model}`;
  if (input.promptFile)
    return `${base} -- "$(cat "$${PROMPT_FILE_ENV}")"; exit`;
  return `${base}; exit`;
};
