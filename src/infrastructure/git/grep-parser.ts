import type {GrepHit} from '../../core/interfaces/vcs-gateway';

// `git grep -z -n` prints `<path>\0<line>\0<text>\n` per matching line. -z
// leaves a path verbatim, so it may hold a newline; the text never does.
const HIT = /([^\0]*)\0(\d+)\0([^\n]*)\n?/g;

export const parseGrep = (output: string): GrepHit[] =>
  [...output.matchAll(HIT)].map(([, path, line, text]) => ({
    path: path as string,
    line: Number(line),
    text: (text as string).replace(/\r$/, ''),
  }));
