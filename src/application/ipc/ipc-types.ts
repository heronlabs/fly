import type {Channel} from '../../core/domain/fly-api';

export type IpcHost = {
  handle(
    channel: Channel,
    listener: (event: unknown, ...args: any[]) => unknown,
  ): void;
};
export type Broadcaster = {send(channel: Channel, payload: unknown): void};
export type FolderPicker = {pick(): Promise<string | null>};

export const IPC_HOST = Symbol('IPC_HOST');
export const BROADCASTER = Symbol('BROADCASTER');
export const FOLDER_PICKER = Symbol('FOLDER_PICKER');
