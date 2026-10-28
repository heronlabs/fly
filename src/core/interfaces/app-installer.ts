import {CommandState, InstallerImage} from '../domain/setup';

export abstract class AppInstaller {
  abstract commandState(launcher: string): Promise<CommandState>;
  abstract installCommand(launcher: string): Promise<void>;
  // With `imagePath`, only the mounted fly installer from that image.
  abstract findInstaller(imagePath?: string): Promise<InstallerImage | null>;
  abstract trashInstaller(image: InstallerImage): Promise<void>;
}
