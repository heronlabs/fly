import {Injectable} from '@nestjs/common';

import {FLY_RELEASES_API} from '../../core/domain/setup';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {ReleaseSource} from '../../core/interfaces/release-source';
import {type Fields, isRecord, stringOrNull} from './json-fields';

const INVALID = 'Resposta inesperada do GitHub';
const TAG_PATTERN = /^v?\d+(\.\d+)+$/;
// The URL is opened with `shell.openExternal`: only the repo's releases.
const URL_PREFIX = 'https://github.com/heronlabs/fly/releases/';

const parseFields = (stdout: string): Fields => {
  try {
    const value: unknown = JSON.parse(stdout);
    if (isRecord(value)) return value;
  } catch {
    // Invalid JSON: the same unexpected answer below.
  }
  throw new Error(INVALID);
};

@Injectable()
export class GhReleaseService extends ReleaseSource {
  constructor(private readonly runner: CommandRunner) {
    super();
  }

  async latest(): Promise<{version: string; url: string}> {
    const result = await this.runner.run('gh', ['api', FLY_RELEASES_API], {
      timeoutMs: 15_000,
    });
    if (result.code !== 0) {
      throw new Error(result.stderr.trim() || 'gh api failed');
    }
    const fields = parseFields(result.stdout);
    const url = stringOrNull(fields.html_url);
    const tag = stringOrNull(fields.tag_name);
    if (
      url === null ||
      !url.startsWith(URL_PREFIX) ||
      tag === null ||
      !tag.match(TAG_PATTERN)
    ) {
      throw new Error(INVALID);
    }
    return {version: tag.startsWith('v') ? tag.slice(1) : tag, url};
  }
}
