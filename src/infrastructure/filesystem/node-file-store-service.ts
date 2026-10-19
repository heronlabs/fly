import {access, mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

import {Injectable} from '@nestjs/common';

import {DirEntry, FileStore} from '../../core/interfaces/file-store';

@Injectable()
export class NodeFileStoreService extends FileStore {
  async readDir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(path, {withFileTypes: true});
    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  readText(path: string): Promise<string> {
    return readFile(path, 'utf8');
  }

  async writeText(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), {recursive: true});
    await writeFile(path, content, 'utf8');
  }
}
