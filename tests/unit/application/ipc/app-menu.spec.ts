import {appMenuTemplate} from '../../../../src/application/ipc/app-menu';

describe('appMenuTemplate', () => {
  it('puts Configurar fly… between separators after about and calls onSetup', () => {
    const onSetup = vi.fn();
    const [app] = appMenuTemplate(onSetup, vi.fn(), 'mac');
    const submenu = app!.submenu as Electron.MenuItemConstructorOptions[];

    expect(app!.label).toBe('fly');
    expect(submenu).toEqual([
      {role: 'about'},
      {type: 'separator'},
      {label: 'Configurar fly…', click: expect.any(Function)},
      {type: 'separator'},
      {role: 'services'},
      {type: 'separator'},
      {role: 'hide'},
      {role: 'hideOthers'},
      {role: 'unhide'},
      {type: 'separator'},
      {role: 'quit'},
    ]);

    submenu[2]!.click!({} as never, undefined, {} as never);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });

  it('follows with the file, edit, view and window menus', () => {
    expect(appMenuTemplate(vi.fn(), vi.fn(), 'mac').slice(1)).toEqual([
      {
        role: 'fileMenu',
        submenu: [
          {
            label: 'Nova janela',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: expect.any(Function),
          },
          {type: 'separator'},
          {role: 'close'},
        ],
      },
      {role: 'editMenu'},
      {role: 'viewMenu'},
      {role: 'windowMenu'},
    ]);
  });

  it('opens a new window from Nova janela', () => {
    const onNewWindow = vi.fn();
    const file = appMenuTemplate(vi.fn(), onNewWindow, 'mac')[1]!;
    const [newWindow] = file.submenu as Electron.MenuItemConstructorOptions[];

    newWindow!.click!({} as never, undefined, {} as never);

    expect(onNewWindow).toHaveBeenCalledTimes(1);
  });

  // Window accelerators of an edit or view menu would take Ctrl+C, Ctrl+R and
  // Ctrl+Q from the terminal on Linux.
  it('Should hold only Nova janela, Configurar fly… and Sair on Linux, with no accelerator', () => {
    const onSetup = vi.fn();
    const onNewWindow = vi.fn();
    const template = appMenuTemplate(onSetup, onNewWindow, 'linux');

    expect(template).toEqual([
      {
        label: 'fly',
        submenu: [
          {label: 'Nova janela', click: expect.any(Function)},
          {label: 'Configurar fly…', click: expect.any(Function)},
          {type: 'separator'},
          {role: 'quit', label: 'Sair', registerAccelerator: false},
        ],
      },
    ]);

    const submenu = template[0]!
      .submenu as Electron.MenuItemConstructorOptions[];
    submenu[0]!.click!({} as never, undefined, {} as never);
    expect(onNewWindow).toHaveBeenCalledTimes(1);
    submenu[1]!.click!({} as never, undefined, {} as never);
    expect(onSetup).toHaveBeenCalledTimes(1);
  });
});
