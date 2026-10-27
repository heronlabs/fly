export const flyOptions = [
  '@fly_session_id',
  '@fly_worktree',
  '@fly_task',
] as const;

export type FlyOption = (typeof flyOptions)[number];

export type MultiplexerSession = {
  name: string;
  cwd: string;
  createdAt: number;
  attachedClients: number;
  options: Partial<Record<FlyOption, string>>;
};

export abstract class SessionLauncher {
  abstract list(): Promise<MultiplexerSession[]>;
  abstract start(input: {
    name: string;
    cwd: string;
    command: string;
    env?: Record<string, string>;
    options: Partial<Record<FlyOption, string>>;
  }): Promise<void>;
  abstract setOption(
    name: string,
    option: FlyOption,
    value: string,
  ): Promise<void>;
  // Types `text` into the session's pane and submits it with Enter.
  abstract sendText(name: string, text: string): Promise<void>;
  abstract kill(name: string): Promise<void>;
  abstract attachCommand(name: string): {file: string; args: string[]};
}
