import {act, fireEvent, render, screen} from '@testing-library/react';
import type {Mock} from 'vitest';

import {DiffPrPanel} from '../../../src/application/ui/panels/diff-pr-panel';
import {DIFF_POLL_MS} from '../../../src/application/ui/state/fly-store';
import type {DiffScope, WorktreeDiff} from '../../../src/core/domain/diff';
import type {PullRequest, WorktreeQueue} from '../../../src/core/domain/queue';
import type {Worktree} from '../../../src/core/domain/workspace';

const worktree: Worktree = {
  id: 'w1',
  repoId: 'repo-a',
  path: '/tmp/x/repo-a',
  branch: 'main',
  head: 'abcdef1234',
  isMain: true,
};

const setup = (
  overrides: {
    worktree?: Worktree | null;
    onLoadDiff?: Mock;
    queue?: WorktreeQueue | null;
  } = {},
) => {
  const props = {
    worktree,
    diff: null,
    queue: null,
    merging: false,
    onLoadDiff: vi.fn(),
    onMerge: vi.fn(),
    onOpenPr: vi.fn().mockResolvedValue(undefined),
    onRerun: vi.fn().mockResolvedValue(undefined),
    onResume: vi.fn().mockResolvedValue(undefined),
    onClean: vi.fn().mockResolvedValue(undefined),
    onOpenInEditor: vi.fn(),
    onOpenExternal: vi.fn(),
    ...overrides,
  };
  const view = render(<DiffPrPanel {...props} />);
  return {props, view};
};

const diffOf = (scope: DiffScope): WorktreeDiff => ({
  worktreeId: 'w1',
  scope,
  base: 'main',
  error: null,
  diff: {
    truncated: false,
    files: [
      {
        path: 'src/a.ts',
        oldPath: null,
        status: 'modified',
        binary: false,
        additions: 1,
        deletions: 0,
        lines: 1,
        hunks: [],
        truncated: false,
      },
    ],
  },
});

const click = (name: string) =>
  act(() => {
    fireEvent.click(screen.getByRole('tab', {name}));
  });

describe('DiffPrPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Should load the live diff at once and every poll interval', async () => {
    const {props} = setup();
    expect(screen.getByRole('tab', {name: 'Diff'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('tab', {name: 'Alterações locais'}),
    ).toHaveAttribute('aria-selected', 'true');
    expect(props.onLoadDiff).toHaveBeenCalledTimes(1);
    expect(props.onLoadDiff).toHaveBeenLastCalledWith('w1', 'live');
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS);
    });
    expect(props.onLoadDiff).toHaveBeenCalledTimes(2);
  });

  it('Should poll the branch diff after switching scope', async () => {
    const {props} = setup();
    click('Branch');
    expect(screen.getByRole('tab', {name: 'Branch'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(props.onLoadDiff).toHaveBeenLastCalledWith('w1', 'branch');
    const calls = props.onLoadDiff.mock.calls.length;
    await act(async () => {});
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS);
    });
    expect(props.onLoadDiff).toHaveBeenCalledTimes(calls + 1);
    expect(props.onLoadDiff).toHaveBeenLastCalledWith('w1', 'branch');
  });

  it('Should open the PR of the selected worktree from the PR tab', () => {
    const {props} = setup({
      queue: {
        worktreeId: 'w1',
        status: 'idle',
        pullRequest: null,
        task: null,
        canOpenPr: true,
      },
    });
    click('PR');
    fireEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(props.onOpenPr).toHaveBeenCalledWith('w1');
  });

  it('Should pass the worktree id to rerun, resume and clean', async () => {
    const {props} = setup({
      queue: {
        worktreeId: 'w1',
        status: 'idle',
        pullRequest: {
          number: 42,
          state: 'merged',
          checkRuns: [],
        } as unknown as PullRequest,
        task: {
          phase: 'stopped',
          ciAttempts: 0,
          review: null,
          stop: {kind: 'infra', message: 'x'},
        },
        canOpenPr: false,
      },
    });
    click('PR');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Rodar de novo'}));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Retomar'}));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Limpar'}));
    });
    expect(props.onRerun).toHaveBeenCalledWith('w1');
    expect(props.onResume).toHaveBeenCalledWith('w1');
    expect(props.onClean).toHaveBeenCalledWith('w1', false);
  });

  it('Should stop polling on the PR tab and show the pull request view', () => {
    const {props} = setup();
    click('PR');
    expect(screen.getByRole('tab', {name: 'PR'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.queryByRole('tab', {name: 'Alterações locais'}),
    ).not.toBeInTheDocument();
    const calls = props.onLoadDiff.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS * 3);
    });
    expect(props.onLoadDiff).toHaveBeenCalledTimes(calls);
  });

  it('Should stop polling on unmount', () => {
    const {props, view} = setup();
    view.unmount();
    const calls = props.onLoadDiff.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS * 3);
    });
    expect(props.onLoadDiff).toHaveBeenCalledTimes(calls);
  });

  it('Should render the empty copy and not poll without a worktree', () => {
    const {props} = setup({worktree: null});
    expect(screen.getByText('Selecione um worktree')).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS * 3);
    });
    expect(props.onLoadDiff).not.toHaveBeenCalled();
  });

  it('Should show only the diff of the selected scope', () => {
    const {view} = setup();
    view.rerender(
      <DiffPrPanel
        worktree={worktree}
        diff={diffOf('live')}
        queue={null}
        merging={false}
        onLoadDiff={vi.fn()}
        onMerge={vi.fn()}
        onOpenPr={vi.fn()}
        onRerun={vi.fn()}
        onResume={vi.fn()}
        onClean={vi.fn()}
        onOpenInEditor={vi.fn()}
        onOpenExternal={vi.fn()}
      />,
    );
    expect(screen.getByText('src/a.ts')).toBeVisible();
    click('Branch');
    expect(screen.queryByText('src/a.ts')).not.toBeInTheDocument();
    view.rerender(
      <DiffPrPanel
        worktree={worktree}
        diff={diffOf('branch')}
        queue={null}
        merging={false}
        onLoadDiff={vi.fn()}
        onMerge={vi.fn()}
        onOpenPr={vi.fn()}
        onRerun={vi.fn()}
        onResume={vi.fn()}
        onClean={vi.fn()}
        onOpenInEditor={vi.fn()}
        onOpenExternal={vi.fn()}
      />,
    );
    expect(screen.getByText('src/a.ts')).toBeVisible();
  });

  it('Should skip a poll while the previous one is pending', async () => {
    let resolve = () => {};
    const onLoadDiff = vi.fn(
      () =>
        new Promise<void>(r => {
          resolve = r;
        }),
    );
    setup({onLoadDiff});
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS * 2);
    });
    expect(onLoadDiff).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve();
    });
    act(() => {
      vi.advanceTimersByTime(DIFF_POLL_MS);
    });
    expect(onLoadDiff).toHaveBeenCalledTimes(2);
  });
});
