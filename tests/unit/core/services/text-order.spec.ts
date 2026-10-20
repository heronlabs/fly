import {compareText} from '../../../../src/core/services/text-order';

describe('compareText', () => {
  it.each([
    ['a', 'b', -1],
    ['b', 'a', 1],
    ['a', 'a', 0],
    ['B', 'a', -1],
    ['ab', 'a', 1],
  ])('Should compare %s with %s as %i', (a, b, expected) =>
    expect(compareText(a, b)).toBe(expected),
  );
});
