import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {PrView} from '../../../src/application/ui/panels/pr-view';
import type {
  PullRequest,
  QueueStatus,
  WorktreeQueue,
} from '../../../src/core/domain/queue';
import type {ReceiptResult} from '../../../src/core/domain/transcript';

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
    {name: 'lint', state: 'passing', url: 'https://ci/lint'},
    {name: 'test', state: 'failing', url: null},
  ],
  ...overrides,
});

const queueOf = (
  pullRequest: PullRequest | null,
  receipt: ReceiptResult | null = null,
): WorktreeQueue => ({
  worktreeId: 'w1',
  status: 'ready',
  pullRequest,
  receipt,
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
    renderView(queueOf(pr({checkRuns: [{name: 'x', state, url: null}]})));
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

  it('Should render a valid receipt', () => {
    renderView(
      queueOf(null, {
        kind: 'valid',
        receipt: {
          summary: 'Fez a coisa',
          filesChanged: ['a.ts', 'b.ts'],
          verification: {lint: 'pass', test: 'skipped', build: 'fail'},
        },
      }),
    );
    expect(screen.getByText('Receipt do engineer')).toBeVisible();
    expect(screen.getByText('Fez a coisa')).toBeVisible();
    expect(screen.getByText('Arquivos')).toBeVisible();
    expect(screen.getAllByRole('listitem').map(i => i.textContent)).toEqual([
      'a.ts',
      'b.ts',
    ]);
    expect(screen.getByText('Verificação')).toBeVisible();
    expect(screen.getByText('lint: pass')).toBeVisible();
    expect(screen.getByText('test: skipped')).toBeVisible();
    expect(screen.getByText('build: fail')).toBeVisible();
    expect(screen.queryByText('Receipt inválido')).toBeNull();
  });

  it('Should render an invalid receipt with its problems', () => {
    renderView(
      queueOf(pr(), {kind: 'invalid', problems: ['sem resumo', 'json ruim']}),
    );
    expect(screen.getByText('Receipt inválido')).toBeVisible();
    expect(screen.getByText('sem resumo')).toBeVisible();
    expect(screen.getByText('json ruim')).toBeVisible();
    expect(screen.queryByText('Receipt do engineer')).toBeNull();
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
});
