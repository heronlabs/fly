import type {Channel} from '../../core/domain/fly-api';

// What a listener needs of Electron's event: the window that sent it, by the
// id of its web contents.
export type IpcEvent = {sender: {id: number}};
export type IpcHost = {
  handle(
    channel: Channel,
    listener: (event: IpcEvent, ...args: any[]) => unknown,
  ): void;
  on(
    channel: Channel,
    listener: (event: IpcEvent, ...args: any[]) => void,
  ): void;
};
export type Broadcaster = {
  // Every window.
  send(channel: Channel, payload: unknown): void;
  // One window, by the id of its web contents; a closed one gets nothing.
  sendTo(windowId: number, channel: Channel, payload: unknown): void;
};
export type FolderPicker = {pick(): Promise<string | null>};
export type FilePicker = {pick(): Promise<string[]>};
export type LinkOpener = {open(url: string): Promise<void>};

export const IPC_HOST = Symbol('IPC_HOST');
export const BROADCASTER = Symbol('BROADCASTER');
export const FOLDER_PICKER = Symbol('FOLDER_PICKER');
export const FILE_PICKER = Symbol('FILE_PICKER');
export const LINK_OPENER = Symbol('LINK_OPENER');
