import {CommandState, InstallerImage} from '../domain/setup';

export abstract class AppInstaller {
  abstract commandState(launcher: string): Promise<CommandState>;
  abstract installCommand(launcher: string): Promise<void>;
  abstract findInstaller(): Promise<InstallerImage | null>;
  abstract trashInstaller(image: InstallerImage): Promise<void>;
}
