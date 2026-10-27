import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {TaskRecord, TASKS_FILE} from '../../core/domain/task';
import {FileStore} from '../../core/interfaces/file-store';
import {TaskStore} from '../../core/interfaces/task-store';
import {USER_DATA_DIR} from './tokens';

const PHASES: readonly unknown[] = [
  'working',
  'opening',
  'ci',
  'fixing',
  'reviewing',
  'stopped',
];

const isRecord = (value: unknown): value is TaskRecord => {
  const r = (value ?? {}) as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.repoPath === 'string' &&
    typeof r.worktreePath === 'string' &&
    typeof r.branch === 'string' &&
    typeof r.base === 'string' &&
    PHASES.includes(r.phase) &&
    typeof r.ciAttempts === 'number' &&
    typeof r.createdAt === 'number'
  );
};

@Injectable()
export class JsonTaskStoreService extends TaskStore {
  private readonly path: string;
  private readonly tmpPath: string;
  private records: TaskRecord[] | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly fileStore: FileStore,
    @Inject(USER_DATA_DIR) dir: string,
  ) {
    super();
    this.path = join(dir, TASKS_FILE);
    this.tmpPath = `${this.path}.tmp`;
  }

  list(): Promise<TaskRecord[]> {
    return this.serial(async () => structuredClone(await this.load()));
  }

  get(worktreePath: string): Promise<TaskRecord | null> {
    return this.serial(async () => {
      const records = await this.load();
      const found = records.find(r => r.worktreePath === worktreePath);
      return found ? structuredClone(found) : null;
    });
  }

  save(record: TaskRecord): Promise<void> {
    return this.serial(async () => {
      const records = await this.load();
      const copy = structuredClone(record);
      const index = records.findIndex(
        r => r.worktreePath === copy.worktreePath,
      );
      if (index === -1) {
        records.push(copy);
      } else {
        records[index] = copy;
      }
      await this.persist(records);
    });
  }

  remove(worktreePath: string): Promise<void> {
    return this.serial(async () => {
      const records = await this.load();
      const index = records.findIndex(r => r.worktreePath === worktreePath);
      if (index === -1) {
        return;
      }
      records.splice(index, 1);
      await this.persist(records);
    });
  }

  // One operation at a time, in call order: the first load happens once and
  // writes never overlap. A failed operation does not block the next one.
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async load(): Promise<TaskRecord[]> {
    this.records ??= await this.read();
    return this.records;
  }

  private async read(): Promise<TaskRecord[]> {
    try {
      if (!(await this.fileStore.exists(this.path))) {
        return [];
      }
      const parsed: unknown = JSON.parse(
        await this.fileStore.readText(this.path),
      );
      // A JSON value that is not an array has no filter(): it throws and is
      // kept aside like any other damaged file.
      return (parsed as unknown[]).filter(isRecord);
    } catch {
      // damaged: kept aside below
    }
    await this.keepDamaged();
    return [];
  }

  // The damaged file is moved aside, never overwritten; if even that fails the
  // next save overwrites it.
  private async keepDamaged(): Promise<void> {
    try {
      await this.fileStore.rename(this.path, `${this.path}.bad-${Date.now()}`);
    } catch {
      // nothing more to do
    }
  }

  private async persist(records: TaskRecord[]): Promise<void> {
    await this.fileStore.writeText(
      this.tmpPath,
      JSON.stringify(records, null, 2),
    );
    await this.fileStore.rename(this.tmpPath, this.path);
  }
}
