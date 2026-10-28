import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {TaskSection} from '../../../src/application/ui/panels/task-section';
import type {WorktreeQueue} from '../../../src/core/domain/queue';

const queueOf = (overrides: Partial<WorktreeQueue> = {}): WorktreeQueue => ({
  worktreeId: 'w1',
  status: 'idle',
  pullRequest: null,
  task: null,
  canOpenPr: false,
  ...overrides,
});

const task = (
  overrides: Partial<NonNullable<WorktreeQueue['task']>> = {},
): NonNullable<WorktreeQueue['task']> => ({
  phase: 'working',
  ciAttempts: 0,
  stop: null,
  review: null,
  ...overrides,
});

const noop = {
  onRerun: vi.fn().mockResolvedValue(undefined),
  onResume: vi.fn().mockResolvedValue(undefined),
  onClean: vi.fn().mockResolvedValue(undefined),
};

const pull = (
  state: 'open' | 'merged' | 'closed',
): NonNullable<WorktreeQueue['pullRequest']> =>
  ({number: 42, state}) as NonNullable<WorktreeQueue['pullRequest']>;

describe('TaskSection', () => {
  it('Should render nothing without a queue or anything to show', () => {
    const {container, rerender} = render(
      <TaskSection {...noop} queue={null} onOpenPr={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<TaskSection {...noop} queue={queueOf()} onOpenPr={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Should call onOpenPr from the enabled button', async () => {
    const onOpenPr = vi.fn().mockResolvedValue(undefined);
    render(
      <TaskSection
        {...noop}
        queue={queueOf({canOpenPr: true})}
        onOpenPr={onOpenPr}
      />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(onOpenPr).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Abrir PR'})).toBeEnabled(),
    );
  });

  it('Should disable the button while the call is in flight', async () => {
    let release!: () => void;
    const onOpenPr = vi.fn(
      () =>
        new Promise<void>(resolve => {
          release = resolve;
        }),
    );
    render(
      <TaskSection
        {...noop}
        queue={queueOf({canOpenPr: true})}
        onOpenPr={onOpenPr}
      />,
    );
    const button = screen.getByRole('button', {name: 'Abrir PR'});
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onOpenPr).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('Should show the opening state and no button', () => {
    render(
      <TaskSection
        {...noop}
        queue={queueOf({task: task({phase: 'opening'})})}
        onOpenPr={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        'Abrindo PR: aguardando a sessão commitar e escrever o PR…',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Should show a stop message in the error color', () => {
    render(
      <TaskSection
        {...noop}
        queue={queueOf({
          task: task({
            phase: 'stopped',
            stop: {kind: 'open', message: 'Ficaram mudanças sem commit: a.ts'},
          }),
        })}
        onOpenPr={vi.fn()}
      />,
    );
    expect(screen.getByText('Ficaram mudanças sem commit: a.ts')).toHaveStyle({
      color: 'var(--err)',
    });
  });

  it('Should show the message of a rejected open and re-enable the button', async () => {
    const onOpenPr = vi
      .fn()
      .mockRejectedValue(new Error('A sessão está ocupada'));
    render(
      <TaskSection
        {...noop}
        queue={queueOf({canOpenPr: true})}
        onOpenPr={onOpenPr}
      />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('A sessão está ocupada')).toHaveStyle({
      color: 'var(--err)',
    });
    expect(screen.getByRole('button', {name: 'Abrir PR'})).toBeEnabled();
  });

  it('Should stringify a non-Error rejection', async () => {
    const onOpenPr = vi.fn().mockRejectedValue('boom');
    render(
      <TaskSection
        {...noop}
        queue={queueOf({canOpenPr: true})}
        onOpenPr={onOpenPr}
      />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('boom')).toBeVisible();
  });

  it('Should drop a rejection once the queue moves to a new state', async () => {
    const onOpenPr = vi
      .fn()
      .mockRejectedValue(new Error('A sessão está ocupada'));
    const {rerender} = render(
      <TaskSection
        {...noop}
        queue={queueOf({canOpenPr: true})}
        onOpenPr={onOpenPr}
      />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('A sessão está ocupada')).toBeVisible();
    rerender(
      <TaskSection
        {...noop}
        queue={queueOf({task: task({phase: 'opening'})})}
        onOpenPr={onOpenPr}
      />,
    );
    expect(screen.queryByText('A sessão está ocupada')).toBeNull();
    expect(screen.getByText(/Abrindo PR/)).toBeVisible();
  });
  describe('after the PR is open', () => {
    it('Should offer Rodar de novo only for an infra stop, and always Retomar', async () => {
      const onRerun = vi.fn().mockResolvedValue(undefined);
      const onResume = vi.fn().mockResolvedValue(undefined);
      const {rerender} = render(
        <TaskSection
          {...noop}
          queue={queueOf({
            task: task({
              phase: 'stopped',
              stop: {
                kind: 'infra',
                message: 'Falha de infraestrutura na CI: a',
                runIds: ['7'],
              },
            }),
          })}
          onOpenPr={vi.fn()}
          onRerun={onRerun}
          onResume={onResume}
        />,
      );
      await userEvent.click(
        screen.getByRole('button', {name: 'Rodar de novo'}),
      );
      expect(onRerun).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole('button', {name: 'Retomar'}));
      expect(onResume).toHaveBeenCalledTimes(1);

      rerender(
        <TaskSection
          {...noop}
          queue={queueOf({
            task: task({
              phase: 'stopped',
              stop: {
                kind: 'ci',
                message: 'CI falhou 3 vezes; parei de corrigir',
              },
            }),
          })}
          onOpenPr={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', {name: 'Retomar'})).toBeVisible();
      expect(
        screen.queryByRole('button', {name: 'Rodar de novo'}),
      ).not.toBeInTheDocument();
    });

    it.each([
      ['no run ids', undefined],
      ['an empty list of run ids', []],
    ])(
      'Should not offer Rodar de novo for an infra stop with %s',
      (_name, runIds) => {
        render(
          <TaskSection
            {...noop}
            queue={queueOf({
              task: task({
                phase: 'stopped',
                stop: {
                  kind: 'infra',
                  message: 'Falha de infraestrutura na CI: a',
                  runIds,
                },
              }),
            })}
            onOpenPr={vi.fn()}
          />,
        );
        expect(screen.getByRole('button', {name: 'Retomar'})).toBeVisible();
        expect(
          screen.queryByRole('button', {name: 'Rodar de novo'}),
        ).not.toBeInTheDocument();
      },
    );

    it('Should show neither button without a stop', () => {
      render(
        <TaskSection
          {...noop}
          queue={queueOf({task: task({phase: 'ci', ciAttempts: 1})})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('Should show the CI fix counter, and the running attempt while fixing', () => {
      const {rerender} = render(
        <TaskSection
          {...noop}
          queue={queueOf({task: task({phase: 'ci', ciAttempts: 2})})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(screen.getByText('Correções de CI: 2 de 3')).toBeVisible();
      expect(screen.queryByText(/Corrigindo a CI/)).not.toBeInTheDocument();

      rerender(
        <TaskSection
          {...noop}
          queue={queueOf({task: task({phase: 'fixing', ciAttempts: 2})})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(
        screen.getByText('Corrigindo a CI (tentativa 2 de 3)'),
      ).toBeVisible();
      expect(screen.queryByText(/Correções de CI/)).not.toBeInTheDocument();
    });

    it('Should show nothing about CI fixes before the first one', () => {
      render(
        <TaskSection
          {...noop}
          queue={queueOf({task: task({phase: 'ci'})})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(screen.queryByText(/Correções de CI/)).not.toBeInTheDocument();
    });

    it.each([
      ['queued', '1 comentários de review novos'],
      ['sent', 'Encaminhando comentários de review…'],
      ['done', 'Comentários encaminhados à sessão'],
    ] as const)('Should show a %s review', (state, text) => {
      render(
        <TaskSection
          {...noop}
          queue={queueOf({task: task({review: {count: 1, state}})})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(screen.getByText(text)).toBeVisible();
    });

    it('Should disable the stop buttons while a call is in flight', async () => {
      let release!: () => void;
      const onResume = vi.fn(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          }),
      );
      render(
        <TaskSection
          {...noop}
          queue={queueOf({
            task: task({
              phase: 'stopped',
              stop: {
                kind: 'infra',
                message: 'Falha de infraestrutura na CI: a',
                runIds: ['7'],
              },
            }),
          })}
          onOpenPr={vi.fn()}
          onResume={onResume}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Retomar'}));
      expect(screen.getByRole('button', {name: 'Retomar'})).toBeDisabled();
      expect(
        screen.getByRole('button', {name: 'Rodar de novo'}),
      ).toBeDisabled();
      release();
      await waitFor(() =>
        expect(screen.getByRole('button', {name: 'Retomar'})).toBeEnabled(),
      );
    });

    it('Should show the message of a rejected Retomar and drop it when the stop moves', async () => {
      const onResume = vi
        .fn()
        .mockRejectedValue(new Error('A sessão está ocupada'));
      const stopped = (message: string) =>
        queueOf({
          task: task({phase: 'stopped', stop: {kind: 'ci', message}}),
        });
      const {rerender} = render(
        <TaskSection
          {...noop}
          queue={stopped('CI falhou 3 vezes; parei de corrigir')}
          onOpenPr={vi.fn()}
          onResume={onResume}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Retomar'}));
      expect(await screen.findByText('A sessão está ocupada')).toHaveStyle({
        color: 'var(--err)',
      });
      rerender(
        <TaskSection
          {...noop}
          queue={stopped('Conflito com main')}
          onOpenPr={vi.fn()}
          onResume={onResume}
        />,
      );
      expect(screen.queryByText('A sessão está ocupada')).toBeNull();
    });

    it('Should show the message of a rejected Rodar de novo', async () => {
      const onRerun = vi
        .fn()
        .mockRejectedValue(new Error('Nada para rodar de novo'));
      render(
        <TaskSection
          {...noop}
          queue={queueOf({
            task: task({
              phase: 'stopped',
              stop: {
                kind: 'infra',
                message: 'Falha de infraestrutura na CI: a',
                runIds: ['7'],
              },
            }),
          })}
          onOpenPr={vi.fn()}
          onRerun={onRerun}
        />,
      );
      await userEvent.click(
        screen.getByRole('button', {name: 'Rodar de novo'}),
      );
      expect(await screen.findByText('Nada para rodar de novo')).toBeVisible();
    });
  });

  describe('Limpar', () => {
    it('Should clean a merged PR at once, unconfirmed', async () => {
      const onClean = vi.fn().mockResolvedValue(undefined);
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('merged')})}
          onOpenPr={vi.fn()}
          onClean={onClean}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
      expect(onClean).toHaveBeenCalledExactlyOnceWith(false);
    });

    it('Should offer no Limpar for an open PR', () => {
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('open'), canOpenPr: true})}
          onOpenPr={vi.fn()}
        />,
      );
      expect(
        screen.queryByRole('button', {name: 'Limpar'}),
      ).not.toBeInTheDocument();
    });

    it('Should ask before cleaning a closed PR, and call onClean(true) only on confirm', async () => {
      const onClean = vi.fn().mockResolvedValue(undefined);
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('closed')})}
          onOpenPr={vi.fn()}
          onClean={onClean}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
      expect(
        screen.getByText(
          'O PR #42 foi fechado sem merge. Apagar o worktree e o branch mesmo assim?',
        ),
      ).toBeVisible();
      expect(onClean).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', {name: 'Cancelar'}));
      expect(onClean).not.toHaveBeenCalled();
      expect(screen.getByRole('button', {name: 'Limpar'})).toBeVisible();

      await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
      await userEvent.click(screen.getByRole('button', {name: 'Confirmar'}));
      expect(onClean).toHaveBeenCalledExactlyOnceWith(true);
      expect(
        screen.queryByText(/foi fechado sem merge/),
      ).not.toBeInTheDocument();
    });

    it('Should disable Limpar while the call is in flight', async () => {
      let release!: () => void;
      const onClean = vi.fn(
        () =>
          new Promise<void>(resolve => {
            release = resolve;
          }),
      );
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('merged')})}
          onOpenPr={vi.fn()}
          onClean={onClean}
        />,
      );
      const button = screen.getByRole('button', {name: 'Limpar'});
      await userEvent.click(button);
      expect(button).toBeDisabled();
      release();
      await waitFor(() => expect(button).toBeEnabled());
    });

    it('Should show the message of a rejected clean', async () => {
      const onClean = vi
        .fn()
        .mockRejectedValue(new Error('Falha ao limpar: sujo'));
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('merged')})}
          onOpenPr={vi.fn()}
          onClean={onClean}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
      expect(await screen.findByText('Falha ao limpar: sujo')).toHaveStyle({
        color: 'var(--err)',
      });
      expect(screen.getByRole('button', {name: 'Limpar'})).toBeEnabled();
    });

    it('Should show the rejection of a confirmed clean of a closed PR', async () => {
      const onClean = vi
        .fn()
        .mockRejectedValue(new Error('Falha ao limpar: x'));
      render(
        <TaskSection
          {...noop}
          queue={queueOf({pullRequest: pull('closed')})}
          onOpenPr={vi.fn()}
          onClean={onClean}
        />,
      );
      await userEvent.click(screen.getByRole('button', {name: 'Limpar'}));
      await userEvent.click(screen.getByRole('button', {name: 'Confirmar'}));
      expect(await screen.findByText('Falha ao limpar: x')).toBeVisible();
    });
  });
});
