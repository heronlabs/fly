import {dirname, resolve} from 'node:path';

import type {Platform} from '../domain/platform';
import {
  MIN_CLAUDE_VERSION,
  MIN_GH_VERSION,
  ToolCheck,
  ToolFix,
  ToolId,
} from '../domain/setup';

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

// The app's install root from Electron's executable: fly.app/Contents/MacOS/fly
// on macOS, /opt/fly/fly on Linux.
export const bundleRoot = (execPath: string, platform: Platform): string =>
  platform === 'mac' ? resolve(execPath, '../../..') : dirname(execPath);

// Linux has no Homebrew assumption: a missing system tool gets the apt line.
const missingFix = (id: ToolId, platform: Platform): ToolFix => {
  if (id === 'claude') {
    return {kind: 'copy', command: 'npm install -g @anthropic-ai/claude-code'};
  }
  return platform === 'mac'
    ? {kind: 'brew', formula: id}
    : {kind: 'copy', command: `sudo apt install ${id}`};
};

// Homebrew has the current gh; on Linux a distro's gh can be too old, and
// GitHub's own apt repository is the way to a newer one.
const GH_UPGRADE: Record<Platform, ToolFix> = {
  mac: {kind: 'copy', command: 'brew upgrade gh'},
  linux: {
    kind: 'copy',
    command: 'https://github.com/cli/cli/blob/trunk/docs/install_linux.md',
  },
};

export const checkTool = (
  id: ToolId,
  probe: {version: string | null; loggedIn?: boolean},
  platform: Platform,
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
    return fail('não encontrado', missingFix(id, platform));
  }
  if (id === 'gh' && compareVersions(version, MIN_GH_VERSION) < 0) {
    return fail(
      `versão ${version}; precisa ${MIN_GH_VERSION} ou mais`,
      GH_UPGRADE[platform],
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
