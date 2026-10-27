import {suggestBranch} from '../../../src/application/ui/panels/branch-name';

describe('suggestBranch', () => {
  it('Should take the first five words, lowercase and without accents', () => {
    expect(suggestBranch('Adicionar ação de Limpar no PR')).toBe(
      'adicionar-acao-de-limpar-no',
    );
  });

  it('Should return an empty string when nothing is usable', () => {
    expect(suggestBranch('  ###  ')).toBe('');
  });

  it('Should cap the suggestion at 40 characters', () => {
    expect(suggestBranch('a'.repeat(60))).toBe('a'.repeat(40));
  });

  it('Should not start or end with a dash', () => {
    expect(suggestBranch('--abc--')).toBe('abc');
    expect(suggestBranch(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
  });
});
