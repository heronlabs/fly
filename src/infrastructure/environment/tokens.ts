export const USER_DATA_DIR = Symbol('USER_DATA_DIR');
export const TRASH_ITEM = Symbol('TRASH_ITEM');
export type TrashItem = (path: string) => Promise<void>;
