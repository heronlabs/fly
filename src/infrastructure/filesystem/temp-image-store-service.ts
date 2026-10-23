import {mkdtemp, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {ImageStore} from '../../core/interfaces/image-store';
import {TEMP_DIR} from './tokens';

@Injectable()
export class TempImageStoreService extends ImageStore {
  constructor(@Inject(TEMP_DIR) private readonly tempDir: string) {
    super();
  }

  // A fresh private (0700) directory per image, so nothing is ever overwritten.
  async savePng(png: Uint8Array): Promise<string> {
    const dir = await mkdtemp(join(this.tempDir, 'fly-image-'));
    const path = join(dir, 'image.png');
    await writeFile(path, png);
    return path;
  }
}
