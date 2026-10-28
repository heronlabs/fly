import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CommandStep,
  DependenciesStep,
  DoneStep,
} from '../../../src/application/ui/panels/setup-steps';
import type {DoctorReport, ToolCheck} from '../../../src/core/domain/setup';

const ok = (id: ToolCheck['id'], version = '1.0'): ToolCheck => ({
  id,
  ok: true,
  version,
  problem: null,
  fix: null,
});

const allOk: DoctorReport = {
  brew: true,
  tools: [ok('git', '2.47'), ok('gh', '2.60'), ok('tmux', '3.5'), ok('claude')],
};

const missingTmux = (brew: boolean): DoctorReport => ({
  brew,
  tools: [
    ok('git'),
    ok('gh'),
    {
      id: 'tmux',
      ok: false,
      version: null,
      problem: 'não encontrado',
      fix: {kind: 'brew', formula: 'tmux'},
    },
    ok('claude'),
  ],
});

const missingClaude: DoctorReport = {
  brew: true,
  tools: [
    ok('git'),
    ok('gh'),
    ok('tmux'),
    {
      id: 'claude',
      ok: false,
      version: null,
      problem: 'não encontrado',
      fix: {kind: 'copy', command: 'npm install -g @anthropic-ai/claude-code'},
    },
  ],
};

describe('DependenciesStep', () => {
  it('lists the four tools and enables Continuar when all are ok', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(allOk);
    const onNext = vi.fn();
    render(<DependenciesStep onNext={onNext} />);
    expect(await screen.findByText('✓ 2.47')).toBeVisible();
    for (const id of ['git', 'gh', 'tmux', 'claude']) {
      expect(screen.getByText(id)).toBeVisible();
    }
    expect(screen.getByText('Verificando o que o fly precisa')).toBeVisible();
    await userEvent.click(screen.getByRole('button', {name: 'Continuar'}));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('shows Verificando… while the doctor runs, on mount and on re-check', async () => {
    let finish: (report: DoctorReport) => void = () => {};
    vi.mocked(window.fly.setup.doctor)
      .mockResolvedValueOnce(allOk)
      .mockImplementationOnce(
        () => new Promise<DoctorReport>(resolve => (finish = resolve)),
      );
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(screen.getByText('Verificando…')).toBeVisible();
    await screen.findByText('✓ 2.47');
    expect(screen.queryByText('Verificando…')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', {name: 'Verificar de novo'}),
    );
    expect(screen.getByText('Verificando…')).toBeVisible();
    finish(allOk);
    await waitFor(() => expect(screen.queryByText('Verificando…')).toBeNull());
  });

  it('clears the report when a re-check rejects so Continuar is disabled', async () => {
    vi.mocked(window.fly.setup.doctor)
      .mockResolvedValueOnce(allOk)
      .mockRejectedValueOnce(new Error('boom'));
    render(<DependenciesStep onNext={vi.fn()} />);
    await screen.findByText('✓ 2.47');
    await userEvent.click(
      screen.getByRole('button', {name: 'Verificar de novo'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.queryByText('✓ 2.47')).toBeNull();
    expect(screen.getByRole('button', {name: 'Continuar'})).toBeDisabled();
  });

  it('disables Continuar while a tool has a problem', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(missingTmux(true));
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(await screen.findByText('✗ não encontrado')).toBeVisible();
    expect(screen.getByRole('button', {name: 'Continuar'})).toBeDisabled();
  });

  it('Verificar de novo runs the doctor again', async () => {
    vi.mocked(window.fly.setup.doctor)
      .mockResolvedValueOnce(missingTmux(true))
      .mockResolvedValueOnce(allOk);
    render(<DependenciesStep onNext={vi.fn()} />);
    await screen.findByText('✗ não encontrado');
    await userEvent.click(
      screen.getByRole('button', {name: 'Verificar de novo'}),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Continuar'})).toBeEnabled(),
    );
    expect(window.fly.setup.doctor).toHaveBeenCalledTimes(2);
  });

  it('installs with brew and shows the returned report', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(missingTmux(true));
    let finish: (report: DoctorReport) => void = () => undefined;
    vi.mocked(window.fly.setup.installTool).mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    render(<DependenciesStep onNext={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar com brew'}),
    );
    expect(window.fly.setup.installTool).toHaveBeenCalledWith('tmux');
    expect(
      screen.getByRole('button', {name: 'Instalando tmux…'}),
    ).toBeDisabled();
    finish(allOk);
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Continuar'})).toBeEnabled(),
    );
    expect(screen.queryByText(/Instalando/)).toBeNull();
  });

  it('shows the brew.sh link and the command when brew is missing', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(missingTmux(false));
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(await screen.findByText('Homebrew não encontrado')).toBeVisible();
    expect(screen.getByText('brew install tmux')).toBeVisible();
    expect(
      screen.queryByRole('button', {name: 'Instalar com brew'}),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', {name: 'brew.sh'}));
    expect(window.fly.shell.openExternal).toHaveBeenCalledWith(
      'https://brew.sh',
    );
  });

  it('copies the command of a copy fix', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(missingClaude);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {writeText},
      configurable: true,
    });
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(
      await screen.findByText('npm install -g @anthropic-ai/claude-code'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', {name: 'Copiar'}));
    expect(writeText).toHaveBeenCalledWith(
      'npm install -g @anthropic-ai/claude-code',
    );
  });

  it('shows a doctor rejection without the IPC prefix', async () => {
    vi.mocked(window.fly.setup.doctor).mockRejectedValue(
      new Error("Error invoking remote method 'setup:doctor': Error: boom"),
    );
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    expect(screen.getByRole('button', {name: 'Continuar'})).toBeDisabled();
  });

  it('shows an install rejection and re-enables the install button', async () => {
    vi.mocked(window.fly.setup.doctor).mockResolvedValue(missingTmux(true));
    vi.mocked(window.fly.setup.installTool).mockRejectedValue(
      new Error('brew install tmux falhou: x'),
    );
    render(<DependenciesStep onNext={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar com brew'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'brew install tmux falhou: x',
    );
    expect(
      screen.getByRole('button', {name: 'Instalar com brew'}),
    ).toBeEnabled();
  });

  it('shows a plain-string rejection', async () => {
    vi.mocked(window.fly.setup.doctor).mockRejectedValue('plain');
    render(<DependenciesStep onNext={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('plain');
  });
});

describe('CommandStep', () => {
  it('explains the install when the command is missing', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('missing');
    vi.mocked(window.fly.setup.installCommand).mockResolvedValue('installed');
    const onNext = vi.fn();
    render(<CommandStep onNext={onNext} />);
    expect(await screen.findByText('Comando fly no terminal')).toBeVisible();
    expect(
      screen.getByText(
        'O fly também vai para a linha de comando, como o code do VSCode:',
      ),
    ).toBeVisible();
    expect(
      screen.getByText('/usr/local/bin/fly → /Applications/fly.app'),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Sem mexer no .zshrc: /usr/local/bin já está no PATH padrão do macOS. O macOS vai pedir sua senha de administrador.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/será substituído/)).toBeNull();
    await userEvent.click(
      screen.getByRole('button', {name: 'Instalar e continuar'}),
    );
    await waitFor(() => expect(onNext).toHaveBeenCalledWith('done'));
  });

  it('warns that another target will be replaced', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('other');
    render(<CommandStep onNext={vi.fn()} />);
    expect(
      await screen.findByText(
        '/usr/local/bin/fly aponta para outro lugar; será substituído.',
      ),
    ).toBeVisible();
  });

  it('continues when already installed', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('installed');
    const onNext = vi.fn();
    render(<CommandStep onNext={onNext} />);
    expect(await screen.findByText('✓ já instalado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', {name: 'Continuar'}));
    expect(onNext).toHaveBeenCalledWith('done');
    expect(window.fly.setup.installCommand).not.toHaveBeenCalled();
  });

  it('shows a failure and offers Tentar de novo and Pular', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('missing');
    vi.mocked(window.fly.setup.installCommand)
      .mockRejectedValueOnce(
        new Error(
          "Error invoking remote method 'setup:install-command': Error: Instalação cancelada",
        ),
      )
      .mockResolvedValueOnce('installed');
    const onNext = vi.fn();
    render(<CommandStep onNext={onNext} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar e continuar'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Instalação cancelada',
    );
    expect(screen.queryByText('Instalação cancelada')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', {name: 'Tentar de novo'}));
    await waitFor(() => expect(onNext).toHaveBeenCalledWith('done'));
  });

  it('Pular skips the command', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('missing');
    vi.mocked(window.fly.setup.installCommand).mockRejectedValue(
      new Error('Falha ao instalar o comando: x'),
    );
    const onNext = vi.fn();
    render(<CommandStep onNext={onNext} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar e continuar'}),
    );
    await userEvent.click(await screen.findByRole('button', {name: 'Pular'}));
    expect(onNext).toHaveBeenCalledWith('skipped');
  });

  it('shows a commandState rejection', async () => {
    vi.mocked(window.fly.setup.commandState).mockRejectedValue(
      new Error('Disponível só no app instalado'),
    );
    const onNext = vi.fn();
    render(<CommandStep onNext={onNext} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Disponível só no app instalado',
    );
    await userEvent.click(screen.getByRole('button', {name: 'Pular'}));
    expect(onNext).toHaveBeenCalledWith('skipped');
  });

  it('Tentar de novo re-reads the state after a commandState rejection', async () => {
    vi.mocked(window.fly.setup.commandState)
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce('missing');
    render(<CommandStep onNext={vi.fn()} />);
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', {name: 'Instalar e continuar'}),
    ).toBeNull();
    await userEvent.click(screen.getByRole('button', {name: 'Tentar de novo'}));
    expect(
      await screen.findByRole('button', {name: 'Instalar e continuar'}),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(window.fly.setup.installCommand).not.toHaveBeenCalled();
    expect(window.fly.setup.commandState).toHaveBeenCalledTimes(2);
  });

  it('shows the not-pointing-to-fly failure with Tentar de novo and Pular', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('missing');
    vi.mocked(window.fly.setup.installCommand).mockRejectedValue(
      new Error(
        'Falha ao instalar o comando: /usr/local/bin/fly não aponta para o fly',
      ),
    );
    render(<CommandStep onNext={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar e continuar'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'não aponta para o fly',
    );
    expect(screen.getByRole('button', {name: 'Tentar de novo'})).toBeEnabled();
    expect(screen.getByRole('button', {name: 'Pular'})).toBeVisible();
  });
});

describe('DoneStep', () => {
  const image = {
    imagePath: '/Users/u/Downloads/fly-0.4.0-arm64.dmg',
    mountPoint: '/Volumes/fly',
  };

  it('shows the results and only Começar without an installer', async () => {
    vi.mocked(window.fly.setup.installer).mockResolvedValue(null);
    const onFinish = vi.fn();
    render(
      <DoneStep
        results={{tools: 'done', command: 'skipped'}}
        onFinish={onFinish}
      />,
    );
    expect(screen.getByText('Tudo pronto')).toBeVisible();
    expect(screen.getByText('Dependências').parentElement).toHaveTextContent(
      '✓',
    );
    expect(screen.getByText('Comando fly').parentElement).toHaveTextContent(
      'pulado',
    );
    await userEvent.click(await screen.findByRole('button', {name: 'Começar'}));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Apagar o instalador?')).toBeNull();
  });

  it('Mover para Lixeira trashes the installer then finishes', async () => {
    vi.mocked(window.fly.setup.installer).mockResolvedValue(image);
    vi.mocked(window.fly.setup.trashInstaller).mockResolvedValue(undefined);
    const onFinish = vi.fn();
    render(
      <DoneStep
        results={{tools: 'done', command: 'done'}}
        onFinish={onFinish}
      />,
    );
    expect(await screen.findByText('Apagar o instalador?')).toBeVisible();
    expect(
      screen.getByText(
        'fly-0.4.0-arm64.dmg em /Users/u/Downloads. O disco é ejetado e o arquivo vai para a Lixeira.',
      ),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', {name: 'Mover para Lixeira'}),
    );
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(window.fly.setup.trashInstaller).toHaveBeenCalledExactlyOnceWith(
      image.imagePath,
    );
  });

  it('Manter finishes without trashing', async () => {
    vi.mocked(window.fly.setup.installer).mockResolvedValue(image);
    const onFinish = vi.fn();
    render(
      <DoneStep
        results={{tools: 'done', command: 'done'}}
        onFinish={onFinish}
      />,
    );
    await userEvent.click(await screen.findByRole('button', {name: 'Manter'}));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(window.fly.setup.trashInstaller).not.toHaveBeenCalled();
  });

  it('keeps both buttons when the trash fails', async () => {
    vi.mocked(window.fly.setup.installer).mockResolvedValue(image);
    vi.mocked(window.fly.setup.trashInstaller).mockRejectedValue(
      new Error('Falha ao ejetar o instalador: busy'),
    );
    const onFinish = vi.fn();
    render(
      <DoneStep
        results={{tools: 'done', command: 'done'}}
        onFinish={onFinish}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', {name: 'Mover para Lixeira'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha ao ejetar o instalador: busy',
    );
    expect(screen.getByRole('button', {name: 'Manter'})).toBeEnabled();
    expect(
      screen.getByRole('button', {name: 'Mover para Lixeira'}),
    ).toBeEnabled();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('hides every button until the installer lookup has resolved', async () => {
    let resolve: (value: typeof image | null) => void = () => {};
    vi.mocked(window.fly.setup.installer).mockImplementation(
      () => new Promise(r => (resolve = r)),
    );
    render(
      <DoneStep
        results={{tools: 'done', command: 'done'}}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    resolve(image);
    expect(
      await screen.findByRole('button', {name: 'Mover para Lixeira'}),
    ).toBeVisible();
    expect(screen.queryByRole('button', {name: 'Começar'})).toBeNull();
  });

  it('offers only Começar when the installer lookup fails', async () => {
    vi.mocked(window.fly.setup.installer).mockRejectedValue(new Error('x'));
    const onFinish = vi.fn();
    render(
      <DoneStep
        results={{tools: 'done', command: 'done'}}
        onFinish={onFinish}
      />,
    );
    await userEvent.click(await screen.findByRole('button', {name: 'Começar'}));
    expect(onFinish).toHaveBeenCalled();
  });
});
