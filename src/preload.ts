import {contextBridge, ipcRenderer} from 'electron';

import {channels, type FlyApi} from './core/domain/fly-api';

const api: FlyApi = {
  workspace: {
    pickFolder: () => ipcRenderer.invoke(channels.workspacePickFolder),
    open: root => ipcRenderer.invoke(channels.workspaceOpen, root),
    refresh: () => ipcRenderer.invoke(channels.workspaceRefresh),
    onChanged: listener => {
      const handler = (
        _event: unknown,
        workspace: Parameters<typeof listener>[0],
      ) => listener(workspace);
      ipcRenderer.on(channels.workspaceChanged, handler);
      return () => {
        ipcRenderer.removeListener(channels.workspaceChanged, handler);
      };
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(channels.settingsGet),
    set: patch => ipcRenderer.invoke(channels.settingsSet, patch),
  },
  shell: {
    openInEditor: path => ipcRenderer.invoke(channels.shellOpenInEditor, path),
    openExternal: url => ipcRenderer.invoke(channels.shellOpenExternal, url),
  },
  sessions: {
    list: () => ipcRenderer.invoke(channels.sessionList),
    start: worktreeId => ipcRenderer.invoke(channels.sessionStart, worktreeId),
    kill: name => ipcRenderer.invoke(channels.sessionKill, name),
    onChanged: listener => {
      const handler = (
        _event: unknown,
        snapshot: Parameters<typeof listener>[0],
      ) => listener(snapshot);
      ipcRenderer.on(channels.sessionChanged, handler);
      return () => {
        ipcRenderer.removeListener(channels.sessionChanged, handler);
      };
    },
  },
  queue: {
    list: () => ipcRenderer.invoke(channels.queueList),
    onChanged: listener => {
      const handler = (
        _event: unknown,
        snapshot: Parameters<typeof listener>[0],
      ) => listener(snapshot);
      ipcRenderer.on(channels.queueChanged, handler);
      return () => {
        ipcRenderer.removeListener(channels.queueChanged, handler);
      };
    },
  },
  diff: {
    get: (worktreeId, scope) =>
      ipcRenderer.invoke(channels.diffGet, worktreeId, scope),
  },
  pullRequests: {
    merge: worktreeId => ipcRenderer.invoke(channels.prMerge, worktreeId),
  },
  tasks: {
    create: input => ipcRenderer.invoke(channels.taskCreate, input),
  },
  terminal: {
    attach: (sessionName, size) =>
      ipcRenderer.invoke(channels.terminalAttach, sessionName, size),
    detach: terminalId =>
      ipcRenderer.invoke(channels.terminalDetach, terminalId),
    write: (terminalId, data) =>
      ipcRenderer.send(channels.terminalInput, terminalId, data),
    resize: (terminalId, size) =>
      ipcRenderer.send(channels.terminalResize, terminalId, size),
    onData: listener => {
      const handler = (
        _event: unknown,
        payload: {terminalId: string; data: string},
      ) => listener(payload.terminalId, payload.data);
      ipcRenderer.on(channels.terminalData, handler);
      return () => {
        ipcRenderer.removeListener(channels.terminalData, handler);
      };
    },
    onExit: listener => {
      const handler = (
        _event: unknown,
        payload: {terminalId: string; exitCode: number},
      ) => listener(payload.terminalId, payload.exitCode);
      ipcRenderer.on(channels.terminalExit, handler);
      return () => {
        ipcRenderer.removeListener(channels.terminalExit, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('fly', api);
