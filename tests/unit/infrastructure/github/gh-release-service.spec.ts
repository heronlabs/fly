import {readFileSync} from 'node:fs';
import {join} from 'node:path';

import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {GhReleaseService} from '../../../../src/infrastructure/github/gh-release-service';

const payload = readFileSync(
  join(__dirname, '../../../fixtures/gh/release-latest.json'),
  'utf8',
);
const URL = 'https://github.com/heronlabs/fly/releases/tag/v0.3.0';

describe('GhReleaseService', () => {
  const run = vi.fn();
  const service = new GhReleaseService({run} as unknown as CommandRunner);
  const respond = (body: unknown) =>
    run.mockResolvedValue({code: 0, stdout: JSON.stringify(body), stderr: ''});
  const release = (patch: Record<string, unknown>) => ({
    tag_name: 'v0.3.0',
    html_url: URL,
    ...patch,
  });

  beforeEach(() => {
    run.mockReset();
  });

  it('Should call gh api for the latest release with a 15 s timeout and map it', async () => {
    run.mockResolvedValue({code: 0, stdout: payload, stderr: ''});

    await expect(service.latest()).resolves.toEqual({
      version: '0.3.0',
      url: URL,
    });
    expect(run).toHaveBeenCalledWith(
      'gh',
      ['api', 'repos/heronlabs/fly/releases/latest'],
      {timeoutMs: 15_000},
    );
  });

  it('Should accept a tag without the leading v', async () => {
    respond(release({tag_name: '1.2'}));

    await expect(service.latest()).resolves.toEqual({version: '1.2', url: URL});
  });

  it('Should reject with the trimmed stderr on a non-zero exit', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: 'HTTP 404\n'});

    await expect(service.latest()).rejects.toThrow(/^HTTP 404$/);
  });

  it('Should reject with a generic message when stderr is empty', async () => {
    run.mockResolvedValue({code: 1, stdout: '', stderr: ' '});

    await expect(service.latest()).rejects.toThrow('gh api failed');
  });

  it('Should propagate a runner rejection unchanged', async () => {
    const error = new Error('spawn gh ENOENT');
    run.mockImplementation(() => Promise.reject(error));

    await expect(service.latest()).rejects.toBe(error);
  });

  it('Should reject invalid JSON', async () => {
    run.mockResolvedValue({code: 0, stdout: '{nope', stderr: ''});

    await expect(service.latest()).rejects.toThrow(
      /^Resposta inesperada do GitHub$/,
    );
  });

  it.each([
    ['a null payload', null],
    ['a non-object payload', 'text'],
    ['an array payload', []],
    ['a missing tag_name', {html_url: URL}],
    ['a non-string tag_name', release({tag_name: 1.5})],
    ['a missing html_url', {tag_name: 'v0.3.0'}],
    ['a non-string html_url', release({html_url: 3})],
    ['a pre-release tag', release({tag_name: 'v0.3.0-rc.1'})],
    ['a tag with a prefix', release({tag_name: 'release-1.0'})],
    ['a tag with a suffix', release({tag_name: 'v1.0\n'})],
    ['a single-number tag', release({tag_name: 'v1'})],
    [
      'a foreign host',
      release({html_url: 'https://evil.example/heronlabs/fly/releases/x'}),
    ],
    [
      'a lookalike prefix',
      release({html_url: 'https://github.com/heronlabs/fly/releases'}),
    ],
    ['a prefix not at the start', release({html_url: `x${URL}`})],
  ])('Should reject %s', async (_name, body) => {
    respond(body);

    await expect(service.latest()).rejects.toThrow(
      /^Resposta inesperada do GitHub$/,
    );
  });
});
