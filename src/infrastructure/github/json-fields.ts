export type Fields = Record<string, unknown>;

// Object(value) === value is true only for objects: null and primitives fail.
export const isRecord = (value: unknown): value is Fields =>
  Object(value) === value && !Array.isArray(value);

export const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
