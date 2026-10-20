import {render, screen} from '@testing-library/react';

import {FooterBar} from '../../../src/application/ui/panels/footer-bar';

const counts = {ready: 2, working: 1, ci: 3, failed: 4};

describe('FooterBar', () => {
  it('Should render the counts with their labels', () => {
    render(<FooterBar counts={counts} message={null} />);
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
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'gh não autenticado — rode: gh auth login',
    );
  });
});
