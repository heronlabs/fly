import type {CommandState} from '../../core/domain/setup';
import {FileStore} from '../../core/interfaces/file-store';

// `fly` on PATH is installed when the link and the launcher resolve to the
// same file; a link that cannot be resolved points somewhere else.
export const linkState = async (
  files: FileStore,
  link: string,
  launcher: string,
): Promise<CommandState> => {
  if (!(await files.exists(link))) return 'missing';
  try {
    const [linked, target] = await Promise.all([
      files.realPath(link),
      files.realPath(launcher),
    ]);
    return linked === target ? 'installed' : 'other';
  } catch {
    return 'other';
  }
};
