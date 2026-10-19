export type WorktreeInfo = {
  path: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  locked: boolean;
};

export abstract class VcsGateway {
  abstract listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
}
