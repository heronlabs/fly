import {render, screen} from '@testing-library/react';

import {
  StatusBadge,
  StatusDot,
} from '../../../src/application/ui/components/status-dot';
import type {QueueStatus} from '../../../src/core/domain/queue';

const table: [QueueStatus, string, string, string | null][] = [
  ['idle', 'var(--faint)', 'Parado', null],
  ['engineer', 'var(--info)', 'Agente rodando', 'eng'],
  ['waiting', 'var(--syTitle)', 'Esperando você', 'você'],
  ['ci', 'var(--warn)', 'CI rodando', 'CI'],
  ['failed', 'var(--err)', 'Falhou', 'falhou'],
  ['ready', 'var(--ok)', 'Pronto para merge', 'merge'],
  ['merged', 'var(--muted)', 'Merged', 'merged'],
  ['unknown', 'var(--faint)', 'Estado desconhecido', '?'],
];

describe('StatusDot', () => {
  it.each(table)('Should render %s', (status, color, title) => {
    render(<StatusDot status={status} />);
    const dot = screen.getByTitle(title);
    expect(dot.style.getPropertyValue('background')).toBe(color);
  });
});

describe('StatusBadge', () => {
  it.each(table)('Should render %s', (status, color, title, text) => {
    const {container} = render(<StatusBadge status={status} />);
    if (text === null) {
      expect(container).toBeEmptyDOMElement();
      return;
    }
    const badge = screen.getByRole('img', {name: title});
    expect(badge).toHaveTextContent(text);
    expect(badge.style.getPropertyValue('color')).toBe(color);
    expect(badge.style.getPropertyValue('background')).toBe('var(--surface)');
  });
});
