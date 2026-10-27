export abstract class TaskFiles {
  abstract dir(taskId: string): string;
  abstract write(
    taskId: string,
    name: string,
    content: string,
  ): Promise<string>;
  abstract read(taskId: string, name: string): Promise<string | null>;
  abstract copyIn(taskId: string, source: string): Promise<string>;
  abstract remove(taskId: string): Promise<void>;
}
