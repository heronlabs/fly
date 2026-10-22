// VSCode Dark+ / Light+ (theme-defaults) colours, applied through `--ed*`
// variables. theme.ts imports this file; it must never import theme.ts.

export type SyntaxRole =
  | 'keyword'
  | 'control'
  | 'variable'
  | 'function'
  | 'type'
  | 'constant'
  | 'string'
  | 'number'
  | 'comment'
  | 'regexp'
  | 'escape'
  | 'tag'
  | 'attribute'
  | 'invalid'
  | 'heading'
  | 'meta'
  | 'listMarker'
  | 'selection'
  | 'lineHighlight'
  | 'bracketMatch'
  | 'bracketBorder'
  | 'findMatch'
  | 'findMatchOther';

export const syntaxPalette: Record<
  'dark' | 'light',
  Record<SyntaxRole, string>
> = {
  dark: {
    keyword: '#569cd6',
    control: '#c586c0',
    variable: '#9cdcfe',
    function: '#dcdcaa',
    type: '#4ec9b0',
    constant: '#4fc1ff',
    string: '#ce9178',
    number: '#b5cea8',
    comment: '#6a9955',
    regexp: '#d16969',
    escape: '#d7ba7d',
    tag: '#569cd6',
    attribute: '#9cdcfe',
    invalid: '#f44747',
    heading: '#569cd6',
    meta: '#c8c8c8',
    listMarker: '#6796e6',
    selection: '#264f78',
    lineHighlight: 'rgb(255 255 255 / 4%)',
    bracketMatch: '#0064001a',
    bracketBorder: '#888888',
    findMatch: '#9e6a03',
    findMatchOther: '#ea5c0055',
  },
  light: {
    keyword: '#0000ff',
    control: '#af00db',
    variable: '#001080',
    function: '#795e26',
    type: '#267f99',
    constant: '#0070c1',
    string: '#a31515',
    number: '#098658',
    comment: '#008000',
    regexp: '#811f3f',
    escape: '#ee0000',
    tag: '#800000',
    attribute: '#e50000',
    invalid: '#cd3131',
    heading: '#800000',
    meta: '#000000',
    listMarker: '#0451a5',
    selection: '#add6ff',
    lineHighlight: 'rgb(0 0 0 / 3%)',
    bracketMatch: '#0064001a',
    bracketBorder: '#b9b9b9',
    findMatch: '#a8ac94',
    findMatchOther: '#ea5c0055',
  },
};

export const syntaxVar = (role: SyntaxRole): `--ed${string}` =>
  `--ed${role.charAt(0).toUpperCase()}${role.slice(1)}`;

export const syntaxVars = (
  theme: 'dark' | 'light',
): Record<`--${string}`, string> =>
  Object.fromEntries(
    (Object.keys(syntaxPalette[theme]) as SyntaxRole[]).map(role => [
      syntaxVar(role),
      syntaxPalette[theme][role],
    ]),
  );
