// Hidden components (including `..`) are dropped; runs of `.`, `:` or whitespace become `-`.
export const sessionPrefix = (relativePath: string): string =>
  relativePath
    .split('/')
    .filter(part => part !== '' && !part.startsWith('.'))
    .map(part => part.toLowerCase().replace(/[.:\s]+/g, '-'))
    .join('-');

export const sessionName = (prefix: string, hex: string): string =>
  `${prefix || 'fly'}-${hex}`;

// POSIX single quoting: the only character that needs escaping is `'` itself.
export const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

export const claudeCommand = (input: {
  sessionId: string;
  prompt?: string;
}): string => {
  const base = `claude --dangerously-skip-permissions --session-id ${input.sessionId}`;
  const prompt = input.prompt
    ? ` ${shellQuote(input.prompt.replace(/\s+/g, ' ').trim())}`
    : '';
  return `${base}${prompt}; exit`;
};
