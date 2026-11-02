import {Inject, Injectable, Logger} from '@nestjs/common';

import {channels} from '../../../core/domain/fly-api';
import type {SessionsSnapshot} from '../../../core/domain/session';
import {NewTaskInput} from '../../../core/domain/task';
import {SessionService} from '../../../core/services/session-service';
import {TaskService} from '../../../core/services/task-service';
import type {Broadcaster, FilePicker, IpcHost} from '../ipc-types';
import {BROADCASTER, FILE_PICKER, IPC_HOST} from '../ipc-types';
import {WindowBroadcast} from '../window-broadcast';
import {WindowWorkspacesService} from '../window-workspaces-service';

export const SESSION_POLL_MS = 3000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

@Injectable()
export class SessionHandler {
  private readonly logger = new Logger(SessionHandler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly broadcast: WindowBroadcast<SessionsSnapshot>;

  constructor(
    @Inject(IPC_HOST) private readonly host: IpcHost,
    @Inject(BROADCASTER) broadcaster: Broadcaster,
    private readonly sessions: SessionService,
    private readonly tasks: TaskService,
    @Inject(FILE_PICKER) private readonly picker: FilePicker,
    private readonly windows: WindowWorkspacesService,
  ) {
    this.broadcast = new WindowBroadcast(
      broadcaster,
      channels.sessionChanged,
      workspace => this.sessions.snapshot(workspace),
      error =>
        this.logger.error(`Falha ao atualizar sessões: ${errorMessage(error)}`),
    );
  }

  register(): void {
    this.host.handle(channels.sessionList, event =>
      this.sessions.snapshot(this.windows.of(event.sender.id)),
    );
    this.host.handle(channels.sessionStart, (event, worktreeId: string) =>
      this.refreshAfter(
        this.sessions.start(this.windows.of(event.sender.id), worktreeId),
      ),
    );
    this.host.handle(channels.sessionKill, (_event, name: string) =>
      this.refreshAfter(this.sessions.kill(name)),
    );
    this.host.handle(channels.taskCreate, (event, input: NewTaskInput) =>
      this.refreshAfter(
        this.tasks.create(this.windows.of(event.sender.id), input),
      ),
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
      await this.broadcast.update(this.windows.entries());
    } finally {
      this.running = false;
    }
  }
}
