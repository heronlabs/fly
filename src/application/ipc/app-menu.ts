import type {MenuItemConstructorOptions} from 'electron';

export function appMenuTemplate(
  onSetup: () => void,
  onNewWindow: () => void,
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'fly',
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {label: 'Configurar fly…', click: () => onSetup()},
        {type: 'separator'},
        {role: 'services'},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideOthers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'},
      ],
    },
    {
      role: 'fileMenu',
      submenu: [
        {
          label: 'Nova janela',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => onNewWindow(),
        },
        {type: 'separator'},
        {role: 'close'},
      ],
    },
    {role: 'editMenu'},
    {role: 'viewMenu'},
    {role: 'windowMenu'},
  ];
}
