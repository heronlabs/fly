import {GENERATED_BRANCH_MAX} from '../domain/task';

const WORDS = 5;
// A description with no usable word, such as one made of emoji.
const FALLBACK = 'task';

// The slug never holds two dashes in a row.
const trimDashes = (text: string) => text.replace(/^-|-$/g, '');

// Only [a-z0-9-] with no dash at either end, so git always takes it as a
// branch name.
export const branchFromDescription = (description: string): string => {
  const words = description.trim().split(/\s+/).slice(0, WORDS).join('-');
  const slug = words
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return (
    trimDashes(trimDashes(slug).slice(0, GENERATED_BRANCH_MAX)) || FALLBACK
  );
};

// The name itself first, then name-2, name-3, …
export const branchCandidate = (name: string, attempt: number): string =>
  attempt === 1 ? name : `${name}-${attempt}`;
