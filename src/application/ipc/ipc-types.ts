import type {Channel} from '../../core/domain/fly-api';

export type IpcHost = {
  handle(
    channel: Channel,
    listener: (event: unknown, ...args: any[]) => unknown,
  ): void;
  on(
    channel: Channel,
    listener: (event: unknown, ...args: any[]) => void,
  ): void;
};
export type Broadcaster = {send(channel: Channel, payload: unknown): void};
export type FolderPicker = {pick(): Promise<string | null>};
export type LinkOpener = {open(url: string): Promise<void>};

export const IPC_HOST = Symbol('IPC_HOST');
export const BROADCASTER = Symbol('BROADCASTER');
export const FOLDER_PICKER = Symbol('FOLDER_PICKER');
export const LINK_OPENER = Symbol('LINK_OPENER');
