import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {FooterBar} from '../../../src/application/ui/panels/footer-bar';

const counts = {ready: 2, working: 1, ci: 3, failed: 4};

describe('FooterBar', () => {
  it('Should render the counts with their labels', () => {
    render(
      <FooterBar
        counts={counts}
        message={null}
        update={null}
        onDownload={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Esperando você').previousSibling,
    ).toHaveTextContent('2');
    expect(
      screen.getByText('Agente rodando').previousSibling,
    ).toHaveTextContent('1');
    expect(screen.getByText('CI').previousSibling).toHaveTextContent('3');
    expect(screen.getByText('Falhou').previousSibling).toHaveTextContent('4');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Should render the message with role status', () => {
    render(
      <FooterBar
        counts={counts}
        message="gh não autenticado — rode: gh auth login"
        update={null}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'gh não autenticado — rode: gh auth login',
    );
  });

  const notice = {
    version: '0.4.0',
    url: 'https://github.com/heronlabs/fly/releases/tag/v0.4.0',
  };

  it('Should render the update notice in the accent colour, right-aligned', () => {
    render(
      <FooterBar
        counts={counts}
        message={null}
        update={notice}
        onDownload={vi.fn()}
      />,
    );
    const text = screen.getByText('fly v0.4.0 disponível');
    expect(text).toHaveStyle({color: 'var(--accent)'});
    expect(text.parentElement).toHaveStyle({marginLeft: 'auto'});
    expect(screen.getByRole('button', {name: 'Baixar'})).toBeInTheDocument();
  });

  it('Should call onDownload with the release url on Baixar', async () => {
    const onDownload = vi.fn();
    render(
      <FooterBar
        counts={counts}
        message={null}
        update={notice}
        onDownload={onDownload}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', {name: 'Baixar'}));
    expect(onDownload).toHaveBeenCalledWith(notice.url);
  });

  it('Should render no notice when update is null', () => {
    render(
      <FooterBar
        counts={counts}
        message={null}
        update={null}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.queryByText(/disponível/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Baixar'})).toBeNull();
  });

  it('Should render the queue message and the notice together', () => {
    render(
      <FooterBar
        counts={counts}
        message="gh não autenticado"
        update={notice}
        onDownload={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('gh não autenticado');
    expect(screen.getByText('fly v0.4.0 disponível')).toBeInTheDocument();
  });
});
