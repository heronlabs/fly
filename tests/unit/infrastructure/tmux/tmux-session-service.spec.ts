import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {TmuxSessionService} from '../../../../src/infrastructure/tmux/tmux-session-service';

const ok = (stdout = '') => ({code: 0, stdout, stderr: ''});

describe('TmuxSessionService', () => {
  const run = vi.fn();
  const runner = {run} as unknown as CommandRunner;
  const plain = () => new TmuxSessionService(null, runner);
  const onSocket = () => new TmuxSessionService('sock', runner);

  describe('list', () => {
    const format = [
      '#{session_name}',
      '#{pane_current_path}',
      '#{session_created}',
      '#{session_attached}',
      '#{@fly_session_id}',
      '#{@fly_worktree}',
      '#{@fly_task}',
      '#{@fly_task_repo}',
      '#{@fly_task_baseline}',
    ].join('\t');

    it('Should run list-sessions with the format and no -L without a socket', async () => {
      run.mockResolvedValue(ok(''));

      await plain().list();

      expect(run).toHaveBeenCalledWith('tmux', ['list-sessions', '-F', format]);
    });

    it('Should prefix -L when a socket is set', async () => {
      run.mockResolvedValue(ok(''));

      await onSocket().list();

      expect(run).toHaveBeenCalledWith('tmux', [
        '-L',
        'sock',
        'list-sessions',
        '-F',
        format,
      ]);
    });

    it('Should parse tab-separated lines and decode option values', async () => {
      run.mockResolvedValue(
        ok(
          [
            ['a-1', '/w/a', '100', '1', 'id1', '/w/a', "fix%20it's", '', ''],
            ['b-2', '/w/b', '200', '0', '', '', '', '', ''],
          ]
            .map(fields => fields.join('\t'))
            .join('\n') + '\n',
        ),
      );

      const sessions = await plain().list();

      expect(sessions).toEqual([
        {
          name: 'a-1',
          cwd: '/w/a',
          createdAt: 100,
          attachedClients: 1,
          options: {
            '@fly_session_id': 'id1',
            '@fly_worktree': '/w/a',
            '@fly_task': "fix it's",
          },
        },
        {
          name: 'b-2',
          cwd: '/w/b',
          createdAt: 200,
          attachedClients: 0,
          options: {},
        },
      ]);
    });

    it.each([
      'no server running on /tmp/tmux-501/default',
      'error connecting to /tmp/tmux-501/default (No such file or directory)',
    ])('Should return [] when tmux says "%s"', async stderr => {
      run.mockResolvedValue({code: 1, stdout: '', stderr});

      expect(await plain().list()).toEqual([]);
    });

    it('Should throw with stderr on any other failure', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ' boom \n'});

      await expect(plain().list()).rejects.toThrow('boom');
    });

    it('Should throw a default message when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      await expect(plain().list()).rejects.toThrow('tmux list-sessions failed');
    });

    it('Should propagate the runner rejection (ENOENT)', async () => {
      const error = Object.assign(new Error('spawn tmux ENOENT'), {
        code: 'ENOENT',
      });
      run.mockRejectedValue(error);

      await expect(plain().list()).rejects.toBe(error);
    });
  });

  describe('start', () => {
    const input = {
      name: 'n-abc123',
      cwd: '/w x',
      command: "claude 'do it'; exit",
      options: {'@fly_task': "x'y z", '@fly_worktree': '/w x'} as const,
    };

    it('Should run the steps in order with exact argv', async () => {
      run
        .mockResolvedValueOnce(ok('@1\n'))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok('@2\n'))
        .mockResolvedValue(ok());

      await onSocket().start({...input, options: {...input.options}});

      const t = ['-L', 'sock'];
      expect(run.mock.calls).toEqual([
        [
          'tmux',
          [
            ...t,
            'new-session',
            '-d',
            '-s',
            'n-abc123',
            '-c',
            '/w x',
            '-P',
            '-F',
            '#{window_id}',
          ],
        ],
        ['tmux', [...t, 'set-option', '-t', '=n-abc123:', 'mouse', 'on']],
        ['tmux', [...t, 'set-option', '-t', '=n-abc123:', 'status', 'off']],
        [
          'tmux',
          [...t, 'set-option', '-t', '=n-abc123:', 'history-limit', '10000'],
        ],
        [
          'tmux',
          [...t, 'set-option', '-t', '=n-abc123:', '@fly_worktree', '%2Fw%20x'],
        ],
        [
          'tmux',
          [...t, 'set-option', '-t', '=n-abc123:', '@fly_task', "x'y%20z"],
        ],
        [
          'tmux',
          [
            ...t,
            'new-window',
            '-d',
            '-t',
            '=n-abc123:',
            '-c',
            '/w x',
            '-P',
            '-F',
            '#{window_id}',
          ],
        ],
        ['tmux', [...t, 'kill-window', '-t', '@1']],
        ['tmux', [...t, 'send-keys', '-t', '@2', '-l', input.command]],
        ['tmux', [...t, 'send-keys', '-t', '@2', 'Enter']],
      ]);
    });

    it('Should skip fly options when none are given and omit -L without a socket', async () => {
      run
        .mockResolvedValueOnce(ok('@1\n'))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok('@2\n'))
        .mockResolvedValue(ok());

      await plain().start({...input, options: {}});

      expect(run).toHaveBeenCalledTimes(8);
      expect(run.mock.calls[0]?.[1]?.[0]).toBe('new-session');
    });

    it('Should throw with stderr when a later step fails', async () => {
      run
        .mockResolvedValueOnce(ok('@1\n'))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'no window\n'});

      await expect(plain().start({...input, options: {}})).rejects.toThrow(
        'no window',
      );
      expect(run).toHaveBeenCalledTimes(5);
    });

    it('Should throw a default message naming the subcommand when stderr is empty', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});

      await expect(plain().start({...input, options: {}})).rejects.toThrow(
        'tmux new-session failed',
      );
    });
  });

  describe('setOption', () => {
    it('Should set the encoded value on the exact session', async () => {
      run.mockResolvedValue(ok());

      await onSocket().setOption('n-1', '@fly_task', 'a b');

      expect(run).toHaveBeenCalledWith('tmux', [
        '-L',
        'sock',
        'set-option',
        '-t',
        '=n-1:',
        '@fly_task',
        'a%20b',
      ]);
    });
  });

  describe('kill', () => {
    it('Should kill the exact session', async () => {
      run.mockResolvedValue(ok());

      await plain().kill('n-1');

      expect(run).toHaveBeenCalledWith('tmux', ['kill-session', '-t', '=n-1']);
    });

    it('Should throw on failure', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: "can't find"});

      await expect(plain().kill('n-1')).rejects.toThrow("can't find");
    });
  });

  describe('attachCommand', () => {
    it('Should build the attach argv with and without a socket', () => {
      expect(plain().attachCommand('n-1')).toEqual({
        file: 'tmux',
        args: ['-u', 'attach-session', '-t', '=n-1'],
      });
      expect(onSocket().attachCommand('n-1')).toEqual({
        file: 'tmux',
        args: ['-L', 'sock', '-u', 'attach-session', '-t', '=n-1'],
      });
    });
  });
});
