export type TerminalSize = {cols: number; rows: number};

export type TerminalProcess = {
  onData(listener: (data: string) => void): void;
  onExit(listener: (exitCode: number) => void): void;
  write(data: string): void;
  resize(size: TerminalSize): void;
  kill(): void;
};

export abstract class TerminalSpawner {
  abstract spawn(
    file: string,
    args: string[],
    size: TerminalSize,
  ): TerminalProcess;
}
