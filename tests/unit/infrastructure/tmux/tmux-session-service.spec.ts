import {CommandRunner} from '../../../../src/core/interfaces/command-runner';
import {TmuxSessionService} from '../../../../src/infrastructure/tmux/tmux-session-service';

const ok = (stdout = '') => ({code: 0, stdout, stderr: ''});
const timeout = {timeoutMs: 5000};

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
    ].join('\t');

    it('Should run list-sessions with the format and no -L without a socket', async () => {
      run.mockResolvedValue(ok(''));

      await plain().list();

      expect(run).toHaveBeenCalledWith(
        'tmux',
        ['list-sessions', '-F', format],
        timeout,
      );
    });

    it('Should prefix -L when a socket is set', async () => {
      run.mockResolvedValue(ok(''));

      await onSocket().list();

      expect(run).toHaveBeenCalledWith(
        'tmux',
        ['-L', 'sock', 'list-sessions', '-F', format],
        timeout,
      );
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

    it('Should default the missing fields of a short line', async () => {
      run.mockResolvedValue(ok('only-name\n'));

      expect(await plain().list()).toEqual([
        {
          name: 'only-name',
          cwd: '',
          createdAt: 0,
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

      await expect(plain().list()).rejects.toThrow(new Error('boom'));
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
      command: 'claude "$FLY_PROMPT"; exit',
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

      await onSocket().start({
        ...input,
        env: {FLY_PROMPT: 'x y=z', OTHER: '1'},
        options: {...input.options},
      });

      const t = ['-L', 'sock'];
      expect(run.mock.calls).toEqual(
        [
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
          [...t, 'set-option', '-t', '=n-abc123:', 'mouse', 'on'],
          [...t, 'set-option', '-t', '=n-abc123:', 'status', 'off'],
          [...t, 'set-option', '-t', '=n-abc123:', 'history-limit', '10000'],
          [...t, 'set-option', '-t', '=n-abc123:', '@fly_worktree', '%2Fw%20x'],
          [...t, 'set-option', '-t', '=n-abc123:', '@fly_task', "x'y%20z"],
          [
            ...t,
            'new-window',
            '-d',
            '-t',
            '=n-abc123:',
            '-c',
            '/w x',
            '-e',
            'FLY_PROMPT=x y=z',
            '-e',
            'OTHER=1',
            '-P',
            '-F',
            '#{window_id}',
          ],
          [...t, 'kill-window', '-t', '@1'],
          [...t, 'send-keys', '-t', '@2', '-l', input.command],
          [...t, 'send-keys', '-t', '@2', 'Enter'],
        ].map(args => ['tmux', args, timeout]),
      );
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
      expect(run.mock.calls[4]?.[1]).toEqual([
        'new-window',
        '-d',
        '-t',
        '=n-abc123:',
        '-c',
        '/w x',
        '-P',
        '-F',
        '#{window_id}',
      ]);
    });

    it('Should kill the half-built session and rethrow when a later step fails', async () => {
      run
        .mockResolvedValueOnce(ok('@1\n'))
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'no window\n'})
        .mockResolvedValue(ok());

      await expect(plain().start({...input, options: {}})).rejects.toThrow(
        'no window',
      );
      expect(run).toHaveBeenCalledTimes(4);
      expect(run.mock.calls[3]?.[1]).toEqual([
        'kill-session',
        '-t',
        '=n-abc123',
      ]);
    });

    it('Should rethrow the original error when the cleanup kill also fails', async () => {
      const error = new Error('timed out');
      run
        .mockResolvedValueOnce(ok('@1\n'))
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: 'no session'});

      await expect(plain().start({...input, options: {}})).rejects.toBe(error);
      expect(run.mock.calls[2]?.[1]).toEqual([
        'kill-session',
        '-t',
        '=n-abc123',
      ]);
    });

    it('Should throw a default message naming the subcommand when stderr is empty', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});

      await expect(plain().start({...input, options: {}})).rejects.toThrow(
        'tmux new-session failed',
      );
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('start failure messages', () => {
    const fullInput = {
      name: 'n-abc123',
      cwd: '/w',
      command: 'claude',
      options: {'@fly_task': 't'},
    };

    // The nth run call (0-based) fails with empty stderr; the rest succeed.
    const failAt = (index: number) => {
      run.mockReset();
      let call = 0;
      run.mockImplementation(async () => {
        const current = call++;
        if (current === index) {
          return {code: 1, stdout: '', stderr: ''};
        }
        return ok('@1\n');
      });
    };

    it.each([
      [1, 'set-option'],
      [2, 'set-option'],
      [3, 'set-option'],
      [4, 'set-option'],
      [5, 'new-window'],
      [6, 'kill-window'],
      [7, 'send-keys'],
      [8, 'send-keys'],
    ])(
      'Should name the subcommand when call %i fails without stderr (%s)',
      async (index, subcommand) => {
        failAt(index);

        await expect(plain().start(fullInput)).rejects.toThrow(
          `tmux ${subcommand} failed`,
        );
      },
    );
  });

  describe('setOption', () => {
    it('Should set the encoded value on the exact session', async () => {
      run.mockResolvedValue(ok());

      await onSocket().setOption('n-1', '@fly_task', 'a b');

      expect(run).toHaveBeenCalledWith(
        'tmux',
        ['-L', 'sock', 'set-option', '-t', '=n-1:', '@fly_task', 'a%20b'],
        timeout,
      );
    });

    it('Should throw a default message naming set-option when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      await expect(plain().setOption('n-1', '@fly_task', 'a')).rejects.toThrow(
        'tmux set-option failed',
      );
    });
  });

  describe('sendText', () => {
    it('Should type the text literally, then press Enter, on the session target', async () => {
      run.mockResolvedValue(ok());

      await onSocket().sendText('fly-a1b2c3', 'fly: x');

      expect(run.mock.calls).toEqual([
        [
          'tmux',
          [
            '-L',
            'sock',
            'send-keys',
            '-t',
            '=fly-a1b2c3:',
            '-l',
            '--',
            'fly: x',
          ],
          timeout,
        ],
        [
          'tmux',
          ['-L', 'sock', 'send-keys', '-t', '=fly-a1b2c3:', 'Enter'],
          timeout,
        ],
      ]);
    });

    it('Should escape a trailing semicolon and only that one', async () => {
      run.mockResolvedValue(ok());

      await plain().sendText('n', 'a; b;');
      await plain().sendText('n', ';x');

      expect(run.mock.calls[0]?.[1]).toEqual([
        'send-keys',
        '-t',
        '=n:',
        '-l',
        '--',
        'a; b\\;',
      ]);
      expect(run.mock.calls[2]?.[1]).toEqual([
        'send-keys',
        '-t',
        '=n:',
        '-l',
        '--',
        ';x',
      ]);
    });

    it('Should not press Enter when typing fails', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: 'no pane\n'});

      await expect(plain().sendText('n', 'x')).rejects.toThrow('no pane');
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('Should name send-keys when typing fails without stderr', async () => {
      run.mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});

      await expect(plain().sendText('n', 'x')).rejects.toThrow(
        'tmux send-keys failed',
      );
    });

    it('Should name send-keys when Enter fails without stderr', async () => {
      run
        .mockResolvedValueOnce(ok())
        .mockResolvedValueOnce({code: 1, stdout: '', stderr: ''});

      await expect(plain().sendText('n', 'x')).rejects.toThrow(
        'tmux send-keys failed',
      );
    });
  });

  describe('kill', () => {
    it('Should kill the exact session', async () => {
      run.mockResolvedValue(ok());

      await plain().kill('n-1');

      expect(run).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', '=n-1'],
        timeout,
      );
    });

    it('Should throw on failure', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: "can't find"});

      await expect(plain().kill('n-1')).rejects.toThrow("can't find");
    });

    it('Should throw a default message naming kill-session when stderr is empty', async () => {
      run.mockResolvedValue({code: 1, stdout: '', stderr: ''});

      await expect(plain().kill('n-1')).rejects.toThrow(
        'tmux kill-session failed',
      );
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
