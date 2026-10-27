import {TaskRecord} from '../domain/task';

export abstract class TaskStore {
  abstract list(): Promise<TaskRecord[]>;
  abstract get(worktreePath: string): Promise<TaskRecord | null>;
  abstract save(record: TaskRecord): Promise<void>;
  abstract remove(worktreePath: string): Promise<void>;
}
