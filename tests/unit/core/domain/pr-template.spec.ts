import {readFileSync} from 'node:fs';

import {PR_TEMPLATE} from '../../../../src/core/domain/pr-template';

describe('PR_TEMPLATE', () => {
  it('Should equal .github/PULL_REQUEST_TEMPLATE.md byte for byte', () => {
    expect(PR_TEMPLATE).toBe(
      readFileSync('.github/PULL_REQUEST_TEMPLATE.md', 'utf8'),
    );
  });
});
