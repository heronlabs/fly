import {Injectable} from '@nestjs/common';

import type {UpdateNotice} from '../domain/setup';
import {AppRuntime} from '../interfaces/app-runtime';
import {ReleaseSource} from '../interfaces/release-source';
import {isNewer} from './setup-rules';

@Injectable()
export class UpdateService {
  private notice: UpdateNotice | null = null;

  constructor(
    private readonly releases: ReleaseSource,
    private readonly runtime: AppRuntime,
  ) {}

  current(): UpdateNotice | null {
    return this.notice;
  }

  // Any failure is silent: the previous notice stays.
  async check(): Promise<UpdateNotice | null> {
    try {
      const latest = await this.releases.latest();
      this.notice = isNewer(latest.version, this.runtime.version)
        ? {version: latest.version, url: latest.url}
        : null;
    } catch {
      // keep the previous notice
    }
    return this.notice;
  }
}
