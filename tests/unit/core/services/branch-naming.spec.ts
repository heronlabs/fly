import {
  branchCandidate,
  branchFromDescription,
} from '../../../../src/core/services/branch-naming';

describe('branchFromDescription', () => {
  it('Should take the first five words, lowercase and without accents', () => {
    expect(branchFromDescription('Adicionar ação de Limpar no PR')).toBe(
      'adicionar-acao-de-limpar-no',
    );
  });

  it('Should split on any whitespace, including line breaks', () => {
    expect(branchFromDescription('  Faz X\ncom\texemplo  ')).toBe(
      'faz-x-com-exemplo',
    );
  });

  it('Should count five words past leading and repeated whitespace', () => {
    expect(
      branchFromDescription('\n  um  dois \n tres quatro cinco seis'),
    ).toBe('um-dois-tres-quatro-cinco');
  });

  it('Should fall back to task when nothing is usable', () => {
    expect(branchFromDescription('  ###  ')).toBe('task');
    expect(branchFromDescription('🚀 ✨')).toBe('task');
  });

  it('Should cap the name at 40 characters', () => {
    expect(branchFromDescription('a'.repeat(60))).toBe('a'.repeat(40));
  });

  it('Should not start or end with a dash', () => {
    expect(branchFromDescription('--abc--')).toBe('abc');
    expect(branchFromDescription(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
  });

  it('Should keep digits and turn every other run into one dash', () => {
    expect(branchFromDescription('/supera:ship fix #42')).toBe(
      'supera-ship-fix-42',
    );
  });
});

describe('branchCandidate', () => {
  it('Should try the name itself first, then number it from 2', () => {
    expect(branchCandidate('faz-x', 1)).toBe('faz-x');
    expect(branchCandidate('faz-x', 2)).toBe('faz-x-2');
    expect(branchCandidate('faz-x', 10)).toBe('faz-x-10');
  });
});
