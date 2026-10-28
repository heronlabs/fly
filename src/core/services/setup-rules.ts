import {MIN_CLAUDE_VERSION, ToolCheck, ToolId} from '../domain/setup';

export const BREW_TOOLS: readonly ToolId[] = ['git', 'gh', 'tmux'];

export const compareVersions = (a: string, b: string): number => {
  const left = a.split('.').map(part => parseInt(part, 10));
  const right = b.split('.').map(part => parseInt(part, 10));
  const differences = Array.from(
    {length: Math.max(left.length, right.length)},
    (_, index) => (left[index] ?? 0) - (right[index] ?? 0),
  );
  return differences.find(difference => difference !== 0) ?? 0;
};

export const isNewer = (candidate: string, current: string): boolean =>
  compareVersions(candidate, current) > 0;

export const checkTool = (
  id: ToolId,
  probe: {version: string | null; loggedIn?: boolean},
): ToolCheck => {
  const {version, loggedIn} = probe;
  const fail = (problem: string, fix: ToolCheck['fix']): ToolCheck => ({
    id,
    ok: false,
    version,
    problem,
    fix,
  });
  if (version === null) {
    return fail(
      'não encontrado',
      id === 'claude'
        ? {kind: 'copy', command: 'npm install -g @anthropic-ai/claude-code'}
        : {kind: 'brew', formula: id},
    );
  }
  if (id === 'gh' && loggedIn === false) {
    return fail('não logado', {kind: 'copy', command: 'gh auth login'});
  }
  if (id === 'claude' && compareVersions(version, MIN_CLAUDE_VERSION) < 0) {
    return fail(`versão ${version}; precisa ${MIN_CLAUDE_VERSION} ou mais`, {
      kind: 'copy',
      command: 'claude update',
    });
  }
  return {id, ok: true, version, problem: null, fix: null};
};
