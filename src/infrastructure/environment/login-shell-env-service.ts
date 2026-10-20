import {Injectable} from '@nestjs/common';

import {CommandRunner} from '../../core/interfaces/command-runner';

export type LoginEnv = {PATH?: string; LANG?: string};

const MARKER = '__FLY_ENV__';
const SCRIPT = `printf "${MARKER}%s\\n%s${MARKER}" "$PATH" "$LANG"`;

@Injectable()
export class LoginShellEnvService {
  constructor(private readonly runner: CommandRunner) {}

  async resolve(shell: string): Promise<LoginEnv> {
    try {
      const result = await this.runner.run(shell, ['-ilc', SCRIPT], {
        timeoutMs: 5000,
      });
      return result.code === 0 ? parse(result.stdout) : {};
    } catch {
      return {};
    }
  }
}

function parse(stdout: string): LoginEnv {
  const start = stdout.indexOf(MARKER);
  const end = stdout.lastIndexOf(MARKER);
  // A lone marker gives end === start, hence an empty body and no values.
  if (start === -1) return {};
  const body = stdout.slice(start + MARKER.length, end);
  const [path, lang] = body.split('\n');
  const env: LoginEnv = {};
  if (path) env.PATH = path;
  if (lang) env.LANG = lang;
  return env;
}

export const mergePath = (
  current: string | undefined,
  login: string | undefined,
): string => {
  const entries = [...(login ?? '').split(':'), ...(current ?? '').split(':')];
  return [...new Set(entries.filter(entry => entry !== ''))].join(':');
};
