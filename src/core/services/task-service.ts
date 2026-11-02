import {posix} from 'node:path';

import {Injectable} from '@nestjs/common';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_BRANCH_ATTEMPTS,
  MAX_PROMPT_CHARS,
  MODELS,
  NewTaskInput,
} from '../domain/task';
import {Repo, Workspace} from '../domain/workspace';
import {FileStore} from '../interfaces/file-store';
import {IdGenerator} from '../interfaces/id-generator';
import {PrGateway} from '../interfaces/pr-gateway';
import {TaskFiles} from '../interfaces/task-files';
import {TaskStore} from '../interfaces/task-store';
import {VcsGateway} from '../interfaces/vcs-gateway';
import {branchCandidate, branchFromDescription} from './branch-naming';
import {resolveDefaultBranch} from './default-branch';
import {cleanPrompt, normalizePrompt} from './session-naming';
import {SessionService} from './session-service';

// @fly_task is display-only and travels in every list-sessions line.
const TASK_LABEL_LENGTH = 200;

const WORKTREES_DIR = '.worktrees';

const worktreePath = (repoPath: string, branch: string): string =>
  posix.join(repoPath, WORKTREES_DIR, branch);

@Injectable()
export class TaskService {
  constructor(
    private readonly sessions: SessionService,
    private readonly ids: IdGenerator,
    private readonly vcs: VcsGateway,
    private readonly prs: PrGateway,
    private readonly files: FileStore,
    private readonly tasks: TaskStore,
    private readonly taskFiles: TaskFiles,
  ) {}

  async create(input: NewTaskInput): Promise<string> {
    const workspace = this.sessions.currentWorkspace();
    if (!workspace) throw new Error('Nenhuma pasta aberta');
    const repo = workspace.repos.find(r => r.id === input.repoId);
    if (!repo) throw new Error('Repositório não encontrado');
    const description = input.description.trim();
    if (!description) throw new Error('Descreva a tarefa');
    return this.start(workspace, repo, input, description);
  }

  private async start(
    workspace: Workspace,
    repo: Repo,
    input: NewTaskInput,
    description: string,
  ): Promise<string> {
    const {model} = input;
    if (Array.from(description).length > MAX_PROMPT_CHARS) {
      throw new Error(
        `Prompt muito longo (máx. ${MAX_PROMPT_CHARS} caracteres)`,
      );
    }
    if (model !== null && !(MODELS as readonly string[]).includes(model)) {
      throw new Error('Modelo inválido');
    }
    const typed = input.branch.trim();
    const branch =
      typed === ''
        ? await this.generatedBranch(repo.path, description)
        : await this.typedBranch(repo.path, typed);
    const path = worktreePath(repo.path, branch);
    for (const source of input.attachments) {
      const info = await this.files.stat(source);
      if (!info.isFile) {
        throw new Error(`Não é um arquivo: ${posix.basename(source)}`);
      }
      if (info.size > MAX_ATTACHMENT_BYTES) {
        throw new Error(`Arquivo maior que 20 MB: ${posix.basename(source)}`);
      }
    }
    const base = await resolveDefaultBranch(this.vcs, this.prs, repo.path);
    await this.vcs.fetch(repo.path, base);
    await this.vcs.addWorktree({
      repoPath: repo.path,
      path,
      branch,
      base: `origin/${base}`,
    });
    await this.vcs.ensureIgnored(repo.path, WORKTREES_DIR);
    // From here the worktree exists; a failure leaves it and its branch alone.
    const id = this.ids.uuid();
    const copies: string[] = [];
    for (const source of input.attachments) {
      copies.push(await this.taskFiles.copyIn(id, source));
    }
    const attached = copies.length
      ? `\n\nArquivos anexados:\n${copies.map(c => `- ${c}`).join('\n')}`
      : '';
    const promptFile = await this.taskFiles.write(
      id,
      'prompt.md',
      cleanPrompt(description) + attached,
    );
    const name = await this.sessions.launch(
      posix.relative(workspace.root, path),
      path,
      {
        promptFile,
        model,
        task: Array.from(normalizePrompt(description))
          .slice(0, TASK_LABEL_LENGTH)
          .join(''),
      },
    );
    await this.tasks.save({
      id,
      repoPath: repo.path,
      worktreePath: path,
      branch,
      base,
      model,
      promptFile,
      prNumber: null,
      phase: 'working',
      ciAttempts: 0,
      fixedSha: null,
      reviewSeenAt: null,
      review: null,
      outbox: null,
      pending: null,
      stop: null,
      createdAt: Date.now(),
    });
    return name;
  }

  private async typedBranch(repoPath: string, branch: string): Promise<string> {
    if (!(await this.vcs.validBranchName(repoPath, branch))) {
      throw new Error('Nome de branch inválido');
    }
    if (await this.vcs.branchExists(repoPath, branch)) {
      throw new Error(`O branch ${branch} já existe`);
    }
    const path = worktreePath(repoPath, branch);
    if (await this.files.exists(path)) {
      throw new Error(`Já existe uma pasta em ${path}`);
    }
    return branch;
  }

  // The first candidate with neither a branch nor a folder of its name.
  private async generatedBranch(
    repoPath: string,
    description: string,
  ): Promise<string> {
    const name = branchFromDescription(description);
    for (let attempt = 1; attempt <= MAX_BRANCH_ATTEMPTS; attempt++) {
      const branch = branchCandidate(name, attempt);
      if (
        !(await this.vcs.branchExists(repoPath, branch)) &&
        !(await this.files.exists(worktreePath(repoPath, branch)))
      ) {
        return branch;
      }
    }
    throw new Error(`Não foi possível gerar um nome de branch para ${name}`);
  }
}
