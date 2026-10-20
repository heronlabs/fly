// Three-way comparison by UTF-16 code units, the order of the `<` operator.
export const compareText = (a: string, b: string): number =>
  Number(a > b) - Number(a < b);
