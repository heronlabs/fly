import {join} from 'node:path';

import {Inject, Injectable} from '@nestjs/common';

import {TaskRecord, TASKS_FILE} from '../../core/domain/task';
import {FileStore} from '../../core/interfaces/file-store';
import {TaskStore} from '../../core/interfaces/task-store';
import {USER_DATA_DIR} from './tokens';

const isRecord = (value: unknown): value is TaskRecord => {
  const {id, worktreePath} = (value ?? {}) as Record<string, unknown>;
  return typeof id === 'string' && typeof worktreePath === 'string';
};

@Injectable()
export class JsonTaskStoreService extends TaskStore {
  private readonly path: string;
  private records: TaskRecord[] | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly fileStore: FileStore,
    @Inject(USER_DATA_DIR) dir: string,
  ) {
    super();
    this.path = join(dir, TASKS_FILE);
  }

  list(): Promise<TaskRecord[]> {
    return this.serial(async () => [...(await this.load())]);
  }

  get(worktreePath: string): Promise<TaskRecord | null> {
    return this.serial(async () => {
      const records = await this.load();
      return records.find(r => r.worktreePath === worktreePath) ?? null;
    });
  }

  save(record: TaskRecord): Promise<void> {
    return this.serial(async () => {
      const records = await this.load();
      const index = records.findIndex(
        r => r.worktreePath === record.worktreePath,
      );
      if (index === -1) {
        records.push(record);
      } else {
        records[index] = record;
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
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  }

  private async persist(records: TaskRecord[]): Promise<void> {
    await this.fileStore.writeText(this.path, JSON.stringify(records, null, 2));
  }
}
