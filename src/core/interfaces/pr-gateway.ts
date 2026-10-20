import type {PullRequest} from '../domain/queue';

export const GH_AUTH_MESSAGE = 'gh não autenticado — rode: gh auth login';

export abstract class PrGateway {
  abstract list(repoPath: string): Promise<PullRequest[]>;
}
