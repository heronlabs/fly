import type {MenuItemConstructorOptions} from 'electron';

export function appMenuTemplate(
  onSetup: () => void,
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
    {role: 'fileMenu'},
    {role: 'editMenu'},
    {role: 'viewMenu'},
    {role: 'windowMenu'},
  ];
}
