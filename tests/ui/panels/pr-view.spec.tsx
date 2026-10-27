import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {PrView} from '../../../src/application/ui/panels/pr-view';
import type {
  PullRequest,
  QueueStatus,
  WorktreeQueue,
} from '../../../src/core/domain/queue';

const RUN = {kind: 'run', conclusion: null, runId: null, jobId: null} as const;

const pr = (overrides: Partial<PullRequest> = {}): PullRequest => ({
  number: 12,
  url: 'https://github.com/o/r/pull/12',
  branch: 'feat',
  state: 'open',
  draft: false,
  mergeable: 'mergeable',
  review: 'approved',
  checks: 'failing',
  title: 'Add diff panel',
  checkRuns: [
    {...RUN, name: 'lint', state: 'passing', url: 'https://ci/lint'},
    {...RUN, name: 'test', state: 'failing', url: null},
  ],
  headSha: null,
  behind: false,
  ...overrides,
});

const queueOf = (pullRequest: PullRequest | null): WorktreeQueue => ({
  worktreeId: 'w1',
  status: 'ready',
  pullRequest,
  task: null,
  canOpenPr: false,
});

const renderView = (
  queue: WorktreeQueue | null,
  options: {
    status?: QueueStatus;
    merging?: boolean;
    onMerge?: () => void;
    onOpenExternal?: (url: string) => void;
    onOpenPr?: () => Promise<void>;
    onRerun?: () => Promise<void>;
    onResume?: () => Promise<void>;
    onClean?: (confirmed: boolean) => Promise<void>;
  } = {},
) =>
  render(
    <PrView
      queue={queue}
      status={options.status ?? 'ready'}
      merging={options.merging ?? false}
      onMerge={options.onMerge ?? (() => {})}
      onOpenExternal={options.onOpenExternal ?? (() => {})}
      onOpenPr={options.onOpenPr ?? (async () => {})}
      onRerun={options.onRerun ?? (async () => {})}
      onResume={options.onResume ?? (async () => {})}
      onClean={options.onClean ?? (async () => {})}
    />,
  );

describe('PrView', () => {
  it('Should render the task section above the PR section', () => {
    const queue = {...queueOf(pr()), canOpenPr: true};
    renderView(queue);
    const button = screen.getByRole('button', {name: 'Abrir PR'});
    const title = screen.getByText('#12 Add diff panel');
    expect(
      button.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('Should say there is no open PR', () => {
    renderView(null);
    expect(screen.getByText('Sem PR aberto')).toBeVisible();
    renderView(queueOf(null));
    expect(screen.getAllByText('Sem PR aberto')).toHaveLength(2);
  });

  it('Should render the open PR with checks and review', async () => {
    const onOpenExternal = vi.fn();
    renderView(queueOf(pr()), {onOpenExternal});
    await userEvent.click(
      screen.getByRole('button', {name: '#12 Add diff panel'}),
    );
    expect(onOpenExternal).toHaveBeenCalledWith(
      'https://github.com/o/r/pull/12',
    );
    expect(screen.getByText('open')).toHaveStyle({
      backgroundColor: 'var(--badgeOk)',
    });
    expect(screen.getByText('Checks')).toBeVisible();
    expect(screen.getByText('lint')).toBeVisible();
    expect(screen.getByText('ok')).toBeVisible();
    expect(screen.getByText('test')).toBeVisible();
    expect(screen.getByText('falhou')).toBeVisible();
    expect(screen.getByText('Review')).toBeVisible();
    expect(screen.getByText('aprovado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', {name: 'Abrir lint'}));
    expect(onOpenExternal).toHaveBeenLastCalledWith('https://ci/lint');
    expect(screen.queryByRole('button', {name: 'Abrir test'})).toBeNull();
  });

  it.each([
    ['pending', 'rodando'],
    ['passing', 'ok'],
    ['failing', 'falhou'],
  ] as const)('Should word the %s check as %s', (state, word) => {
    renderView(
      queueOf(pr({checkRuns: [{...RUN, name: 'x', state, url: null}]})),
    );
    expect(screen.getByText(word)).toBeVisible();
  });

  it.each([
    ['approved', 'aprovado'],
    ['changes-requested', 'mudanças pedidas'],
    ['required', 'pendente'],
    ['none', 'não exigido'],
  ] as const)('Should word the %s review as %s', (review, word) => {
    renderView(queueOf(pr({review})));
    expect(screen.getByText(word)).toBeVisible();
  });

  it('Should mark a draft and color the pill by state', () => {
    const {unmount} = renderView(queueOf(pr({draft: true})));
    expect(screen.getByText('open draft')).toHaveStyle({
      backgroundColor: 'var(--badgeWarn)',
    });
    unmount();
    const merged = renderView(queueOf(pr({state: 'merged'})));
    expect(screen.getByText('merged')).toHaveStyle({
      backgroundColor: 'var(--badgeMerged)',
    });
    merged.unmount();
    renderView(queueOf(pr({state: 'closed'})));
    expect(screen.getByText('closed')).toHaveStyle({
      backgroundColor: 'var(--badgeErr)',
    });
    expect(screen.queryByRole('button', {name: 'Fazer merge'})).toBeNull();
    expect(screen.queryByText('Merge feito')).toBeNull();
  });

  it.each(['ci', 'waiting', 'failed'] as const)(
    'Should disable the merge button for %s',
    status => {
      renderView(queueOf(pr()), {status});
      expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeDisabled();
    },
  );

  it('Should enable the merge button for ready', () => {
    renderView(queueOf(pr()), {status: 'ready'});
    expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeEnabled();
  });

  it('Should disable the merge button while merging', () => {
    renderView(queueOf(pr()), {status: 'ready', merging: true});
    expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeDisabled();
  });

  it('Should merge once after confirming', async () => {
    const onMerge = vi.fn();
    renderView(queueOf(pr()), {onMerge});
    await userEvent.click(screen.getByRole('button', {name: 'Fazer merge'}));
    expect(onMerge).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', {name: 'Confirmar'}));
    expect(onMerge).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeVisible();
  });

  it('Should keep the PR unmerged after cancelling', async () => {
    const onMerge = vi.fn();
    renderView(queueOf(pr()), {onMerge});
    await userEvent.click(screen.getByRole('button', {name: 'Fazer merge'}));
    await userEvent.click(screen.getByRole('button', {name: 'Cancelar'}));
    expect(onMerge).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Confirmar'})).toBeNull();
  });

  it('Should show a merged PR as done', () => {
    renderView(queueOf(pr({state: 'merged'})));
    expect(screen.getByText('Merge feito')).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Fazer merge'})).toBeNull();
  });

  it('Should not carry a rejection or an in-flight open to another worktree', async () => {
    let release!: () => void;
    const onOpenPr = vi
      .fn()
      .mockRejectedValueOnce(new Error('ocupada em A'))
      .mockImplementationOnce(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          }),
      );
    const view = (id: string) => (
      <PrView
        queue={{...queueOf(null), worktreeId: id, canOpenPr: true}}
        status="idle"
        merging={false}
        onMerge={() => {}}
        onOpenExternal={() => {}}
        onOpenPr={onOpenPr}
        onRerun={async () => {}}
        onResume={async () => {}}
        onClean={async () => {}}
      />
    );
    const {rerender} = render(view('A'));
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('ocupada em A')).toBeVisible();
    rerender(view('B'));
    expect(screen.queryByText('ocupada em A')).toBeNull();
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(screen.getByRole('button', {name: 'Abrir PR'})).toBeDisabled();
    rerender(view('C'));
    expect(screen.getByRole('button', {name: 'Abrir PR'})).toBeEnabled();
    release();
  });

  it('Should drop the confirmation when another PR is shown', async () => {
    const view = (queue: WorktreeQueue) => (
      <PrView
        queue={queue}
        status="ready"
        merging={false}
        onMerge={() => {}}
        onOpenExternal={() => {}}
        onOpenPr={async () => {}}
        onRerun={async () => {}}
        onResume={async () => {}}
        onClean={async () => {}}
      />
    );
    const {rerender} = render(view(queueOf(pr())));
    await userEvent.click(screen.getByRole('button', {name: 'Fazer merge'}));
    rerender(
      view(queueOf(pr({number: 13, url: 'https://github.com/o/r/pull/13'}))),
    );
    expect(screen.getByRole('button', {name: 'Fazer merge'})).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Confirmar'})).toBeNull();
  });

  it('Should not confirm once the status leaves ready', async () => {
    const onMerge = vi.fn();
    const view = (status: QueueStatus) => (
      <PrView
        queue={queueOf(pr())}
        status={status}
        merging={false}
        onMerge={onMerge}
        onOpenExternal={() => {}}
        onOpenPr={async () => {}}
        onRerun={async () => {}}
        onResume={async () => {}}
        onClean={async () => {}}
      />
    );
    const {rerender} = render(view('ready'));
    await userEvent.click(screen.getByRole('button', {name: 'Fazer merge'}));
    rerender(view('ci'));
    const confirm = screen.getByRole('button', {name: 'Confirmar'});
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onMerge).not.toHaveBeenCalled();
  });
  it('Should thread rerun, resume and clean from the task section', async () => {
    const onRerun = vi.fn().mockResolvedValue(undefined);
    const onResume = vi.fn().mockResolvedValue(undefined);
    const onClean = vi.fn().mockResolvedValue(undefined);
    const stopped: WorktreeQueue = {
      ...queueOf(pr({state: 'merged'})),
      task: {
        phase: 'stopped',
        ciAttempts: 0,
        review: null,
        stop: {kind: 'infra', message: 'Falha de infraestrutura na CI: a'},
      },
    };
    renderView(stopped, {onRerun, onResume, onClean});
    await userEvent.click(screen.getByRole('button', {name: 'Rodar de novo'}));
    await userEvent.click(screen.getByRole('button', {name: 'Retomar'}));
    await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
    expect(onRerun).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onClean).toHaveBeenCalledExactlyOnceWith(false);
  });
});
