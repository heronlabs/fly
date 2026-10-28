import {ToolId} from '../domain/setup';

export abstract class Toolchain {
  abstract version(tool: ToolId): Promise<string | null>;
  abstract ghLoggedIn(): Promise<boolean>;
  abstract hasBrew(): Promise<boolean>;
  abstract brewInstall(formula: string): Promise<void>;
  // Re-reads the login shell's PATH so tools installed after launch are found.
  abstract refreshPath(): Promise<void>;
}
