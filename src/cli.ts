import 'reflect-metadata';

import {homedir} from 'node:os';

import {CliHandler} from './application/cli/cli-handler';
import {cliLayout} from './application/cli/cli-layout';
import {LaunchService} from './core/services/launch-service';
import {SessionService} from './core/services/session-service';
import {CryptoIdGeneratorService} from './infrastructure/environment/crypto-id-generator-service';
import {JsonConfigStoreService} from './infrastructure/environment/json-config-store-service';
import {NodeFileStoreService} from './infrastructure/filesystem/node-file-store-service';
import {GitCliService} from './infrastructure/git/git-cli-service';
import {ExecCommandRunnerService} from './infrastructure/process/exec-command-runner-service';
import {NodeProcessLauncherService} from './infrastructure/process/node-process-launcher-service';
import {TmuxSessionService} from './infrastructure/tmux/tmux-session-service';

// The `fly` CLI. bin/fly runs this file on fly's own Electron in Node mode
// (ELECTRON_RUN_AS_NODE: the checkout's, or Contents/MacOS/fly with the CLI inside
// app.asar when installed), so it never imports electron.
const runner = new ExecCommandRunnerService();
const files = new NodeFileStoreService();
// The default tmux server, the one the app uses.
const tmux = new TmuxSessionService(null, runner);
const {appDir, userData} = cliLayout(__dirname, homedir());

void new CliHandler(
  {
    cwd: process.cwd(),
    appDir,
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
