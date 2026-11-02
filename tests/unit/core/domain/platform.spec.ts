import {platformOf} from '../../../../src/core/domain/platform';

describe('platformOf', () => {
  it('Should map darwin to mac', () => {
    expect(platformOf('darwin')).toBe('mac');
  });

  it('Should map linux to linux', () => {
    expect(platformOf('linux')).toBe('linux');
  });

  it('Should refuse any other platform', () => {
    expect(() => platformOf('win32')).toThrow(
      'Plataforma não suportada: win32',
    );
  });
});
