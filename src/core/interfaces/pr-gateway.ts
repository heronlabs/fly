import type {PullRequest} from '../domain/queue';

export const GH_AUTH_MESSAGE = 'gh não autenticado — rode: gh auth login';
export const GH_TIMEOUT_MESSAGE = 'gh não respondeu em 15 s';
export const GH_MERGE_TIMEOUT_MESSAGE = 'gh não respondeu em 60 s';

export const GH_DEFAULT_BRANCH_MESSAGE =
  'Não foi possível descobrir o branch padrão';

export abstract class PrGateway {
  abstract list(repoPath: string): Promise<PullRequest[]>;
  abstract defaultBranch(repoPath: string): Promise<string>;
  abstract merge(repoPath: string, number: number): Promise<void>;
}
