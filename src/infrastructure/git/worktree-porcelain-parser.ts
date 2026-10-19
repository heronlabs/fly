import {WorktreeInfo} from '../../core/interfaces/vcs-gateway';

const BRANCH_PREFIX = 'refs/heads/';

type Block = {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
};

export const parseWorktreePorcelain = (stdout: string): WorktreeInfo[] => {
  const blocks: Block[] = [];
  let current: Block | undefined;

  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      current = {
        path: line.slice('worktree '.length),
        head: '',
        branch: null,
        bare: false,
        locked: false,
        prunable: false,
      };
      blocks.push(current);
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(BRANCH_PREFIX, '');
    } else if (current && line === 'bare') {
      current.bare = true;
    } else if (current && (line === 'locked' || line.startsWith('locked '))) {
      current.locked = true;
    } else if (
      current &&
      (line === 'prunable' || line.startsWith('prunable '))
    ) {
      current.prunable = true;
    }
  }

  return blocks
    .map((block, index) => ({block, isMain: index === 0}))
    .filter(({block}) => !block.bare && !block.prunable)
    .map(({block, isMain}) => ({
      path: block.path,
      head: block.head,
      branch: block.branch,
      isMain,
      locked: block.locked,
    }));
};
