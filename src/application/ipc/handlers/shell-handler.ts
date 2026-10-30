import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {IpcHost, LinkOpener} from '../ipc-types';
import {IPC_HOST, LINK_OPENER} from '../ipc-types';

const NOT_ALLOWED = 'URL não permitida';
const WEB_PROTOCOLS = ['http:', 'https:'];

@Injectable()
export class ShellHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(LINK_OPENER) private readonly links: LinkOpener,
  ) {}

  register(): void {
    this.host.handle(
      channels.shellOpenExternal,
      async (_event, url: string) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error(NOT_ALLOWED);
        }
        if (!WEB_PROTOCOLS.includes(parsed.protocol)) {
          throw new Error(NOT_ALLOWED);
        }
        return this.links.open(url);
      },
    );
  }
}
