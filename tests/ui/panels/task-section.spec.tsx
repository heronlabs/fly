import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {TaskSection} from '../../../src/application/ui/panels/task-section';
import type {WorktreeQueue} from '../../../src/core/domain/queue';

const queueOf = (overrides: Partial<WorktreeQueue> = {}): WorktreeQueue => ({
  worktreeId: 'w1',
  status: 'idle',
  pullRequest: null,
  receipt: null,
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

describe('TaskSection', () => {
  it('Should render nothing without a queue or anything to show', () => {
    const {container, rerender} = render(
      <TaskSection queue={null} onOpenPr={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<TaskSection queue={queueOf()} onOpenPr={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Should call onOpenPr from the enabled button', async () => {
    const onOpenPr = vi.fn().mockResolvedValue(undefined);
    render(
      <TaskSection queue={queueOf({canOpenPr: true})} onOpenPr={onOpenPr} />,
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
      <TaskSection queue={queueOf({canOpenPr: true})} onOpenPr={onOpenPr} />,
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
      <TaskSection queue={queueOf({canOpenPr: true})} onOpenPr={onOpenPr} />,
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
      <TaskSection queue={queueOf({canOpenPr: true})} onOpenPr={onOpenPr} />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('boom')).toBeVisible();
  });

  it('Should drop a rejection once the queue moves to a new state', async () => {
    const onOpenPr = vi
      .fn()
      .mockRejectedValue(new Error('A sessão está ocupada'));
    const {rerender} = render(
      <TaskSection queue={queueOf({canOpenPr: true})} onOpenPr={onOpenPr} />,
    );
    await userEvent.click(screen.getByRole('button', {name: 'Abrir PR'}));
    expect(await screen.findByText('A sessão está ocupada')).toBeVisible();
    rerender(
      <TaskSection
        queue={queueOf({task: task({phase: 'opening'})})}
        onOpenPr={onOpenPr}
      />,
    );
    expect(screen.queryByText('A sessão está ocupada')).toBeNull();
    expect(screen.getByText(/Abrindo PR/)).toBeVisible();
  });
});
