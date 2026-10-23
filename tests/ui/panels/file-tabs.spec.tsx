import {fireEvent, render, screen, within} from '@testing-library/react';
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

const middleClick = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.pointer({
    keys: '[MouseMiddle]',
    target: screen.getByRole('tab', {name}),
  });

const openMenu = async (
  user: ReturnType<typeof userEvent.setup>,
  name = 'a.ts',
  coords = {clientX: 40, clientY: 30},
) => {
  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('tab', {name}),
    coords,
  });
  return screen.getByRole('menu', {name: 'Abas'});
};

const menuItem = (name: string) => screen.getByRole('menuitem', {name});

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

  it('Should close a clean tab with the middle button', async () => {
    const user = userEvent.setup();
    const props = setup();
    await middleClick(user, 'a.ts');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledWith('src/a.ts');
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('Should ask before closing a dirty tab with the middle button', async () => {
    const user = userEvent.setup();
    const props = setup();
    await middleClick(user, 'Makefile');
    expect(props.onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', {name: 'Descartar'}));
    expect(props.onClose).toHaveBeenCalledWith('Makefile');
  });

  it('Should prevent only the middle-button mousedown, against autoscroll', () => {
    setup();
    expect(fireEvent.mouseDown(tabBox('a.ts'), {button: 1})).toBe(false);
    expect(fireEvent.mouseDown(tabBox('a.ts'), {button: 0})).toBe(true);
    expect(fireEvent.mouseDown(tabBox('a.ts'), {button: 2})).toBe(true);
    expect(fireEvent.mouseDown(tabBox('Sessão'), {button: 1})).toBe(true);
  });

  it('Should not close a tab on a right click', async () => {
    const user = userEvent.setup();
    const props = setup();
    await openMenu(user);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('Should open the tab menu at the pointer on a right click', async () => {
    const user = userEvent.setup();
    setup();
    expect(
      fireEvent.contextMenu(screen.getByRole('tab', {name: 'Makefile'})),
    ).toBe(false);
    await user.keyboard('{Escape}');
    const menu = await openMenu(user);
    expect(menu).toHaveStyle({position: 'fixed', left: '40px', top: '30px'});
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Fechar todas', 'Fechar salvas']);
    expect(menuItem('Fechar todas')).toHaveFocus();
  });

  it('Should keep the tab menu inside the window', async () => {
    const user = userEvent.setup();
    setup();
    const menu = await openMenu(user, 'a.ts', {
      clientX: window.innerWidth - 10,
      clientY: 30,
    });
    expect(menu).toHaveStyle({
      left: `${window.innerWidth - 160}px`,
      width: '160px',
    });
  });

  it('Should open no menu on Sessão', async () => {
    const user = userEvent.setup();
    setup();
    expect(
      fireEvent.contextMenu(screen.getByRole('tab', {name: 'Sessão'})),
    ).toBe(true);
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('tab', {name: 'Sessão'}),
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Should close only the saved tabs on Fechar salvas', async () => {
    const user = userEvent.setup();
    const props = setup({
      tabs: [tab('src/a.ts'), tab('Makefile', {dirty: true}), tab('b.md')],
    });
    await openMenu(user);
    await user.click(menuItem('Fechar salvas'));
    expect(vi.mocked(props.onClose).mock.calls).toEqual([
      ['src/a.ts'],
      ['b.md'],
    ]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Should close every tab on Fechar todas when none is dirty', async () => {
    const user = userEvent.setup();
    const props = setup({tabs: [tab('src/a.ts'), tab('b.md')]});
    await openMenu(user);
    await user.click(menuItem('Fechar todas'));
    expect(vi.mocked(props.onClose).mock.calls).toEqual([
      ['src/a.ts'],
      ['b.md'],
    ]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onActivate).not.toHaveBeenCalled();
  });

  it('Should ask once before Fechar todas closes dirty tabs', async () => {
    const user = userEvent.setup();
    const props = setup();
    const menu = await openMenu(user);
    await user.click(menuItem('Fechar todas'));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['Descartar', 'Cancelar']);
    expect(menuItem('Descartar')).toHaveStyle({color: 'var(--err)'});
    await user.click(menuItem('Descartar'));
    expect(vi.mocked(props.onClose).mock.calls).toEqual([
      ['src/a.ts'],
      ['Makefile'],
    ]);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Should keep every tab on Cancelar', async () => {
    const user = userEvent.setup();
    const props = setup();
    await openMenu(user);
    await user.click(menuItem('Fechar todas'));
    await user.click(menuItem('Cancelar'));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await openMenu(user);
    expect(menuItem('Fechar todas')).toBeVisible();
  });

  it('Should dismiss the tab menu on Escape, not on other keys', async () => {
    const user = userEvent.setup();
    const props = setup();
    await openMenu(user);
    await user.keyboard('a');
    expect(screen.getByRole('menu')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Should dismiss the tab menu on a click outside, not inside', async () => {
    const user = userEvent.setup();
    const props = setup();
    const menu = await openMenu(user);
    await user.click(menu);
    expect(screen.getByRole('menu')).toBeVisible();
    await user.click(screen.getByRole('tab', {name: 'Makefile'}));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(props.onActivate).toHaveBeenCalledWith('Makefile');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('Should dismiss the tab menu on a mousedown stopped before the window', async () => {
    setup();
    await openMenu(userEvent.setup());
    const stopper = document.createElement('div');
    stopper.addEventListener('mousedown', event => event.stopPropagation());
    document.body.append(stopper);
    fireEvent.mouseDown(stopper);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    stopper.remove();
  });

  it('Should stop listening once the tab menu is dismissed', async () => {
    const user = userEvent.setup();
    const remove = vi.spyOn(window, 'removeEventListener');
    setup();
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      'mousedown',
      expect.any(Function),
      true,
    );
  });

  it('Should highlight a menu item on hover', async () => {
    const user = userEvent.setup();
    setup();
    await openMenu(user);
    fireEvent.mouseEnter(menuItem('Fechar salvas'));
    expect(menuItem('Fechar salvas')).toHaveStyle({
      backgroundColor: 'var(--surface)',
    });
    fireEvent.mouseLeave(menuItem('Fechar salvas'));
    expect(menuItem('Fechar salvas')).not.toHaveStyle({
      backgroundColor: 'var(--surface)',
    });
  });

  it('Should scroll the tab strip itself, never the window', () => {
    setup();
    expect(screen.getByRole('tablist')).toHaveStyle({
      overflowX: 'auto',
      display: 'flex',
    });
    expect(tabBox('a.ts')).toHaveStyle({flex: 'none', whiteSpace: 'nowrap'});
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
