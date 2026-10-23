import {Inject, Injectable} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import {ImageStore} from '../../../core/interfaces/image-store';
import type {IpcHost} from '../ipc-types';
import {IPC_HOST} from '../ipc-types';

@Injectable()
export class AttachmentHandler {
  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    private readonly images: ImageStore,
  ) {}

  register(): void {
    this.host.handle(channels.attachmentSaveImage, (_event, png: Uint8Array) =>
      this.images.savePng(png),
    );
  }
}
