// Hidden components (including `..`) are dropped; runs of `.`, `:` or whitespace become `-`.
export const sessionPrefix = (relativePath: string): string =>
  relativePath
    .split('/')
    .filter(part => part !== '' && !part.startsWith('.'))
    .map(part => part.toLowerCase().replace(/[.:\s]+/g, '-'))
    .join('-');

export const sessionName = (prefix: string, hex: string): string =>
  `${prefix || 'fly'}-${hex}`;

// The task prompt reaches the pane through this variable; it is never typed.
export const PROMPT_ENV = 'FLY_PROMPT';

// Control characters (C0, DEL, C1) become spaces, then whitespace collapses.
export const normalizePrompt = (prompt: string): string =>
  prompt
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const claudeCommand = (input: {
  sessionId: string;
  withPrompt?: boolean;
}): string => {
  const base = `claude --dangerously-skip-permissions --session-id ${input.sessionId}`;
  return input.withPrompt ? `${base} "$${PROMPT_ENV}"; exit` : `${base}; exit`;
};
