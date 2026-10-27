import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {SessionsSnapshot} from '../../../core/domain/session';
import {NewTaskInput} from '../../../core/domain/task';
import {SessionService} from '../../../core/services/session-service';
import {TaskService} from '../../../core/services/task-service';
import type {Broadcaster, FilePicker, IpcHost} from '../ipc-types';
import {BROADCASTER, FILE_PICKER, IPC_HOST} from '../ipc-types';

export const SESSION_POLL_MS = 3000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class SessionHandler {
  private readonly logger = new Logger(SessionHandler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastBroadcast: string | null = null;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) private readonly broadcaster: Broadcaster,
    private readonly sessions: SessionService,
    private readonly tasks: TaskService,
    @Inject(FILE_PICKER) private readonly picker: FilePicker,
  ) {}

  register(): void {
    this.host.handle(channels.sessionList, () => this.list());
    this.host.handle(channels.sessionStart, (_event, worktreeId: string) =>
      this.refreshAfter(this.sessions.start(worktreeId)),
    );
    this.host.handle(channels.sessionKill, (_event, name: string) =>
      this.refreshAfter(this.sessions.kill(name)),
    );
    this.host.handle(channels.taskCreate, (_event, input: NewTaskInput) =>
      this.refreshAfter(this.tasks.create(input)),
    );
    this.host.handle(channels.taskPickAttachments, () => this.picker.pick());
    this.stop();
    this.timer = setInterval(() => void this.tick(), SESSION_POLL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async list(): Promise<SessionsSnapshot> {
    await this.bind();
    return this.sessions.snapshot();
  }

  private async bind(): Promise<void> {
    try {
      await this.tasks.bind();
    } catch (error) {
      this.logger.error(`Falha ao vincular tarefas: ${errorMessage(error)}`);
    }
  }

  // Returns the action's result, then refreshes the renderer right away.
  private async refreshAfter<T>(action: Promise<T>): Promise<T> {
    const result = await action;
    void this.tick();
    return result;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.bind();
      const snapshot = await this.sessions.snapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized !== this.lastBroadcast) {
        this.lastBroadcast = serialized;
        this.broadcaster.send(channels.sessionChanged, snapshot);
      }
    } catch (error) {
      this.logger.error(`Falha ao atualizar sessões: ${errorMessage(error)}`);
    } finally {
      this.running = false;
    }
  }
}
