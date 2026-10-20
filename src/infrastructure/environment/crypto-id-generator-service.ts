import {randomBytes, randomUUID} from 'node:crypto';

import {Injectable} from '@nestjs/common';

import {IdGenerator} from '../../core/interfaces/id-generator';

@Injectable()
export class CryptoIdGeneratorService extends IdGenerator {
  hex(bytes: number): string {
    return randomBytes(bytes).toString('hex');
  }

  uuid(): string {
    return randomUUID();
  }
}
