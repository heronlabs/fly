import type {DiffScope, WorktreeDiff} from './diff';
import type {
  Eol,
  FileContent,
  FileEntry,
  FilesPoll,
  WriteResult,
} from './files';
import type {LaunchRequest} from './launch';
import type {QueueSnapshot} from './queue';
import type {SearchQuery, SearchResult} from './search';
import type {SessionsSnapshot} from './session';
import type {AppConfig} from './settings';
import type {
  CommandState,
  DoctorReport,
  InstallerImage,
  SetupInfo,
  ToolId,
  UpdateNotice,
} from './setup';
import type {NewTaskInput} from './task';
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
  queueList: 'queue:list',
  queueChanged: 'queue:changed',
  diffGet: 'diff:get',
  fileList: 'file:list',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  filePoll: 'file:poll',
  fileSearch: 'file:search',
  prMerge: 'pr:merge',
  prOpen: 'pr:open',
  prRerun: 'pr:rerun',
  prResume: 'pr:resume',
  prClean: 'pr:clean',
  shellOpenExternal: 'shell:open-external',
  taskCreate: 'task:create',
  taskPickAttachments: 'task:pick-attachments',
  terminalAttach: 'terminal:attach',
  terminalDetach: 'terminal:detach',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  attachmentSaveImage: 'attachment:save-image',
  launchTake: 'launch:take',
  launchRequested: 'launch:requested',
  setupInfo: 'setup:info',
  setupDoctor: 'setup:doctor',
  setupInstallTool: 'setup:install-tool',
  setupCommandState: 'setup:command-state',
  setupInstallCommand: 'setup:install-command',
  setupInstaller: 'setup:installer',
  setupTrashInstaller: 'setup:trash-installer',
  setupComplete: 'setup:complete',
  setupRequested: 'setup:requested',
  updateGet: 'update:get',
  updateChanged: 'update:changed',
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
  shell: {
    openInEditor(path: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  sessions: {
    list(): Promise<SessionsSnapshot>;
    start(worktreeId: string): Promise<string>;
    kill(name: string): Promise<void>;
    onChanged(listener: (snapshot: SessionsSnapshot) => void): () => void;
  };
  queue: {
    list(): Promise<QueueSnapshot>;
    onChanged(listener: (snapshot: QueueSnapshot) => void): () => void;
  };
  diff: {get(worktreeId: string, scope: DiffScope): Promise<WorktreeDiff>};
  files: {
    list(worktreeId: string, dir: string): Promise<FileEntry[]>;
    read(worktreeId: string, path: string): Promise<FileContent>;
    write(
      worktreeId: string,
      path: string,
      text: string,
      eol: Eol,
      expectedMtimeMs: number | null,
    ): Promise<WriteResult>;
    poll(worktreeId: string, openPaths: string[]): Promise<FilesPoll>;
    search(worktreeId: string, query: SearchQuery): Promise<SearchResult>;
  };
  pullRequests: {
    merge(worktreeId: string): Promise<void>;
    open(worktreeId: string): Promise<void>;
    rerun(worktreeId: string): Promise<void>;
    resume(worktreeId: string): Promise<void>;
    clean(worktreeId: string, confirmed: boolean): Promise<void>;
  };
  tasks: {
    create(input: NewTaskInput): Promise<string>;
    pickAttachments(): Promise<string[]>;
  };
  terminal: {
    attach(
      sessionName: string,
      size: {cols: number; rows: number},
    ): Promise<string>;
    detach(terminalId: string): Promise<void>;
    write(terminalId: string, data: string): void;
    resize(terminalId: string, size: {cols: number; rows: number}): void;
    onData(listener: (terminalId: string, data: string) => void): () => void;
    onExit(
      listener: (terminalId: string, exitCode: number) => void,
    ): () => void;
  };
  attachments: {
    // Absolute path of a file dropped from Finder; '' when it has none.
    pathForFile(file: File): string;
    saveImage(png: Uint8Array): Promise<string>;
  };
  launch: {
    // The pending `fly <pasta>` request, once; null when there is none.
    take(): Promise<LaunchRequest | null>;
    onRequested(listener: () => void): () => void;
  };
  setup: {
    info(): Promise<SetupInfo>;
    doctor(): Promise<DoctorReport>;
    installTool(id: ToolId): Promise<DoctorReport>;
    commandState(): Promise<CommandState>;
    installCommand(): Promise<CommandState>;
    installer(): Promise<InstallerImage | null>;
    trashInstaller(imagePath: string): Promise<void>;
    complete(): Promise<void>;
    onRequested(listener: () => void): () => void;
  };
  updates: {
    get(): Promise<UpdateNotice | null>;
    onChanged(listener: (notice: UpdateNotice | null) => void): () => void;
  };
};

declare global {
  interface Window {
    fly: FlyApi;
  }
}
