import {
  syntaxPalette,
  type SyntaxRole,
  syntaxVar,
  syntaxVars,
} from '../../../src/application/ui/editor/syntax-palette';

const roles: SyntaxRole[] = [
  'keyword',
  'control',
  'variable',
  'function',
  'type',
  'constant',
  'string',
  'number',
  'comment',
  'regexp',
  'escape',
  'tag',
  'attribute',
  'invalid',
  'heading',
  'meta',
  'listMarker',
  'selection',
  'lineHighlight',
  'bracketMatch',
  'bracketBorder',
  'findMatch',
  'findMatchOther',
];

const colour = /^(#[0-9a-f]{6}([0-9a-f]{2})?|rgb\(.+\))$/i;

describe('syntaxPalette', () => {
  it.each(['dark', 'light'] as const)(
    'Should give every role a colour in the %s theme',
    theme => {
      expect(Object.keys(syntaxPalette[theme]).sort()).toEqual(
        [...roles].sort(),
      );
      for (const role of roles) {
        expect(syntaxPalette[theme][role]).toMatch(colour);
      }
    },
  );

  it('Should colour this, properties and calls like VSCode Dark+ and Light+', () => {
    expect(syntaxPalette.dark.keyword).toBe('#569cd6');
    expect(syntaxPalette.dark.variable).toBe('#9cdcfe');
    expect(syntaxPalette.dark.function).toBe('#dcdcaa');
    expect(syntaxPalette.light.keyword).toBe('#0000ff');
    expect(syntaxPalette.light.variable).toBe('#001080');
    expect(syntaxPalette.light.function).toBe('#795e26');
  });
});

describe('syntaxVar', () => {
  it('Should prefix the capitalised role with --ed', () => {
    expect(syntaxVar('keyword')).toBe('--edKeyword');
    expect(syntaxVar('findMatchOther')).toBe('--edFindMatchOther');
  });
});

describe('syntaxVars', () => {
  it('Should expose the theme palette as --ed* variables', () => {
    expect(syntaxVars('dark')['--edFunction']).toBe('#dcdcaa');
    expect(syntaxVars('light')['--edFunction']).toBe('#795e26');
    expect(syntaxVars('light')['--edLineHighlight']).toBe('rgb(0 0 0 / 3%)');
  });

  it('Should hold one variable per role', () => {
    expect(Object.keys(syntaxVars('dark')).sort()).toEqual(
      roles.map(syntaxVar).sort(),
    );
  });
});
