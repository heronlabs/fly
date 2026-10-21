import {render, screen} from '@testing-library/react';

import {TopBar} from '../../../src/application/ui/panels/top-bar';

describe('TopBar', () => {
  it('Should render the app version in the pill instead of cockpit', () => {
    render(
      <TopBar
        root={null}
        selected={null}
        theme="dark"
        onToggleTheme={vi.fn()}
        onOpenFolder={vi.fn()}
        onOpenInEditor={vi.fn()}
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
});
