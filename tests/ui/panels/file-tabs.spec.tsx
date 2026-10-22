import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {FileTabs} from '../../../src/application/ui/panels/file-tabs';
import type {OpenFile} from '../../../src/application/ui/state/fly-store';

const tab = (path: string, overrides: Partial<OpenFile> = {}): OpenFile => ({
  worktreeId: 'w1',
  path,
  content: {kind: 'text', path, text: 'x', eol: 'lf', mtimeMs: 1},
  dirty: false,
  diskState: 'same',
  revision: 0,
  ...overrides,
});

const setup = (overrides: Partial<Parameters<typeof FileTabs>[0]> = {}) => {
  const props = {
    explorerCollapsed: false,
    onOpenExplorer: vi.fn(),
    tabs: [tab('src/a.ts'), tab('Makefile', {dirty: true})],
    activePath: 'src/a.ts',
    onActivate: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<FileTabs {...props} />);
  return props;
};

const tabBox = (name: string) =>
  screen.getByRole('tab', {name}).parentElement as HTMLElement;

describe('FileTabs', () => {
  it('Should render Sessão and one tab per file with its kind chip', () => {
    setup();
    expect(screen.getByRole('tablist')).toBeVisible();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Sessão',
      'tsa.ts',
      'mkMakefile',
    ]);
    expect(screen.getByRole('tab', {name: 'a.ts'})).toBeVisible();
    expect(within(tabBox('a.ts')).getByText('ts')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(within(tabBox('Makefile')).getByText('mk')).toBeVisible();
  });

  it('Should select the active file tab, or Sessão without one', () => {
    setup();
    expect(screen.getByRole('tab', {name: 'a.ts'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', {name: 'Sessão'})).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tab', {name: 'Makefile'})).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('Should select Sessão when no file is active', () => {
    setup({activePath: null});
    expect(screen.getByRole('tab', {name: 'Sessão'})).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Should activate a file tab and Sessão', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('tab', {name: 'Makefile'}));
    expect(props.onActivate).toHaveBeenLastCalledWith('Makefile');
    await user.click(screen.getByRole('tab', {name: 'Sessão'}));
    expect(props.onActivate).toHaveBeenLastCalledWith(null);
  });

  it('Should close a clean tab at once', async () => {
    const props = setup();
    const close = screen.getByRole('button', {name: 'Fechar a.ts'});
    expect(close).toHaveTextContent('×');
    await userEvent.setup().click(close);
    expect(props.onClose).toHaveBeenCalledWith('src/a.ts');
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('Should ask before closing a dirty tab and close on Descartar', async () => {
    const user = userEvent.setup();
    const props = setup();
    const close = screen.getByRole('button', {name: 'Fechar Makefile'});
    expect(close).toHaveTextContent('●');
    await user.click(close);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onActivate).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('tab', {name: 'Makefile'}),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', {name: 'Descartar'}));
    expect(props.onClose).toHaveBeenCalledWith('Makefile');
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('Should keep a dirty tab on Cancelar', async () => {
    const user = userEvent.setup();
    const props = setup();
    await user.click(screen.getByRole('button', {name: 'Fechar Makefile'}));
    await user.click(screen.getByRole('button', {name: 'Cancelar'}));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onActivate).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', {name: 'Makefile'})).toBeVisible();
    expect(
      screen.queryByRole('button', {name: 'Descartar'}),
    ).not.toBeInTheDocument();
  });

  it('Should hide the hamburger while the explorer is open', () => {
    setup();
    expect(
      screen.queryByRole('button', {name: 'Abrir explorer'}),
    ).not.toBeInTheDocument();
  });

  it('Should reopen the explorer from the hamburger when collapsed', async () => {
    const props = setup({explorerCollapsed: true});
    await userEvent
      .setup()
      .click(screen.getByRole('button', {name: 'Abrir explorer'}));
    expect(props.onOpenExplorer).toHaveBeenCalledTimes(1);
  });
});
