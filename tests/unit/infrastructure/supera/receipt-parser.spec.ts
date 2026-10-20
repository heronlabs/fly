import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {parseTaskNotification} from '../../../../src/infrastructure/claude/transcript-parser';
import {parseReceipt} from '../../../../src/infrastructure/supera/receipt-parser';

const FIXTURES = join(__dirname, '../../../fixtures');

type Schema = {
  required: string[];
  additionalProperties: boolean;
  properties: Record<string, unknown> & {
    verification: {additionalProperties: {enum: string[]}};
  };
};

const readFixture = (path: string): string =>
  readFileSync(join(FIXTURES, path), 'utf8');

const RECEIPT = {summary: 's', filesChanged: [], verification: {}};

const fence = (body: string, lang = 'json'): string =>
  '```' + lang + '\n' + body + '\n```';

const json = (value: unknown): string => JSON.stringify(value);

/** Spike fixture R3: the engineer's last assistant text block. */
const R3_TEXT =
  '```json\n{"summary":"Add retry","filesChanged":["src/a.ts"],"verification":{"build":"pass - ran pnpm build"}}\n```';

const NO_RECEIPT = {kind: 'invalid', problems: ['no JSON receipt']};

describe('parseReceipt', () => {
  it("Should agree with supera's receipt.schema.json", () => {
    const schema = JSON.parse(
      readFixture('supera/receipt.schema.json'),
    ) as Schema;

    expect(schema.required).toEqual([
      'summary',
      'filesChanged',
      'verification',
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.verification.additionalProperties.enum).toEqual([
      'pass',
      'fail',
      'skipped',
    ]);
    expect(Object.keys(schema.properties).sort()).toEqual([
      'filesChanged',
      'notes',
      'summary',
      'verification',
    ]);

    expect(parseReceipt(json(RECEIPT))).toStrictEqual({
      kind: 'valid',
      receipt: RECEIPT,
    });
    expect(parseReceipt(json({...RECEIPT, extra: 1}))).toEqual({
      kind: 'invalid',
      problems: ['unexpected key extra'],
    });
  });

  it('Should read the receipt from the R1 notification result', () => {
    const [, , notificationLine] = readFixture('transcripts/r1.jsonl').split(
      '\n',
    );
    const content = (
      JSON.parse(notificationLine!) as {message: {content: string}}
    ).message.content;

    expect(parseReceipt(parseTaskNotification(content)!.result!)).toStrictEqual(
      {
        kind: 'valid',
        receipt: {
          summary: 'Add retry',
          filesChanged: ['src/a.ts', 'tests/a.test.ts'],
          verification: {build: 'pass', lint: 'pass', unit: 'pass'},
        },
      },
    );
  });

  it('Should reject prose in a verification value (R3)', () => {
    const result = parseReceipt(R3_TEXT);

    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.problems).toContain(
      'verification.build must be pass, fail or skipped',
    );
  });

  it('Should use the last json fence', () => {
    const text = [
      fence(json({...RECEIPT, summary: 'first'})),
      'then',
      fence(json({...RECEIPT, summary: 'last'})),
    ].join('\n');

    expect(parseReceipt(text)).toMatchObject({
      kind: 'valid',
      receipt: {summary: 'last'},
    });
  });

  it('Should skip a fence in another language', () => {
    const text = [
      fence(json({...RECEIPT, summary: 'code'}), 'ts'),
      fence(json({...RECEIPT, summary: 'receipt'})),
    ].join('\n');

    expect(parseReceipt(text)).toMatchObject({
      kind: 'valid',
      receipt: {summary: 'receipt'},
    });
  });

  it('Should read a bare JSON object', () => {
    expect(parseReceipt(`  \n${json(RECEIPT)}\n  `)).toStrictEqual({
      kind: 'valid',
      receipt: RECEIPT,
    });
  });

  it('Should find no receipt in prose', () => {
    expect(parseReceipt('Implemented the retry.')).toEqual(NO_RECEIPT);
  });

  it('Should take the whole text only when it is a JSON object', () => {
    for (const text of ['[1]', 'null', '"s"', '3', '', '{"summary":']) {
      expect(parseReceipt(text)).toEqual(NO_RECEIPT);
    }
  });

  it('Should require a fenced receipt to be an object', () => {
    for (const body of ['[1]', 'null', '"s"']) {
      expect(parseReceipt(fence(body))).toEqual({
        kind: 'invalid',
        problems: ['receipt must be an object'],
      });
    }
  });

  it('Should report every problem', () => {
    expect(
      parseReceipt(
        '{"summary":"","filesChanged":"x","verification":[],"notes":1}',
      ),
    ).toEqual({
      kind: 'invalid',
      problems: [
        'summary must be a non-empty string',
        'filesChanged must be an array of strings',
        'verification must be an object',
        'notes must be a string',
      ],
    });
  });

  it('Should report missing keys, bad verdicts and unexpected keys', () => {
    const text = json({
      filesChanged: ['src/a.ts', 1],
      verification: {build: 'fail', lint: 'pass - ok', unit: 'skipped', e2e: 1},
      extra: 1,
      more: null,
    });

    expect(parseReceipt(text)).toEqual({
      kind: 'invalid',
      problems: [
        'summary must be a non-empty string',
        'filesChanged must be an array of strings',
        'verification.lint must be pass, fail or skipped',
        'verification.e2e must be pass, fail or skipped',
        'unexpected key extra',
        'unexpected key more',
      ],
    });
    expect(parseReceipt(json({summary: 1, verification: null}))).toEqual({
      kind: 'invalid',
      problems: [
        'summary must be a non-empty string',
        'filesChanged must be an array of strings',
        'verification must be an object',
      ],
    });
  });

  it('Should keep string notes and reject null notes', () => {
    expect(
      parseReceipt(json({...RECEIPT, notes: 'already done'})),
    ).toStrictEqual({
      kind: 'valid',
      receipt: {...RECEIPT, notes: 'already done'},
    });
    expect(parseReceipt(json({...RECEIPT, notes: null}))).toEqual({
      kind: 'invalid',
      problems: ['notes must be a string'],
    });
  });

  describe('fences', () => {
    it('Should open after leading whitespace and close on a padded bare line', () => {
      const text = `Done.\n  \`\`\` json\n${json(RECEIPT)}\n  \`\`\`  \nBye.`;

      expect(parseReceipt(text)).toMatchObject({kind: 'valid'});
    });

    it('Should not read a json5 fence as json', () => {
      expect(parseReceipt(fence(json(RECEIPT), 'json5'))).toEqual(NO_RECEIPT);
    });

    it('Should read a non-bare ``` line inside an open fence as body', () => {
      const text = ['```md', fence(json(RECEIPT)), 'done'].join('\n');

      expect(parseReceipt(text)).toEqual(NO_RECEIPT);
    });

    it('Should use an unclosed trailing json fence', () => {
      expect(parseReceipt(`Done.\n\`\`\`json\n${json(RECEIPT)}`)).toStrictEqual(
        {kind: 'valid', receipt: RECEIPT},
      );
    });

    it('Should trim a trailing \\r from each line', () => {
      const text = fence(json(RECEIPT)).split('\n').join('\r\n') + '\r\n';

      expect(parseReceipt(text)).toStrictEqual({
        kind: 'valid',
        receipt: RECEIPT,
      });
    });

    it('Should use the last json fence even when it is empty or not JSON', () => {
      const first = fence(json(RECEIPT));

      expect(parseReceipt(`${first}\n\`\`\`json\n\`\`\``)).toEqual(NO_RECEIPT);
      expect(parseReceipt(`${first}\n${fence('  ')}`)).toEqual(NO_RECEIPT);
      expect(parseReceipt(`${first}\n${fence('{"summary":')}`)).toEqual(
        NO_RECEIPT,
      );
    });
  });
});
