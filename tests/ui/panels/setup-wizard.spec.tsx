import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {SetupWizard} from '../../../src/application/ui/panels/setup-wizard';
import type {SetupInfo} from '../../../src/core/domain/setup';

const info = (patch: Partial<SetupInfo> = {}): SetupInfo => ({
  packaged: true,
  inApplications: true,
  bundlePath: '/Applications/fly.app',
  open: true,
  ...patch,
});

const tool = (id: 'git' | 'gh' | 'tmux' | 'claude') => ({
  id,
  ok: true,
  version: '1',
  problem: null,
  fix: null,
});

beforeEach(() => {
  vi.mocked(window.fly.setup.doctor).mockResolvedValue({
    brew: true,
    tools: [tool('git'), tool('gh'), tool('tmux'), tool('claude')],
  });
  vi.mocked(window.fly.setup.commandState).mockResolvedValue('installed');
  vi.mocked(window.fly.setup.complete).mockResolvedValue(undefined);
});

describe('SetupWizard', () => {
  it('shows only the move screen outside Aplicativos', () => {
    render(
      <SetupWizard
        info={info({inApplications: false, bundlePath: '/Volumes/fly/fly.app'})}
        onDone={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Arraste o fly para Aplicativos e abra de lá.'),
    ).toBeVisible();
    expect(
      screen.getByText('O fly está rodando de /Volumes/fly/fly.app.'),
    ).toBeVisible();
    expect(screen.queryByText(/Passo/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(window.fly.setup.doctor).not.toHaveBeenCalled();
  });

  it('walks the three steps and completes at step 3', async () => {
    vi.mocked(window.fly.setup.installer).mockResolvedValue(null);
    const onDone = vi.fn();
    render(<SetupWizard info={info()} onDone={onDone} />);
    expect(screen.getByText('Passo 1 de 3')).toBeVisible();
    await userEvent.click(
      await screen.findByRole('button', {name: 'Continuar'}),
    );
    expect(screen.getByText('Passo 2 de 3')).toBeVisible();
    expect(window.fly.setup.complete).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', {name: 'Continuar'}),
    );
    expect(await screen.findByText('Passo 3 de 3')).toBeVisible();
    expect(window.fly.setup.complete).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', {name: 'Começar'}));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('records a skipped command on the last step', async () => {
    vi.mocked(window.fly.setup.commandState).mockResolvedValue('missing');
    vi.mocked(window.fly.setup.installCommand).mockRejectedValue(
      new Error('Instalação cancelada'),
    );
    vi.mocked(window.fly.setup.installer).mockResolvedValue(null);
    render(<SetupWizard info={info()} onDone={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Continuar'}),
    );
    await userEvent.click(
      await screen.findByRole('button', {name: 'Instalar e continuar'}),
    );
    await userEvent.click(await screen.findByRole('button', {name: 'Pular'}));
    expect(await screen.findByText('Passo 3 de 3')).toBeVisible();
    expect(screen.getByText('Comando fly').parentElement).toHaveTextContent(
      'pulado',
    );
  });

  it('shows a complete rejection on step 3 and still finishes', async () => {
    vi.mocked(window.fly.setup.complete).mockRejectedValue(
      new Error(
        "Error invoking remote method 'setup:complete': Error: disco cheio",
      ),
    );
    vi.mocked(window.fly.setup.installer).mockResolvedValue(null);
    const onDone = vi.fn();
    render(<SetupWizard info={info()} onDone={onDone} />);
    await userEvent.click(
      await screen.findByRole('button', {name: 'Continuar'}),
    );
    await userEvent.click(
      await screen.findByRole('button', {name: 'Continuar'}),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('disco cheio');
    await userEvent.click(await screen.findByRole('button', {name: 'Começar'}));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });
});
