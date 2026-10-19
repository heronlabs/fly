import {existsSync, watch} from 'node:fs';
import {join} from 'node:path';

import {Injectable, Logger} from '@nestjs/common';

import {WorkspaceWatcher} from '../../core/interfaces/workspace-watcher';

const DEBOUNCE_MS = 300;
const SAFETY_TICK_MS = 15_000;

@Injectable()
export class GitDirWatcherService extends WorkspaceWatcher {
  private readonly logger = new Logger(GitDirWatcherService.name);

  watch(repoPaths: string[], onChange: () => void): () => void {
    const watchers: {close(): void}[] = [];
    let disposed = false;
    let debounce: NodeJS.Timeout | undefined;

    const schedule = () => {
      if (disposed) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = undefined;
        onChange();
      }, DEBOUNCE_MS);
    };

    const attach = (dir: string, onEvent: () => void): boolean => {
      try {
        const watcher = watch(dir, {persistent: false}, onEvent);
        watcher.on('error', error => this.logWatchError(dir, error));
        watchers.push(watcher);
        return true;
      } catch (error) {
        this.logWatchError(dir, error);
        return false;
      }
    };

    for (const repo of repoPaths) {
      const gitDir = join(repo, '.git');
      const worktreesDir = join(gitDir, 'worktrees');
      let worktreesAttached = false;

      const attachWorktrees = () => {
        if (disposed || worktreesAttached || !existsSync(worktreesDir)) return;
        worktreesAttached = attach(worktreesDir, schedule);
      };

      attach(gitDir, () => {
        attachWorktrees();
        schedule();
      });
      attachWorktrees();
    }

    const tick = setInterval(onChange, SAFETY_TICK_MS);
    tick.unref();

    return () => {
      disposed = true;
      clearInterval(tick);
      clearTimeout(debounce);
      debounce = undefined;
      for (const watcher of watchers) watcher.close();
    };
  }

  private logWatchError(dir: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Failed to watch ${dir}: ${message}`);
  }
}
