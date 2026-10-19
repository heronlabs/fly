export type CommandResult = {code: number; stdout: string; stderr: string};

export abstract class CommandRunner {
  abstract run(
    command: string,
    args: string[],
    options?: {cwd?: string; timeoutMs?: number},
  ): Promise<CommandResult>;
}
