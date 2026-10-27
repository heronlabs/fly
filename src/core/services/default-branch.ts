import {PrGateway} from '../interfaces/pr-gateway';
import {VcsGateway} from '../interfaces/vcs-gateway';

// The branch origin/HEAD points to, else the one GitHub reports (P5).
export const resolveDefaultBranch = async (
  vcs: VcsGateway,
  prs: PrGateway,
  repoPath: string,
): Promise<string> =>
  (await vcs.defaultBranch(repoPath)) ?? (await prs.defaultBranch(repoPath));
