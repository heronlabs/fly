import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {TopBar} from '../../../src/application/ui/panels/top-bar';

describe('TopBar', () => {
  it('Should render the app version in the pill instead of cockpit', () => {
    render(
      <TopBar
        root={null}
        selected={null}
        theme="dark"
        diffPanel="open"
        onToggleDiffPanel={vi.fn()}
        onToggleTheme={vi.fn()}
        onOpenFolder={vi.fn()}
        canCreateTask={false}
        onNewTask={vi.fn()}
      />,
    );
    expect(screen.getByText(`v${__APP_VERSION__}`)).toBeVisible();
    expect(screen.getByText(`v${__APP_VERSION__}`)).toHaveTextContent(
      /^v\d+\.\d+\.\d+/,
    );
    expect(screen.queryByText('cockpit')).not.toBeInTheDocument();
  });

  it.each([
    ['open', 'Esconder painel'],
    ['collapsed', 'Mostrar painel'],
  ] as const)('Should label the panel toggle for %s', async (mode, label) => {
    const onToggleDiffPanel = vi.fn();
    render(
      <TopBar
        root={null}
        selected={null}
        theme="dark"
        diffPanel={mode}
        onToggleDiffPanel={onToggleDiffPanel}
        onToggleTheme={vi.fn()}
        onOpenFolder={vi.fn()}
        canCreateTask={false}
        onNewTask={vi.fn()}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: new RegExp(label)}));
    expect(onToggleDiffPanel).toHaveBeenCalledTimes(1);
  });
});
