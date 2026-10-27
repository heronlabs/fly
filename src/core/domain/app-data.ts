// Electron's userData folder name, under appData, of the installed app.
export const USER_DATA_FOLDER = 'fly';
// A dev build keeps its own data, apart from the installed app's.
export const DEV_USER_DATA_FOLDER = 'fly-dev';

export const userDataFolder = (packaged: boolean): string =>
  packaged ? USER_DATA_FOLDER : DEV_USER_DATA_FOLDER;
