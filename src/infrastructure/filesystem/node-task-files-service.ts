import {constants} from 'node:fs';
import {copyFile, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {basename, extname, join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {MAX_ATTACHMENT_BYTES, TASKS_DIR} from '../../core/domain/task';
import {TaskFiles} from '../../core/interfaces/task-files';
import {USER_DATA_DIR} from '../environment/tokens';

const isCode = (error: unknown, code: string): boolean =>
  (error as NodeJS.ErrnoException).code === code;

@Injectable()
export class NodeTaskFilesService extends TaskFiles {
  constructor(@Inject(USER_DATA_DIR) private readonly userDataDir: string) {
    super();
  }

  dir(taskId: string): string {
    return join(this.userDataDir, TASKS_DIR, taskId);
  }

  async write(taskId: string, name: string, content: string): Promise<string> {
    const dir = this.dir(taskId);
    await mkdir(dir, {recursive: true});
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  async read(taskId: string, name: string): Promise<string | null> {
    try {
      return await readFile(join(this.dir(taskId), name), 'utf8');
    } catch (error) {
      if (isCode(error, 'ENOENT')) {
        return null;
      }
      throw error;
    }
  }

  // Copies without ever overwriting: a taken name gets "-2", "-3", … before
  // the extension (COPYFILE_EXCL makes the check atomic).
  async copyIn(taskId: string, source: string): Promise<string> {
    const name = basename(source);
    if ((await stat(source)).size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Arquivo maior que 20 MB: ${name}`);
    }
    const dir = join(this.dir(taskId), 'attachments');
    await mkdir(dir, {recursive: true});
    const ext = extname(name);
    const stem = basename(name, ext);
    for (let n = 1; ; n++) {
      const target = join(dir, n === 1 ? name : `${stem}-${n}${ext}`);
      try {
        await copyFile(source, target, constants.COPYFILE_EXCL);
        return target;
      } catch (error) {
        if (!isCode(error, 'EEXIST')) {
          throw error;
        }
      }
    }
  }

  async remove(taskId: string): Promise<void> {
    await rm(this.dir(taskId), {recursive: true, force: true});
  }
}
