import type {Channel} from '../../core/domain/fly-api';
import type {Workspace} from '../../core/domain/workspace';
import type {Broadcaster} from './ipc-types';

// Sends each window the snapshot of its own workspace, only when it differs
// from the last one that window got. A window that fails is logged and left
// out, never holding up the others; a window no longer listed is forgotten.
export class WindowBroadcast<T> {
  private last = new Map<number, string>();

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly channel: Channel,
    private readonly snapshot: (workspace: Workspace) => Promise<T>,
    private readonly onError: (error: unknown) => void,
  ) {}

  async update(windows: [number, Workspace][]): Promise<void> {
    const sent = new Map<number, string>();
    await Promise.all(
      windows.map(async ([windowId, workspace]) => {
        try {
          const value = await this.snapshot(workspace);
          const serialized = JSON.stringify(value);
          sent.set(windowId, serialized);
          if (serialized !== this.last.get(windowId)) {
            this.broadcaster.sendTo(windowId, this.channel, value);
          }
        } catch (error) {
          this.onError(error);
        }
      }),
    );
    this.last = sent;
  }
}
