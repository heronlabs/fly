import {
  access,
  mkdir,
  readdir,
  readFile,
  realpath,
  stat as fsStat,
  writeFile,
} from 'node:fs/promises';
import {dirname} from 'node:path';

import {Injectable} from '@nestjs/common';

import {DirEntry, FileStat, FileStore} from '../../core/interfaces/file-store';

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

  realPath(path: string): Promise<string> {
    return realpath(path);
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
    await writeFile(path, content);
  }

  createText(path: string, content: string): Promise<void> {
    return writeFile(path, content, {flag: 'wx'});
  }

  async stat(path: string): Promise<FileStat> {
    const info = await fsStat(path);
    return {
      size: info.size,
      mtimeMs: info.mtimeMs,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
    };
  }
}
