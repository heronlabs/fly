import {dirname, join, sep} from 'node:path';

import {Injectable} from '@nestjs/common';

import {
  Eol,
  FileContent,
  FileEntry,
  FilesPoll,
  WriteResult,
} from '../domain/files';
import {SearchQuery, SearchResult} from '../domain/search';
import {Worktree} from '../domain/workspace';
import {FileStore} from '../interfaces/file-store';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {
  detectEol,
  INVALID_PATH,
  isBinary,
  MAX_FILE_BYTES,
  safeRelativePath,
  toLf,
  visibleEntries,
  withEol,
} from './file-rules';
import {
  emptySearch,
  highlighter,
  MAX_HITS_PER_FILE,
  resultOf,
} from './search-rules';
import {errorMessage, SessionService} from './session-service';

export const OUTSIDE_WORKTREE = 'Caminho fora do worktree';
export const NOT_A_FILE = 'Não é um arquivo';
export const CHANGED_ON_DISK =
  'Arquivo mudou no disco; recarregue antes de salvar';

type Resolved = {absolute: string; exists: boolean};

@Injectable()
export class FileService {
  constructor(
    private readonly sessions: SessionService,
    private readonly files: FileStore,
    private readonly vcs: VcsGateway,
  ) {}

  async list(worktreeId: string, dir: string): Promise<FileEntry[]> {
    const {absolute} = await this.resolve(this.worktree(worktreeId), dir);
    return visibleEntries(await this.files.readDir(absolute));
  }

  async read(worktreeId: string, path: string): Promise<FileContent> {
    const {absolute} = await this.resolve(this.worktree(worktreeId), path);
    const stat = await this.files.stat(absolute);
    if (!stat.isFile) throw new Error(NOT_A_FILE);
    if (stat.size > MAX_FILE_BYTES) {
      return {kind: 'large', path, bytes: stat.size};
    }
    const raw = await this.files.readText(absolute);
    if (isBinary(raw)) return {kind: 'binary', path};
    return {
      kind: 'text',
      path,
      text: toLf(raw),
      eol: detectEol(raw),
      mtimeMs: stat.mtimeMs,
    };
  }

  async write(
    worktreeId: string,
    path: string,
    text: string,
    eol: Eol,
    expectedMtimeMs: number | null,
  ): Promise<WriteResult> {
    const {absolute, exists} = await this.resolve(
      this.worktree(worktreeId),
      path,
    );
    const content = withEol(text, eol);
    if (exists) {
      if (
        expectedMtimeMs !== null &&
        (await this.files.stat(absolute)).mtimeMs !== expectedMtimeMs
      ) {
        throw new Error(CHANGED_ON_DISK);
      }
      await this.files.writeText(absolute, content);
    } else {
      await this.create(absolute, content);
    }
    return {mtimeMs: (await this.files.stat(absolute)).mtimeMs};
  }

  async poll(worktreeId: string, openPaths: string[]): Promise<FilesPoll> {
    const worktree = this.worktree(worktreeId);
    let flags: FilesPoll['flags'] = {};
    let error: string | null = null;
    try {
      flags = await this.vcs.status(worktree.path);
    } catch (e) {
      error = errorMessage(e);
    }
    const mtimes: FilesPoll['mtimes'] = {};
    for (const path of openPaths) {
      try {
        const {absolute} = await this.resolve(worktree, path);
        mtimes[path] = (await this.files.stat(absolute)).mtimeMs;
      } catch {
        mtimes[path] = null;
      }
    }
    return {flags, mtimes, error};
  }

  async search(worktreeId: string, query: SearchQuery): Promise<SearchResult> {
    const worktree = this.worktree(worktreeId);
    if (query.text === '') return emptySearch;
    const hits = await this.vcs.grep({
      worktreePath: worktree.path,
      query,
      maxPerFile: MAX_HITS_PER_FILE + 1,
    });
    return resultOf(hits, highlighter(query));
  }

  // access() follows links, so a dangling symlink (in any case or Unicode
  // form of its name) reads as missing; an exclusive create never follows it.
  // EEXIST also covers a file that reappeared since the last poll.
  private async create(absolute: string, content: string): Promise<void> {
    try {
      await this.files.createText(absolute, content);
    } catch (error) {
      if ((error as {code?: unknown}).code === 'EEXIST') {
        throw new Error(CHANGED_ON_DISK);
      }
      throw error;
    }
  }

  private worktree(worktreeId: string): Worktree {
    const worktree = this.sessions
      .currentWorkspace()
      ?.worktrees.find(w => w.id === worktreeId);
    if (!worktree) throw new Error('Worktree não encontrado');
    return worktree;
  }

  // The target's real path (its parent's, for a file not created yet) must be
  // the worktree's real path or inside it: a symlink cannot lead outside.
  private async resolve(worktree: Worktree, rel: string): Promise<Resolved> {
    const safe = safeRelativePath(rel);
    if (safe === null) throw new Error(INVALID_PATH);
    const absolute = join(worktree.path, safe);
    const root = await this.files.realPath(worktree.path);
    const exists = await this.files.exists(absolute);
    const real = await this.files.realPath(
      exists ? absolute : dirname(absolute),
    );
    if (real !== root && !real.startsWith(root + sep)) {
      throw new Error(OUTSIDE_WORKTREE);
    }
    return {absolute, exists};
  }
}
