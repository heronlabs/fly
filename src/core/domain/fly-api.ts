import type {SessionsSnapshot} from './session';
import type {AppConfig} from './settings';
import type {Workspace} from './workspace';

export const channels = {
  workspacePickFolder: 'workspace:pick-folder',
  workspaceOpen: 'workspace:open',
  workspaceRefresh: 'workspace:refresh',
  workspaceChanged: 'workspace:changed',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  shellOpenInEditor: 'shell:open-in-editor',
  sessionList: 'session:list',
  sessionStart: 'session:start',
  sessionKill: 'session:kill',
  sessionChanged: 'session:changed',
  taskCreate: 'task:create',
} as const;

export type Channel = (typeof channels)[keyof typeof channels];

export type FlyApi = {
  workspace: {
    pickFolder(): Promise<string | null>;
    open(root: string): Promise<Workspace>;
    refresh(): Promise<Workspace>;
    onChanged(listener: (workspace: Workspace) => void): () => void;
  };
  settings: {
    get(): Promise<AppConfig>;
    set(patch: Partial<AppConfig>): Promise<AppConfig>;
  };
  shell: {openInEditor(path: string): Promise<void>};
  sessions: {
    list(): Promise<SessionsSnapshot>;
    start(worktreeId: string): Promise<string>;
    kill(name: string): Promise<void>;
    onChanged(listener: (snapshot: SessionsSnapshot) => void): () => void;
  };
  tasks: {
    create(input: {repoId: string; description: string}): Promise<string>;
  };
};

declare global {
  interface Window {
    fly: FlyApi;
  }
}
