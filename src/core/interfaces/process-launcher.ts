export abstract class ProcessLauncher {
  // Runs on the caller's terminal and resolves with the exit code.
  abstract foreground(file: string, args: string[]): Promise<number>;
  // Starts a process that outlives the caller, without stdio; resolves once
  // it is spawned.
  abstract detached(
    file: string,
    args: string[],
    env: Record<string, string | undefined>,
  ): Promise<void>;
}
