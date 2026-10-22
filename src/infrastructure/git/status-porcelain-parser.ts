import {FileFlag} from '../../core/domain/files';

const KNOWN_XY = /^[ MTADRCU]{2}$/;

export const flagOf = (xy: string): FileFlag | null => {
  if (xy === '??') {
    return 'A';
  }
  if (!KNOWN_XY.test(xy)) {
    return null;
  }
  if (xy.includes('D')) {
    return 'D';
  }
  return xy.startsWith('A') ? 'A' : 'M';
};

export const parseStatusPorcelain = (
  output: string,
): Record<string, FileFlag> => {
  const flags: Record<string, FileFlag> = {};
  const fields = output.split('\0');

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] as string;
    const xy = field.slice(0, 2);
    const path = field.slice(3);
    if (xy.startsWith('R') || xy.startsWith('C')) {
      flags[path] = 'A';
      const oldPath = fields[++i];
      if (oldPath) {
        flags[oldPath] = 'D';
      }
      continue;
    }
    const flag = flagOf(xy);
    if (flag) {
      flags[path] = flag;
    }
  }

  return flags;
};
