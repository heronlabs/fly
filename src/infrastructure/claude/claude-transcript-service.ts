import {open, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import type {TranscriptSummary} from '../../core/domain/transcript';
import {TranscriptSource} from '../../core/interfaces/transcript-source';
import {CLAUDE_PROJECTS_DIR} from './tokens';
import {TranscriptParser} from './transcript-parser';

/** Spike §1: every char of the launch cwd outside [A-Za-z0-9] becomes `-`. */
export const projectDirName = (cwd: string): string =>
  cwd.replace(/[^A-Za-z0-9]/g, '-');

export const LIVE_WINDOW_MS = 10 * 60_000;

const EXTENSION = '.jsonl';
const MAX_CACHED_FILES = 64;
const CHUNK_BYTES = 1024 * 1024;
const OWNER_SCAN_BYTES = 256 * 1024;
const NEWLINE = 0x0a;

/** How far a file has been read, and the parser fed with its lines. */
type Tail = {
  ino: number;
  offset: number;
  /** The bytes after the last newline read: a line still being written. */
  remainder: Buffer;
  parser: TranscriptParser;
};

type Transcript = {path: string; stem: string; mtimeMs: number; size: number};
type SessionInput = Parameters<TranscriptSource['forSession']>[0];
type DirectoryInput = Parameters<TranscriptSource['forDirectory']>[0];

const nullIfMissing = (error: unknown): null => {
  if ((error as {code?: unknown}).code === 'ENOENT') return null;
  throw error;
};

/** `undefined` for a file that vanished mid-listing; anything else rejects. */
const skipIfMissing = (error: unknown): undefined => {
  if ((error as {code?: unknown}).code === 'ENOENT') return undefined;
  throw error;
};

/** The complete lines of `bytes`, decoded as UTF-8. */
const completeLines = (bytes: Buffer): string[] =>
  bytes.toString('utf8', 0, bytes.lastIndexOf(NEWLINE) + 1).split('\n');

const lineOwner = (line: string): string | null => {
  try {
    // Destructuring `null` throws too, so every non-object line lands here.
    const {session_id: owner} = JSON.parse(line) as {session_id?: unknown};
    return typeof owner === 'string' ? owner : null;
  } catch {
    return null;
  }
};

const newest = (files: Transcript[]): Transcript | undefined =>
  [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)[0];

/**
 * Tails Claude Code transcripts under the projects dir (read-only) into
 * TranscriptParsers, from a saved byte offset per file (spike "File
 * resolution" and §10).
 */
@Injectable()
export class ClaudeTranscriptService extends TranscriptSource {
  /** Least recently read first. */
  private readonly tails = new Map<string, Tail>();
  /** The in-flight read per path; later callers chain onto it. */
  private readonly reads = new Map<string, Promise<TranscriptSummary>>();
  /** A file's owner `session_id`, or null once 256 KiB held none. */
  private readonly owners = new Map<string, string | null>();
  /** The launch file's path → the /clear successor that replaced it. */
  private readonly successors = new Map<string, string>();

  constructor(
    @Inject(CLAUDE_PROJECTS_DIR) private readonly projectsDir: string,
  ) {
    super();
  }

  forSession(input: SessionInput): Promise<TranscriptSummary | null> {
    return this.sessionSummary(input).catch(nullIfMissing);
  }

  forDirectory(
    input: DirectoryInput,
  ): Promise<TranscriptSummary | 'ambiguous' | null> {
    return this.directorySummary(input).catch(nullIfMissing);
  }

  private async sessionSummary({
    launchCwd,
    sessionId,
  }: SessionInput): Promise<TranscriptSummary> {
    const dir = join(this.projectsDir, projectDirName(launchCwd));
    const launchFile = join(dir, sessionId + EXTENSION);
    const current = this.successors.get(launchFile) ?? launchFile;
    const {mtimeMs} = await stat(current);
    const newer = (await this.transcripts(dir)).filter(
      file => file.path !== current && file.mtimeMs > mtimeMs,
    );
    const owned = await this.owned(newer);
    const successor = newest(
      owned.filter(([, owner]) => owner === sessionId).map(([file]) => file),
    );
    if (successor === undefined) return this.read(current);
    this.successors.set(launchFile, successor.path);
    return this.read(successor.path);
  }

  private async directorySummary({
    cwd,
    since,
    exclude,
    now,
  }: DirectoryInput): Promise<TranscriptSummary | 'ambiguous' | null> {
    const excluded = new Set<string | null>(exclude);
    const dir = join(this.projectsDir, projectDirName(cwd));
    const recent = (await this.transcripts(dir)).filter(
      file => file.mtimeMs >= since && !excluded.has(file.stem),
    );
    const candidates = (await this.owned(recent))
      .filter(([, owner]) => !excluded.has(owner))
      .map(([file]) => file);
    const live = candidates.filter(
      file => file.mtimeMs >= now - LIVE_WINDOW_MS,
    );
    if (live.length > 1) return 'ambiguous';
    const file = newest(candidates);
    return file === undefined ? null : this.read(file.path);
  }

  private async transcripts(dir: string): Promise<Transcript[]> {
    const names = (await readdir(dir)).filter(name => name.endsWith(EXTENSION));
    const found = await Promise.all(
      names.map(async name => {
        const path = join(dir, name);
        const stats = await stat(path).catch(skipIfMissing);
        if (stats === undefined) return undefined;
        const {mtimeMs, size} = stats;
        return {path, stem: name.slice(0, -EXTENSION.length), mtimeMs, size};
      }),
    );
    return found.filter((file): file is Transcript => file !== undefined);
  }

  /** Each file with its owner, leaving out those that vanished meanwhile. */
  private async owned(
    files: Transcript[],
  ): Promise<[Transcript, string | null][]> {
    const owners = await Promise.all(
      files.map(file => this.owner(file).catch(skipIfMissing)),
    );
    return files.flatMap((file, index) => {
      const owner = owners[index];
      return owner === undefined ? [] : [[file, owner]];
    });
  }

  /** The first string `session_id` in the complete lines of the first 256 KiB. */
  private async owner({path, size}: Transcript): Promise<string | null> {
    const cached = this.owners.get(path);
    if (cached !== undefined) return cached;
    const length = Math.min(size, OWNER_SCAN_BYTES);
    const head = Buffer.alloc(length);
    const handle = await open(path, 'r');
    let bytesRead: number;
    try {
      ({bytesRead} = await handle.read(head, 0, length, 0));
    } finally {
      await handle.close();
    }
    let owner: string | null = null;
    for (const line of completeLines(head.subarray(0, bytesRead))) {
      owner = lineOwner(line);
      if (owner !== null) break;
    }
    // A smaller file without one may still get it: check it again next time.
    if (owner !== null || bytesRead === OWNER_SCAN_BYTES) {
      this.owners.set(path, owner);
    }
    return owner;
  }

  /** One tail per path at a time, so no byte is pushed into a parser twice. */
  private read(path: string): Promise<TranscriptSummary> {
    const run = (): Promise<TranscriptSummary> => this.tail(path);
    const previous = this.reads.get(path);
    const current = previous === undefined ? run() : previous.then(run, run);
    this.reads.set(path, current);
    const release = (): void => {
      if (this.reads.get(path) === current) this.reads.delete(path);
    };
    void current.then(release, release);
    return current;
  }

  private async tail(path: string): Promise<TranscriptSummary> {
    const {ino, size} = await stat(path);
    let tail = this.tails.get(path);
    if (tail === undefined || tail.ino !== ino || size < tail.offset) {
      tail = {
        ino,
        offset: 0,
        remainder: Buffer.alloc(0),
        parser: new TranscriptParser(),
      };
    }
    this.tails.delete(path);
    this.tails.set(path, tail);
    for (const stale of [...this.tails.keys()].slice(0, -MAX_CACHED_FILES)) {
      this.tails.delete(stale);
    }
    if (size > tail.offset) await this.append(path, tail, size);
    return tail.parser.summary();
  }

  /**
   * Reads `[offset, size)` after the remainder and pushes every complete line.
   * Lines are split over the whole range, so one may span several chunks.
   */
  private async append(path: string, tail: Tail, size: number): Promise<void> {
    const data = Buffer.alloc(tail.remainder.length + size - tail.offset);
    tail.remainder.copy(data);
    let filled = tail.remainder.length;
    let position = tail.offset;
    const handle = await open(path, 'r');
    try {
      let bytesRead: number;
      do {
        const length = Math.min(CHUNK_BYTES, size - position);
        ({bytesRead} = await handle.read(data, filled, length, position));
        filled += bytesRead;
        position += bytesRead;
      } while (bytesRead > 0 && position < size);
    } finally {
      await handle.close();
    }
    const bytes = data.subarray(0, filled);
    for (const line of completeLines(bytes)) tail.parser.push(line);
    tail.remainder = Buffer.from(
      bytes.subarray(bytes.lastIndexOf(NEWLINE) + 1),
    );
    tail.offset = position;
  }
}
