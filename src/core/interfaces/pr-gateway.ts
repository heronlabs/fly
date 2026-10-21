import type {PullRequest} from '../domain/queue';

export const GH_AUTH_MESSAGE = 'gh não autenticado — rode: gh auth login';
export const GH_TIMEOUT_MESSAGE = 'gh não respondeu em 15 s';
export const GH_MERGE_TIMEOUT_MESSAGE = 'gh não respondeu em 60 s';

export abstract class PrGateway {
  abstract list(repoPath: string): Promise<PullRequest[]>;
  abstract merge(repoPath: string, number: number): Promise<void>;
}
