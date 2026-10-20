import {posix, resolve} from 'node:path';

import {Injectable} from '@nestjs/common';

import {Repo, Workspace, Worktree} from '../domain/workspace';
import {DirEntry, FileStore} from '../interfaces/file-store';
import {VcsGateway} from '../interfaces/vcs-gateway';

const isScannable = (entry: DirEntry): boolean =>
  entry.isDirectory &&
  !entry.name.startsWith('.') &&
  entry.name !== 'node_modules';

const hasGitDir = (entries: DirEntry[]): boolean =>
  entries.some(entry => entry.name === '.git' && entry.isDirectory);

const byId = (a: {id: string}, b: {id: string}): number =>
  Number(a.id > b.id) - Number(a.id < b.id);

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly fileStore: FileStore,
    private readonly vcs: VcsGateway,
  ) {}

  async discover(root: string): Promise<Workspace> {
    const base = await this.fileStore.realPath(resolve(root));
    const repos = (await this.findRepos(base)).sort(byId);
    const perRepo = await Promise.all(
      repos.map(repo => this.loadWorktrees(base, repo)),
    );
    return {root, repos, worktrees: perRepo.flat()};
  }

  private async findRepos(base: string): Promise<Repo[]> {
    const repos: Repo[] = [];
    const top = await this.fileStore.readDir(base);
    for (const entry of top.filter(isScannable)) {
      const topPath = posix.join(base, entry.name);
      const children = await this.readDirSafe(topPath);
      if (hasGitDir(children)) {
        repos.push(this.toRepo(base, topPath));
        continue;
      }
      for (const child of children.filter(isScannable)) {
        const childPath = posix.join(topPath, child.name);
        if (hasGitDir(await this.readDirSafe(childPath))) {
          repos.push(this.toRepo(base, childPath));
        }
      }
    }
    return repos;
  }

  private async readDirSafe(path: string): Promise<DirEntry[]> {
    try {
      return await this.fileStore.readDir(path);
    } catch {
      return [];
    }
  }

  private toRepo(base: string, path: string): Repo {
    const id = posix.relative(base, path);
    const group = posix.dirname(id);
    return {
      id,
      name: posix.basename(id),
      group: group === '.' ? '' : group,
      path,
    };
  }

  private async loadWorktrees(base: string, repo: Repo): Promise<Worktree[]> {
    try {
      const infos = await this.vcs.listWorktrees(repo.path);
      return infos
        .map(info => ({
          id: posix.relative(base, info.path),
          repoId: repo.id,
          path: info.path,
          branch: info.branch,
          head: info.head,
          isMain: info.isMain,
        }))
        .sort(
          (a, b) =>
            Number(b.isMain) - Number(a.isMain) ||
            (a.branch ?? a.head).localeCompare(b.branch ?? b.head),
        );
    } catch (error) {
      repo.error = error instanceof Error ? error.message : String(error);
      return [];
    }
  }
}
