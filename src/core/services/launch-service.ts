import {Injectable} from '@nestjs/common';

import {ConfigStore} from '../interfaces/config-store';
import {FileStore} from '../interfaces/file-store';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {LaunchPlan, planLaunch, RecentRoot} from './launch-rules';

@Injectable()
export class LaunchService {
  constructor(
    private readonly fileStore: FileStore,
    private readonly vcs: VcsGateway,
    private readonly config: ConfigStore,
  ) {}

  // The real path of an existing directory.
  async folder(path: string): Promise<string> {
    try {
      const real = await this.fileStore.realPath(path);
      if ((await this.fileStore.stat(real)).isDirectory) return real;
    } catch {
      // A missing or unreadable path is no folder.
    }
    throw new Error(`Pasta não encontrada: ${path}`);
  }

  async plan(path: string): Promise<LaunchPlan> {
    const folder = await this.folder(path);
    const {recentRoots} = await this.config.load();
    // Outside a repo (or without git) the folder has no worktrees.
    // Stryker disable next-line ArrayDeclaration: planLaunch skips an entry without path or isMain, so a junk element plans like no worktree
    const worktrees = await this.vcs.listWorktrees(folder).catch(() => []);
    return planLaunch({
      folder,
      recentRoots: await this.realRoots(recentRoots),
      worktrees,
    });
  }

  // A recent root that no longer exists matches nothing.
  private async realRoots(roots: string[]): Promise<RecentRoot[]> {
    const resolved = await Promise.all(
      roots.map(root =>
        this.fileStore.realPath(root).then(
          realPath => ({root, realPath}),
          () => null,
        ),
      ),
    );
    return resolved.filter((recent): recent is RecentRoot => recent !== null);
  }
}
