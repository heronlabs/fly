import {Injectable} from '@nestjs/common';

import {FLY_RELEASES_API} from '../../core/domain/setup';
import {CommandRunner} from '../../core/interfaces/command-runner';
import {ReleaseSource} from '../../core/interfaces/release-source';
import type {Fields} from './json-fields';

const INVALID = 'Resposta inesperada do GitHub';
const TAG_PATTERN = /^v?\d+(\.\d+)+$/;
// The URL is opened with `shell.openExternal`: only the repo's releases.
const URL_PREFIX = 'https://github.com/heronlabs/fly/releases/';

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
    try {
      const {tag_name: tag, html_url: url} = JSON.parse(
        result.stdout,
      ) as Fields;
      // Stryker disable next-line ConditionalExpression: a non-string url makes startsWith throw into the catch below: the same answer.
      const validUrl = typeof url === 'string' && url.startsWith(URL_PREFIX);
      // Stryker disable next-line ConditionalExpression: a non-string tag makes slice/startsWith throw into the catch below: the same answer.
      if (typeof tag === 'string' && TAG_PATTERN.test(tag) && validUrl) {
        const version = tag.startsWith('v') ? tag.slice(1) : tag;
        return {version, url: url as string};
      }
    } catch {
      // Invalid JSON, or null: the same unexpected answer below.
    }
    throw new Error(INVALID);
  }
}
