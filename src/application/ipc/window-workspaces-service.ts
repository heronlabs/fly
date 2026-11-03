import {Injectable} from '@nestjs/common';

import type {Workspace} from '../../core/domain/workspace';

// The workspace each window shows, by the id of the window's web contents. A
// window that has not opened a folder shows none.
@Injectable()
export class WindowWorkspacesService {
  private readonly byWindow = new Map<number, Workspace>();

  set(windowId: number, workspace: Workspace): void {
    this.byWindow.set(windowId, workspace);
  }

  of(windowId: number): Workspace | null {
    return this.byWindow.get(windowId) ?? null;
  }

  forget(windowId: number): void {
    this.byWindow.delete(windowId);
  }

  // Every window that shows a workspace, oldest first.
  entries(): [number, Workspace][] {
    return [...this.byWindow];
  }

  all(): Workspace[] {
    return [...this.byWindow.values()];
  }

  // The oldest window that shows root.
  windowOf(root: string): number | null {
    return this.entries().find(([, w]) => w.root === root)?.[0] ?? null;
  }
}
