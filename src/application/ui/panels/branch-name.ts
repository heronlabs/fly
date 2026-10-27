// Mirrors core/domain/task: the UI layer may not import it at runtime.
export const MODEL_OPTIONS = ['opus', 'sonnet', 'haiku'];
export const BRANCH_SUGGESTION_MAX = 40;
const WORDS = 5;

const trimDashes = (text: string) => text.replace(/^-+|-+$/g, '');

export const suggestBranch = (description: string): string => {
  const words = description.trim().split(/\s+/).slice(0, WORDS).join('-');
  const slug = words
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return trimDashes(trimDashes(slug).slice(0, BRANCH_SUGGESTION_MAX));
};
