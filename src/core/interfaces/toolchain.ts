import {ToolId} from '../domain/setup';

export abstract class Toolchain {
  abstract version(tool: ToolId): Promise<string | null>;
  abstract ghLoggedIn(): Promise<boolean>;
  abstract hasBrew(): Promise<boolean>;
  abstract brewInstall(formula: string): Promise<void>;
}
