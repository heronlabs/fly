import type {MenuItemConstructorOptions} from 'electron';

import type {Platform} from '../../core/domain/platform';

export function appMenuTemplate(
  onSetup: () => void,
  onNewWindow: () => void,
  platform: Platform,
): MenuItemConstructorOptions[] {
  // No edit or view menu on Linux: their window accelerators would take Ctrl+C,
  // Ctrl+R and Ctrl+Q from the terminal, where Ctrl+C must reach claude.
  if (platform === 'linux') {
    return [
      {
        label: 'fly',
        submenu: [
          {label: 'Nova janela', click: () => onNewWindow()},
          {label: 'Configurar fly…', click: () => onSetup()},
          {type: 'separator'},
          {role: 'quit', label: 'Sair', registerAccelerator: false},
        ],
      },
    ];
  }
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
