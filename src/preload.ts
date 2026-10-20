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
  tasks: {
    create: input => ipcRenderer.invoke(channels.taskCreate, input),
  },
};

contextBridge.exposeInMainWorld('fly', api);
