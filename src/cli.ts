import 'reflect-metadata';

import {homedir} from 'node:os';
import {join, resolve} from 'node:path';

import {CliHandler} from './application/cli/cli-handler';
import {LaunchService} from './core/services/launch-service';
import {SessionService} from './core/services/session-service';
import {CryptoIdGeneratorService} from './infrastructure/environment/crypto-id-generator-service';
import {JsonConfigStoreService} from './infrastructure/environment/json-config-store-service';
import {NodeFileStoreService} from './infrastructure/filesystem/node-file-store-service';
import {GitCliService} from './infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from './infrastructure/process/exec-command-runner-service';
import {NodeProcessLauncherService} from './infrastructure/process/node-process-launcher-service';
import {TmuxSessionService} from './infrastructure/tmux/tmux-session-service';

// The `fly` CLI. bin/fly runs this file on the checkout's Electron in Node
// mode (ELECTRON_RUN_AS_NODE), so it never imports electron.
const runner = new ExecCommandRunnerService();
const files = new NodeFileStoreService();
// The default tmux server, the one the app uses.
const tmux = new TmuxSessionService(null, runner);
// Electron's userData for productName "fly" on macOS; only read here.
const userData = join(homedir(), 'Library', 'Application Support', 'fly');

void new CliHandler(
  {
    cwd: process.cwd(),
    appDir: resolve(__dirname, '../..'),
    execPath: process.execPath,
    env: process.env,
    interactive: process.stdin.isTTY === true,
  },
  {
    out: line => process.stdout.write(`${line}\n`),
    err: line => process.stderr.write(`${line}\n`),
  },
  tmux,
  new SessionService(tmux, new CryptoIdGeneratorService()),
  new LaunchService(
    files,
    new GitCliService(runner),
    new JsonConfigStoreService(userData, files),
  ),
  files,
  new NodeProcessLauncherService(),
)
  .run(process.argv.slice(2))
  .then(code => {
    process.exitCode = code;
  });
