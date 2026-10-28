import {TaskRecord} from '../domain/task';

export abstract class TaskStore {
  abstract list(): Promise<TaskRecord[]>;
  abstract get(worktreePath: string): Promise<TaskRecord | null>;
  abstract save(record: TaskRecord): Promise<void>;
  // Saves `after` only while the stored record still deep-equals `before`;
  // false, writing nothing, when it changed or is gone.
  abstract saveIfUnchanged(
    before: TaskRecord,
    after: TaskRecord,
  ): Promise<boolean>;
  abstract remove(worktreePath: string): Promise<void>;
}
