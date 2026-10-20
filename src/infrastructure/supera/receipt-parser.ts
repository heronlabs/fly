import type {Receipt, ReceiptResult} from '../../core/domain/transcript';

export const RECEIPT_SUBAGENT = 'supera:supera-engineer';

type Json = Record<string, unknown>;
type Verdict = Receipt['verification'][string];

const FENCE_OPEN = /^\s*```\s*([^\s`]*)/;
const FENCE_CLOSE = /^\s*```\s*$/;
const VERDICTS: ReadonlySet<unknown> = new Set(['pass', 'fail', 'skipped']);

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVerdict = (value: unknown): value is Verdict => VERDICTS.has(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(item => typeof item === 'string');

const invalid = (problem: string): ReceiptResult => ({
  kind: 'invalid',
  problems: [problem],
});

/**
 * The body of the last ```json fence, read line by line like supera's
 * hooks/validate-receipt.sh: a fence opens on a ``` line of any language and
 * closes on a bare ``` line, and an unclosed trailing fence still counts.
 */
const lastJsonFence = (text: string): string | null => {
  let lang: string | null = null;
  let body: string[] = [];
  let found: string | null = null;
  for (const line of text.split('\n').map(raw => raw.replace(/\r$/, ''))) {
    if (lang === null) {
      const opened = FENCE_OPEN.exec(line)?.[1];
      if (opened !== undefined) {
        lang = opened;
        body = [];
      }
    } else if (FENCE_CLOSE.test(line)) {
      if (lang === 'json') found = body.join('\n');
      lang = null;
    } else {
      body.push(line);
    }
  }
  return lang === 'json' ? body.join('\n') : found;
};

/** JSON.parse never yields undefined, so undefined means "not JSON". */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

/** The last json fence, else the whole text when it is a JSON object. */
const extract = (text: string): unknown => {
  const fence = lastJsonFence(text);
  if (fence !== null) return parseJson(fence);
  const whole = parseJson(text.trim());
  return isRecord(whole) ? whole : undefined;
};

const problemsOf = ({
  summary,
  filesChanged,
  verification,
  notes,
  ...extra
}: Json): string[] => [
  ...(typeof summary === 'string' && summary !== ''
    ? []
    : ['summary must be a non-empty string']),
  ...(isStringArray(filesChanged)
    ? []
    : ['filesChanged must be an array of strings']),
  ...(isRecord(verification)
    ? Object.entries(verification)
        .filter(([, verdict]) => !isVerdict(verdict))
        .map(([key]) => `verification.${key} must be pass, fail or skipped`)
    : ['verification must be an object']),
  ...(notes === undefined || typeof notes === 'string'
    ? []
    : ['notes must be a string']),
  ...Object.keys(extra).map(key => `unexpected key ${key}`),
];

/**
 * Reads a supera-engineer receipt out of message text and checks it against
 * supera's receipt.schema.json (spike §8). Never throws.
 */
export const parseReceipt = (text: string): ReceiptResult => {
  const value = extract(text);
  if (value === undefined) return invalid('no JSON receipt');
  if (!isRecord(value)) return invalid('receipt must be an object');
  const problems = problemsOf(value);
  if (problems.length > 0) return {kind: 'invalid', problems};
  // problemsOf checked every key, so the object has the Receipt shape.
  return {kind: 'valid', receipt: value as Receipt};
};
