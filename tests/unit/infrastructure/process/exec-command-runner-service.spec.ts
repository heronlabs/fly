import {realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';

import {ExecCommandRunnerService} from '../../../../src/infrastructure/process/exec-command-runner-service';

describe('ExecCommandRunnerService', () => {
  const runner = new ExecCommandRunnerService();

  it('Should return stdout and code 0 for a succeeding command', async () => {
    const r = await runner.run('sh', ['-c', 'printf hello']);
    expect(r).toEqual({code: 0, stdout: 'hello', stderr: ''});
  });

  it('Should return the exit code and stderr without throwing', async () => {
    const r = await runner.run('sh', ['-c', 'echo bad >&2; exit 3']);
    expect(r.code).toBe(3);
    expect(r.stderr.trim()).toBe('bad');
  });

  it('Should run in the given cwd', async () => {
    const dir = realpathSync(tmpdir());
    const r = await runner.run('sh', ['-c', 'pwd -P'], {cwd: dir});
    expect(r.stdout.trim()).toBe(dir);
  });

  it('Should throw when the binary does not exist', async () => {
    await expect(
      runner.run('definitely-not-a-binary-xyz', []),
    ).rejects.toMatchObject({code: 'ENOENT'});
  });

  it('Should reject when the command exceeds the timeout', async () => {
    await expect(
      runner.run('sh', ['-c', 'sleep 5'], {timeoutMs: 100}),
    ).rejects.toMatchObject({killed: true});
  });
});
