import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {WelcomePanel} from '../../../src/application/ui/panels/welcome-panel';

describe('WelcomePanel', () => {
  it('lists recent roots and opens one', async () => {
    const onOpen = vi.fn();
    render(
      <WelcomePanel
        recentRoots={['/a', '/b']}
        onPick={vi.fn()}
        onOpen={onOpen}
        error={null}
      />,
    );
    expect(screen.getByText('Recentes')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', {name: '/b'}));
    expect(onOpen).toHaveBeenCalledWith('/b');
  });

  it('picks a folder', async () => {
    const onPick = vi.fn();
    render(
      <WelcomePanel
        recentRoots={[]}
        onPick={onPick}
        onOpen={vi.fn()}
        error={null}
      />,
    );
    expect(screen.queryByText('Recentes')).not.toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: /Abrir pasta/}));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('shows the error', () => {
    render(
      <WelcomePanel
        recentRoots={[]}
        onPick={vi.fn()}
        onOpen={vi.fn()}
        error="boom"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });
});
